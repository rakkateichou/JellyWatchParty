(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const actions = JWP.actions = JWP.actions || {};
  const state = JWP.state;
  const utils = JWP.utils;
  const ui = JWP.ui;
  const { DEFAULT_WS_URL, RECONNECT_BASE_MS, RECONNECT_MAX_MS, PING_INIT_MS, PING_STABLE_MS, PING_STABLE_AFTER } = JWP.constants;

  const CLIENT_ID_STORAGE_KEY = 'jwp_tab_client_id';
  let reconnectTimer = null;
  let connectionGeneration = 0;
  const recentMessageIds = new Map();
  const MESSAGE_ID_TTL_MS = 30000;

  const generateUuid = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const getPersistentClientId = () => {
    try {
      let id = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
      if (!id) {
        id = generateUuid();
        window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
      }
      return id;
    } catch (err) {
      if (!state.sessionOnlyClientId) state.sessionOnlyClientId = generateUuid();
      return state.sessionOnlyClientId;
    }
  };

  const withClientId = (baseUrl, clientId) => {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}client_id=${encodeURIComponent(clientId)}`;
  };

  const onWsOpen = (token) => {
    console.log('[JellyWatchParty] WebSocket connected');
    state.isConnecting = false;
    state.reconnectAttempts = 0;
    if (utils.flushLogBuffer) utils.flushLogBuffer();
    const authPayload = {};
    if (token) authPayload.token = token;
    if (state.userName) authPayload.user_name = state.userName;
    if (state.userId) authPayload.user_id = state.userId;
    if (Object.keys(authPayload).length > 0) {
      state.ws.send(JSON.stringify({ type: 'auth', payload: authPayload, ts: utils.nowMs() }));
    }
    actions.send('ping', { client_ts: utils.nowMs() });
    // Invite joins do not depend on the player being mounted. Joining here
    // gets the host's paused/playing position while Jellyfin constructs the
    // native player instead of adding another UI polling interval to startup.
    if (state.pendingJoinRoomId && actions.joinRoom) {
      const roomId = state.pendingJoinRoomId;
      if (actions.joinRoom(roomId)) state.pendingJoinRoomId = '';
    }
    schedulePing();
    ui.render();
  };

  const onWsClose = (e) => {
    console.log('[JellyWatchParty] WebSocket closed:', e.code, e.reason);
    state.isConnecting = false;
    state.successfulPings = 0;
    state.timeSyncSamples = [];
    state.hasTimeSync = false;
    state.serverOffsetMs = 0;
    state.authToken = null;
    state.readyRoomId = '';
    if (state.pendingActionTimer) clearTimeout(state.pendingActionTimer);
    state.pendingActionTimer = null;
    state.coordinatedPlayPending = false;
    state.coordinatedPlayRequestId = '';
    state.pendingPlayUntil = 0;
    state.syncStatus = 'unknown';
    state.coordinatedPlayStarting = false;
    if (state.inRoom && state.roomId && !state.guestClosedMessage) {
      state.reconnecting = true;
      state.pendingJoinRoomId = state.roomId;
      state.roomJoinPending = true;
      if (!state.isHost) {
        state.roomJoinActive = true;
        JWP.playback?.holdJoinPlayback?.();
      }
    }
    JWP.p2p?.reset?.();
    ui.render();
    if (state.autoReconnect && !state.isConnecting) {
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, state.reconnectAttempts),
        RECONNECT_MAX_MS
      );
      state.reconnectAttempts++;
      console.log(`[JellyWatchParty] Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts})`);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
    }
  };

  const isDuplicate = (msg) => {
    const id = msg?.payload?._jwp_message_id;
    if (!id || typeof id !== 'string') return false;
    const now = Date.now();
    for (const [knownId, seenAt] of recentMessageIds) {
      if (now - seenAt > MESSAGE_ID_TTL_MS) recentMessageIds.delete(knownId);
    }
    if (recentMessageIds.has(id)) return true;
    recentMessageIds.set(id, now);
    return false;
  };

  const handleIncomingMessage = (msg, source = 'ws') => {
    // Chat merges the direct copy with server-assigned IDs and reply snapshots.
    if (msg.type === 'chat_message') {
      if (msg.payload) JWP.chat?.receive(msg, source);
      return;
    }
    if (isDuplicate(msg)) return;
    const video = utils.getVideo();
    console.log(`[JellyWatchParty] Received (${source}):`, msg.type, msg);
    const h = JWP._wsHandlers;
    switch (msg.type) {
      case 'room_list': h.handleRoomList(msg); break;
      case 'client_hello': h.handleClientHello(msg); break;
      case 'room_state': h.handleRoomState(msg, video); break;
      case 'participants_update': h.handleParticipantsUpdate(msg); break;
      case 'client_left': h.handleClientLeft(msg); break;
      case 'room_closed': h.handleRoomClosed(msg); break;
      case 'host_changed': h.handleHostChanged(msg); break;
      case 'player_event': h.handlePlayerEvent(msg, video); break;
      case 'state_update': h.handleStateUpdate(msg, video); break;
      case 'pong': h.handlePong(msg); break;
      case 'cursor_update': if (JWP.cursor && msg.payload) JWP.cursor.receive(msg); break;
      case 'rtc_signal': if (JWP.p2p?.handleSignal) JWP.p2p.handleSignal(msg); break;
      case 'invite_update': h.handleInviteUpdate(msg); break;
      case 'error': h.handleError(msg); break;
    }
  };

  const connect = async () => {
    if (state.isConnecting) {
      console.log('[JellyWatchParty] Connection already in progress, skipping');
      return;
    }
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      console.log('[JellyWatchParty] Already connected, skipping');
      return;
    }
    state.isConnecting = true;
    const generation = ++connectionGeneration;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (state.ws) {
      state.ws.onclose = state.ws.onopen = state.ws.onmessage = state.ws.onerror = null;
      state.ws.close();
      state.ws = null;
    }
    let token = state.authToken;
    if (!token) {
      token = await actions.fetchAuthToken();
    }
    if (generation !== connectionGeneration) return;
    const wsUrl = state.wsUrl || DEFAULT_WS_URL;
    const fullWsUrl = withClientId(wsUrl, getPersistentClientId());
    console.log('[JellyWatchParty] Connecting to WebSocket:', fullWsUrl);
    // Only validate an explicit admin-configured URL - DEFAULT_WS_URL is derived
    // from the page's own location, so it's reachable by definition.
    const urlWarnings = state.wsUrl ? utils.validateWsUrl(state.wsUrl) : [];
    urlWarnings.forEach((w) => console.warn('[JellyWatchParty] WARNING:', w));
    if (urlWarnings.length > 0 && state.reconnectAttempts === 0 && ui && ui.showToast) {
      ui.showToast(`Session Server URL problem: ${urlWarnings[0]}`);
    }
    try {
      state.ws = new WebSocket(fullWsUrl);
    } catch (err) {
      console.error('[JellyWatchParty] Failed to create WebSocket:', err);
      state.isConnecting = false;
      return;
    }
    const socket = state.ws;
    state.ws.onopen = () => { if (state.ws === socket) onWsOpen(token); };
    state.ws.onerror = (err) => {
      console.error('[JellyWatchParty] WebSocket error:', err);
    };
    state.ws.onclose = e => { if (state.ws === socket) onWsClose(e); };
    state.ws.onmessage = (e) => {
      if (state.ws !== socket) return;
      try {
        const msg = JSON.parse(e.data);
        if (!state.inRoom || msg.room === state.roomId || !msg.room || msg.type === 'room_state') {
          handleIncomingMessage(msg, 'ws');
        }
      } catch (err) {
        console.error('[JellyWatchParty] Failed to parse message:', err.message, 'Data:', e.data?.substring?.(0, 100));
      }
    };
  };

  const schedulePing = () => {
    if (state.intervals.ping) clearInterval(state.intervals.ping);
    const interval = state.successfulPings >= PING_STABLE_AFTER
      ? PING_STABLE_MS
      : PING_INIT_MS;
    state.intervals.ping = setInterval(() => {
      if (state.ws && state.ws.readyState === 1) {
        actions.send('ping', { client_ts: utils.nowMs() });
      }
    }, interval);
  };

  const disconnect = () => {
    connectionGeneration++;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (state.ws) {
      state.ws.onclose = state.ws.onopen = state.ws.onmessage = state.ws.onerror = null;
      state.ws.close();
      state.ws = null;
    }
    state.isConnecting = false;
  };
  Object.assign(actions, { connect, disconnect, schedulePing, handleIncomingMessage });
})();
