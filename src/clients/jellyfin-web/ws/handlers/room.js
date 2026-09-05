(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const h = JWP._wsHandlers = JWP._wsHandlers || {};
  const state = JWP.state;
  const ui = JWP.ui;

  h.handleRoomList = (msg) => {
    state.rooms = msg.payload || [];
    if (!state.inRoom) ui.updateRoomListUI();
    ui.renderHomeWatchParties();
  };

  h.handleClientHello = (msg) => {
    if (msg.payload && msg.payload.client_id) {
      state.clientId = msg.payload.client_id;
      try { window.sessionStorage?.setItem('jwp_tab_client_id', state.clientId); } catch (_) {}
      ui.render();
    }
  };

  h.handleParticipantsUpdate = (msg) => {
    const wasHost = state.isHost;
    if (msg.payload?.host_id) state.roomHostId = msg.payload.host_id;
    state.isHost = state.roomHostId === state.clientId;
    state.participantCount = msg.payload.participant_count;
    if (JWP.p2p?.syncPeers) JWP.p2p.syncPeers(msg.payload?.peer_ids || []);
    if (state.inRoom) {
      const el = document.getElementById('jwp-participants-list');
      if (el) el.textContent = `${state.participantCount} online`;
    }
    if (state.lastParticipantCount && state.participantCount > state.lastParticipantCount) {
      ui.showToast('A participant joined the room');
    }
    state.lastParticipantCount = state.participantCount;
    if (wasHost !== state.isHost) ui.render(true);
  };

  h.handleInviteUpdate = (msg) => {
    const inviteUrl = msg.payload?.invite_url;
    if (!inviteUrl || msg.room !== state.roomId) return;
    state.inviteRoomId = state.roomId;
    state.inviteBaseUrl = inviteUrl;
    state.invitePromise = null;
  };

  h.handleClientLeft = (msg) => {
    if (msg.payload?.host_id) state.roomHostId = msg.payload.host_id;
    if (JWP.p2p?.syncPeers) JWP.p2p.syncPeers(msg.payload?.peer_ids || []);
    if (msg.payload?.participant_count !== undefined) {
      state.participantCount = msg.payload.participant_count;
      if (state.inRoom) {
        const el = document.getElementById('jwp-participants-list');
        if (el) el.textContent = `${state.participantCount} online`;
        ui.showToast('A participant left the room');
      }
      state.lastParticipantCount = state.participantCount;
    }
  };

  h.handleRoomClosed = (msg) => {
    JWP.guestLockdown?.endGuestSession?.(msg.payload?.reason || 'This room is closed. Ask the owner for a new invitation.');
    if (ui.resetPreparedInvite) ui.resetPreparedInvite();
    state.inRoom = false;
    state.roomId = '';
    state.roomHostId = '';
    state.isHost = false;
    state.isRoomOwner = false;
    state.roomMediaId = '';
    state.waitingForTitle = false;
    state.pendingJoinRoomId = '';
    state.inviteJoinActive = false;
    state.roomJoinPending = false;
    state.roomJoinActive = false;
    JWP.playback?.releaseJoinPlayback?.();
    JWP.app?.setJoinLaunchScreen?.(false);
    state.chatSettingsOpen = false;
    state.participantCount = 0;
    state.lastParticipantCount = 0;
    state.mediaChangeToken += 1;
    state.readyRoomId = '';
    state.isInitialSync = false;
    state.initialSyncUntil = 0;
    state.pendingPlayUntil = 0;
    state.coordinatedPlayPending = false;
    state.coordinatedPlayStarting = false;
    if (state.pendingActionTimer) {
      clearTimeout(state.pendingActionTimer);
      state.pendingActionTimer = null;
    }
    JWP.playback?.resetInitialTrackSync?.();
    JWP.chat?.clear?.();
    if (JWP.cursor && JWP.cursor.reset) JWP.cursor.reset();
    if (JWP.p2p?.reset) JWP.p2p.reset();
    const reason = msg.payload?.reason || 'The room was closed';
    ui.showToast(reason);
    ui.render();
  };

  h.handleHostChanged = (msg) => {
    if (!msg.payload) return;
    const wasHost = state.isHost;
    state.roomHostId = msg.payload.host_id || '';
    state.isHost = (msg.payload.host_id === state.clientId);
    if (JWP.p2p?.syncPeers) JWP.p2p.syncPeers(msg.payload.peer_ids || []);
    if (msg.payload.participant_count !== undefined) {
      state.participantCount = msg.payload.participant_count;
    }
    if (state.isHost && !wasHost) {
      ui.showToast('You are now the host');
      if (!state.guestMode && ui.prepareInviteLink) {
        ui.prepareInviteLink().catch(err => {
          console.warn('[JellyWatchParty] Invite pre-generation failed after host change:', err);
        });
      }
    } else if (!state.isHost) {
      ui.showToast(`${msg.payload.host_name || 'Someone'} is now the host`);
    }
    // Force a full re-render: the fast-render path only checks
    // state.inRoom, not state.isHost, so host-only UI such as Copy link
    // won't otherwise flip.
    ui.render(true);
  };

  h.handleError = (msg) => {
    const message = msg.payload?.message || 'Unknown error';
    console.error('[JellyWatchParty] Server error:', message);
    if (state.inRoom && !state.reconnecting && !state.roomJoinPending && !state.pendingJoinRoomId && !state.inviteJoinActive) {
      ui.showToast(message);
      return;
    }
    JWP.guestLockdown?.endGuestSession?.(message);
    state.roomJoinPending = false;
    state.pendingJoinRoomId = '';
    state.inviteJoinActive = false;
    state.roomJoinActive = false;
    JWP.playback?.releaseJoinPlayback?.();
    JWP.app?.setJoinLaunchScreen?.(false);
    ui.showToast(message);
    ui.render(true);
  };
})();
