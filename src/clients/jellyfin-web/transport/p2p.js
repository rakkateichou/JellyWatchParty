(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  if (JWP.p2p) return;

  const state = JWP.state;
  const peers = new Map();
  let desiredPeers = new Set();
  const reconnectTimers = new Map();
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  };

  const supported = () => typeof window.RTCPeerConnection === 'function';

  const sendSignal = (target, signal) => {
    if (!state.inRoom || !target || !JWP.actions?.send) return;
    JWP.actions.send('rtc_signal', { target, signal });
  };

  const directTypeAllowed = (message) => {
    if (!message || !message.payload || typeof message.payload !== 'object') return false;
    if (message.type === 'chat_message') {
      return typeof message.payload.text === 'string'
        && message.payload.text.length > 0
        && message.payload.text.length <= 500;
    }
    if (message.type === 'cursor_update') return true;
    return message.type === 'player_event' && message.payload.action !== 'play';
  };

  const sendOnChannel = (entry, message) => {
    if (!entry?.channel || entry.channel.readyState !== 'open') return false;
    try {
      entry.channel.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.debug('[JellyWatchParty] P2P send fell back to WebSocket:', err.message);
      return false;
    }
  };

  const broadcast = (message, exceptPeerId = '') => {
    if (!state.inRoom || !directTypeAllowed(message)) return false;
    let sent = false;
    for (const [peerId, entry] of peers) {
      if (peerId !== exceptPeerId) sent = sendOnChannel(entry, message) || sent;
    }
    return sent;
  };

  const scheduleReconnect = (peerId) => {
    if (!state.isHost || !desiredPeers.has(peerId) || reconnectTimers.has(peerId)) return;
    const timer = setTimeout(() => {
      reconnectTimers.delete(peerId);
      if (state.isHost && desiredPeers.has(peerId) && !peers.has(peerId)) {
        createPeer(peerId, true).catch((err) => {
          console.debug('[JellyWatchParty] P2P retry failed; WebSocket remains active:', err.message);
        });
      }
    }, 5000);
    reconnectTimers.set(peerId, timer);
  };

  const removePeer = (peerId, reconnect = false) => {
    const entry = peers.get(peerId);
    peers.delete(peerId);
    if (entry) {
      try { entry.channel?.close(); } catch (err) {}
      try { entry.pc?.close(); } catch (err) {}
    }
    if (reconnect) scheduleReconnect(peerId);
  };

  const receiveDirect = (peerId, raw) => {
    if (typeof raw !== 'string' || raw.length > 65536) return;
    try {
      const message = JSON.parse(raw);
      if (!state.inRoom || message.room !== state.roomId || !directTypeAllowed(message)) return;

      // Guests only trust the room host for playback controls. The host only
      // accepts social traffic from guests, never guest playback commands.
      if (state.isHost) {
        if (message.type !== 'chat_message' && message.type !== 'cursor_update') return;
      } else if (peerId !== state.roomHostId) {
        return;
      }

      message.client = peerId;
      JWP.actions?.handleIncomingMessage?.(message, 'p2p');

      // A host-and-spokes topology avoids a mesh explosion. The host relays
      // guest chat/cursors to its other direct channels; the server copy is
      // still sent and deduplicated, so this remains reliable.
      if (state.isHost && (message.type === 'chat_message' || message.type === 'cursor_update')) {
        broadcast(message, peerId);
      }
    } catch (err) {
      console.debug('[JellyWatchParty] Ignored invalid P2P message:', err.message);
    }
  };

  const attachChannel = (peerId, entry, channel) => {
    entry.channel = channel;
    channel.onopen = () => console.log('[JellyWatchParty] P2P fast path connected:', peerId);
    channel.onmessage = (event) => receiveDirect(peerId, event.data);
    channel.onclose = () => {
      if (peers.get(peerId) === entry) removePeer(peerId, true);
    };
    channel.onerror = () => {};
  };

  const flushCandidates = async (entry) => {
    const queued = entry.pendingCandidates.splice(0);
    for (const candidate of queued) {
      try { await entry.pc.addIceCandidate(candidate); } catch (err) {
        console.debug('[JellyWatchParty] P2P candidate rejected:', err.message);
      }
    }
  };

  const createPeer = async (peerId, offerer) => {
    if (!supported() || !peerId || peerId === state.clientId || !desiredPeers.has(peerId)) return null;
    if (peers.has(peerId)) return peers.get(peerId);

    const pc = new window.RTCPeerConnection(RTC_CONFIG);
    const entry = { pc, channel: null, pendingCandidates: [] };
    peers.set(peerId, entry);

    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(peerId, { type: 'candidate', candidate: event.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(peerId, pc.connectionState === 'failed');
      }
    };
    pc.ondatachannel = (event) => attachChannel(peerId, entry, event.channel);

    if (offerer) {
      attachChannel(peerId, entry, pc.createDataChannel('jwp-live', { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(peerId, { type: 'offer', sdp: pc.localDescription });
    }
    return entry;
  };

  const handleSignalAsync = async (message) => {
    if (!supported() || !state.inRoom || message.room !== state.roomId) return;
    const peerId = message.client;
    const signal = message.payload?.signal;
    if (!peerId || !desiredPeers.has(peerId) || !signal?.type) return;

    if (signal.type === 'offer') {
      if (state.isHost || peerId !== state.roomHostId || !signal.sdp) return;
      removePeer(peerId, false);
      const entry = await createPeer(peerId, false);
      if (!entry) return;
      await entry.pc.setRemoteDescription(signal.sdp);
      await flushCandidates(entry);
      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
      sendSignal(peerId, { type: 'answer', sdp: entry.pc.localDescription });
      return;
    }

    const entry = peers.get(peerId);
    if (!entry) return;
    if (signal.type === 'answer' && state.isHost && signal.sdp) {
      await entry.pc.setRemoteDescription(signal.sdp);
      await flushCandidates(entry);
    } else if (signal.type === 'candidate' && signal.candidate) {
      if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(signal.candidate);
      else entry.pendingCandidates.push(signal.candidate);
    }
  };

  const handleSignal = (message) => {
    handleSignalAsync(message).catch((err) => {
      console.debug('[JellyWatchParty] P2P negotiation failed; using WebSocket:', err.message);
      if (message?.client) removePeer(message.client, state.isHost);
    });
  };

  const syncPeers = (peerIds) => {
    if (!supported() || !state.inRoom || !state.clientId) return;
    const roomPeers = Array.isArray(peerIds)
      ? peerIds.filter((id) => typeof id === 'string' && id !== state.clientId)
      : [];
    desiredPeers = state.isHost
      ? new Set(roomPeers)
      : new Set(roomPeers.filter((id) => id === state.roomHostId));

    for (const peerId of Array.from(peers.keys())) {
      if (!desiredPeers.has(peerId)) removePeer(peerId, false);
    }
    if (state.isHost) {
      for (const peerId of desiredPeers) {
        if (!peers.has(peerId)) {
          createPeer(peerId, true).catch((err) => {
            console.debug('[JellyWatchParty] P2P unavailable; using WebSocket:', err.message);
            removePeer(peerId, true);
          });
        }
      }
    }
  };

  const reset = () => {
    desiredPeers = new Set();
    for (const timer of reconnectTimers.values()) clearTimeout(timer);
    reconnectTimers.clear();
    for (const peerId of Array.from(peers.keys())) removePeer(peerId, false);
  };

  JWP.p2p = { broadcast, handleSignal, reset, syncPeers, supported };
})();
