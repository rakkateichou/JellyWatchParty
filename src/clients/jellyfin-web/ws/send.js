(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const actions = JWP.actions = JWP.actions || {};
  const state = JWP.state;
  const utils = JWP.utils;

  const p2pEligible = (type, payload) => {
    if (type === 'chat_message' || type === 'cursor_update') return true;
    return type === 'player_event' && payload?.action !== 'play';
  };

  const messageId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `${state.clientId || 'client'}-${utils.nowMs()}-${Math.random().toString(36).slice(2)}`;
  };

  const send = (type, payload = {}, roomOverride = null) => {
    if (!state.ws || state.ws.readyState !== 1) return;
    const directPayload = p2pEligible(type, payload)
      ? { ...payload, _jwp_message_id: payload._jwp_message_id || messageId() }
      : payload;
    const message = {
      type,
      room: roomOverride || state.roomId,
      payload: directPayload,
      ts: utils.nowMs()
    };
    if (state.clientId) message.client = state.clientId;
    // WebRTC is only an optimistic low-latency copy. The WebSocket send is
    // always retained so the server can validate, persist and fan out every
    // event when a direct route is unavailable.
    if (p2pEligible(type, directPayload) && JWP.p2p?.broadcast) {
      JWP.p2p.broadcast(message);
    }
    state.ws.send(JSON.stringify(message));
  };

  const createRoom = (password = '') => {
    const v = utils.getVideo();
    const mediaId = utils.getCurrentItemId();
    const userName = state.chatNickname
      || state.userName
      || window.ApiClient?._currentUser?.Name
      || 'Anonymous';
    const payload = {
      start_pos: v ? v.currentTime : 0,
      media_id: mediaId,
      user_name: userName
    };
    if (password) payload.password = password;
    send('create_room', payload);
  };

  const joinRoom = (id, password = '') => {
    state.roomId = id;
    const userName = state.chatNickname
      || state.userName
      || window.ApiClient?._currentUser?.Name
      || 'Anonymous';
    const payload = { user_name: userName };
    if (password) payload.password = password;
    send('join_room', payload, id);
  };

  const leaveRoom = () => {
    if (JWP.cursor && JWP.cursor.reset) JWP.cursor.reset();
    if (JWP.ui && JWP.ui.resetPreparedInvite) JWP.ui.resetPreparedInvite();
    send('leave_room');
    state.inRoom = false;
    state.roomId = '';
    state.roomHostId = '';
    state.roomMediaId = '';
    state.chatSettingsOpen = false;
    state.mediaChangeToken += 1;
    state.readyRoomId = '';
    state.isInitialSync = false;
    state.initialSyncUntil = 0;
    state.initialSyncTargetPos = 0;
    state.syncCooldownUntil = 0;
    state.syncStatus = 'synced';
    state.pendingPlayUntil = 0;
    state.currentDrift = 0;
    if (state.pendingActionTimer) {
      clearTimeout(state.pendingActionTimer);
      state.pendingActionTimer = null;
    }
    if (JWP.chat) JWP.chat.clear();
    if (JWP.p2p?.reset) JWP.p2p.reset();
    const panel = document.getElementById(JWP.constants.PANEL_ID);
    if (panel) panel.classList.add('hide');
  };

  Object.assign(actions, { send, createRoom, joinRoom, leaveRoom });
})();
