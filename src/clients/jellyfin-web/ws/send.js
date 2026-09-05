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
    if (!state.ws || state.ws.readyState !== 1) return false;
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
    return true;
  };

  const createRoom = () => {
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
    JWP.playback?.addTrackSnapshot?.(payload);
    send('create_room', payload);
  };

  const joinRoom = (id) => {
    JWP.playback?.resetInitialTrackSync?.();
    state.roomId = id;
    // Invite links already launch playback before joining. A normal lobby/card
    // join waits for room_state so we can distinguish the host from a follower
    // and only move followers into the dedicated player layout.
    state.roomJoinPending = !state.inviteJoinActive && !state.pendingJoinRoomId;
    const userName = state.chatNickname
      || state.userName
      || window.ApiClient?._currentUser?.Name
      || 'Anonymous';
    const sent = send('join_room', { user_name: userName }, id);
    if (!sent) state.roomJoinPending = false;
    return sent;
  };

  const leaveRoom = () => {
    JWP.guestLockdown?.endGuestSession?.('You left this room. Open an invitation to join again.');
    if (JWP.cursor && JWP.cursor.reset) JWP.cursor.reset();
    if (JWP.ui && JWP.ui.resetPreparedInvite) JWP.ui.resetPreparedInvite();
    send('leave_room');
    state.inRoom = false;
    state.roomId = '';
    state.roomHostId = '';
    state.isRoomOwner = false;
    state.roomMediaId = '';
    state.waitingForTitle = false;
    state.pendingJoinRoomId = '';
    state.inviteJoinActive = false;
    JWP.ui?.updateWaitingRoom?.();
    state.roomJoinPending = false;
    state.roomJoinActive = false;
    JWP.playback?.releaseJoinPlayback?.();
    JWP.app?.setJoinLaunchScreen?.(false);
    state.chatSettingsOpen = false;
    state.mediaChangeToken += 1;
    state.readyRoomId = '';
    state.isInitialSync = false;
    state.initialSyncUntil = 0;
    state.initialSyncTargetPos = 0;
    state.syncCooldownUntil = 0;
    state.syncStatus = 'synced';
    state.pendingPlayUntil = 0;
    state.coordinatedPlayPending = false;
    state.coordinatedPlayStarting = false;
    state.currentDrift = 0;
    JWP.playback?.resetInitialTrackSync?.();
    if (state.pendingActionTimer) {
      clearTimeout(state.pendingActionTimer);
      state.pendingActionTimer = null;
    }
    if (JWP.chat) JWP.chat.clear();
    if (JWP.p2p?.reset) JWP.p2p.reset();
    const panel = document.getElementById(JWP.constants.PANEL_ID);
    if (panel) panel.classList.add('hide');
    JWP.ui?.render?.(true);
  };

  const deleteRoom = () => {
    if (!state.inRoom || !state.roomId) return false;
    if (!state.isRoomOwner) {
      JWP.ui?.showToast?.('Only the room owner can delete this room');
      return false;
    }
    send('delete_room');
    return true;
  };

  Object.assign(actions, { send, createRoom, joinRoom, leaveRoom, deleteRoom });
})();
