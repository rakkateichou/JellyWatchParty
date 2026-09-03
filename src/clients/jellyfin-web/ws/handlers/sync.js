(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const h = JWP._wsHandlers = JWP._wsHandlers || {};
  const state = JWP.state;
  const utils = JWP.utils;
  const ui = JWP.ui;
  const { SEEK_THRESHOLD } = JWP.constants;

  const positionServerTs = (msg) => {
    const payloadTs = Number(msg.payload?.sample_server_ts ?? msg.payload?.state_server_ts);
    const envelopeTs = Number(msg.server_ts);
    if (Number.isFinite(payloadTs)
        && (!Number.isFinite(envelopeTs) || Math.abs(payloadTs - envelopeTs) < 5000)) {
      return payloadTs;
    }
    return Number.isFinite(envelopeTs) ? envelopeTs : utils.getServerNow();
  };

  const applyRoomState = (msg) => {
    const previousRoomId = state.roomId;
    state.inRoom = true;
    state.roomId = msg.room;
    state.roomName = msg.payload.name;
    state.roomHostId = msg.payload.host_id || '';
    state.roomMediaId = msg.payload.media_id || state.roomMediaId || '';
    state.participantCount = msg.payload.participant_count;
    if (!state.clientId && msg.client) {
      state.clientId = msg.client;
    }
    state.isHost = (msg.payload.host_id === state.clientId);
    if (JWP.chat && Array.isArray(msg.payload.chat_history)) {
      JWP.chat.hydrate(msg.payload.chat_history);
    }
    if (!state.hasTimeSync && typeof msg.server_ts === 'number') {
      state.serverOffsetMs = msg.server_ts - utils.nowMs();
      state.hasTimeSync = true;
    }
    if (msg.payload && msg.payload.state) {
      state.lastSyncServerTs = positionServerTs(msg);
      state.lastSyncPosition = typeof msg.payload.state.position === 'number'
        ? msg.payload.state.position
        : 0;
      state.lastSyncPlayState = msg.payload.state.play_state || 'paused';
    }
    if (previousRoomId !== state.roomId && ui.resetPreparedInvite) {
      ui.resetPreparedInvite();
    }
    if (JWP.p2p?.syncPeers) {
      JWP.p2p.syncPeers(msg.payload.peer_ids || []);
    }

    // Invitations open directly into the room and reveal the right-side chat;
    // ordinary joins retain the user's existing panel preference.
    if (state.inviteJoinActive) {
      const panel = document.getElementById(JWP.constants.PANEL_ID);
      if (panel) panel.classList.remove('hide');
      state.inviteJoinActive = false;
    }
    if (JWP.guestLockdown?.enforceSoon) JWP.guestLockdown.enforceSoon(100);
  };

  const rememberRemoteState = (msg) => {
    const payload = msg.payload || {};
    const playbackState = payload.state || payload;
    state.lastSyncServerTs = positionServerTs(msg);
    state.lastSyncPosition = typeof playbackState.position === 'number'
      ? playbackState.position
      : 0;
    state.lastSyncPlayState = playbackState.play_state || 'paused';
  };

  const switchToMedia = (msg) => {
    if (state.isHost || !msg.payload?.media_id) return false;
    const mediaId = msg.payload.media_id;
    if (!/^[a-f0-9]{32}$/i.test(mediaId)) return false;

    const localId = utils.getCurrentItemId();
    if (state.roomMediaId === mediaId && localId === mediaId) return false;

    state.roomMediaId = mediaId;
    state.readyRoomId = '';
    state.isInitialSync = true;
    state.initialSyncUntil = utils.nowMs() + JWP.constants.INITIAL_SYNC_MAX_MS;
    rememberRemoteState(msg);
    const changeToken = ++state.mediaChangeToken;

    if (JWP.playback?.ensurePlayback) JWP.playback.ensurePlayback(mediaId);

    let attempts = 0;
    const settle = () => {
      if (changeToken !== state.mediaChangeToken || !state.inRoom) return;
      attempts += 1;
      const video = utils.getVideo();
      if (utils.getCurrentItemId() !== mediaId || !video || video.readyState < 2) {
        if (attempts < 100) setTimeout(settle, 150);
        else ui.showToast('Open the next episode to continue the watch party.');
        return;
      }

      const target = state.lastSyncPlayState === 'playing'
        ? utils.adjustedPosition(state.lastSyncPosition, state.lastSyncServerTs)
        : state.lastSyncPosition;
      utils.startSyncing();
      if (Math.abs(video.currentTime - target) > 0.35) video.currentTime = target;
      if (state.lastSyncPlayState === 'playing') {
        video.play().catch(() => ui.showToast('Tap Play to continue the watch party.'));
      } else if (!video.paused) {
        video.pause();
      }
      if (JWP.playback?.watchReady) JWP.playback.watchReady();
    };
    setTimeout(settle, 150);
    return true;
  };

  const syncToRoom = (msg, video) => {
    if (!video || state.isHost || !msg.payload?.state) return;
    const basePos = msg.payload.state.position || 0;
    const hostPlaying = msg.payload.state.play_state === 'playing';
    const targetPos = hostPlaying
      ? utils.adjustedPosition(basePos, positionServerTs(msg))
      : basePos;
    utils.log('CLIENT', {
      type: 'room_state',
      msg_pos: basePos,
      target_pos: targetPos,
      video_pos: video.currentTime,
      gap: targetPos - video.currentTime,
      play_state: msg.payload.state.play_state
    });
    utils.startSyncing();
    if (hostPlaying) {
      const { INITIAL_SYNC_COOLDOWN_MS, INITIAL_SYNC_MAX_MS } = JWP.constants;
      const now = utils.nowMs();
      state.isInitialSync = true;
      state.initialSyncUntil = now + INITIAL_SYNC_MAX_MS;
      state.syncCooldownUntil = now + INITIAL_SYNC_COOLDOWN_MS;
      state.initialSyncTargetPos = targetPos;
      utils.log('CLIENT', { type: 'initial_sync_started', cooldown: INITIAL_SYNC_COOLDOWN_MS, max: INITIAL_SYNC_MAX_MS, targetPos });
    }
    if (Math.abs(video.currentTime - targetPos) > SEEK_THRESHOLD) {
      video.currentTime = targetPos;
    }
    if (hostPlaying) {
      video.play().catch(() => {});
    } else if (msg.payload.state.play_state === 'paused') {
      video.pause();
    }
  };

  h.handleRoomState = (msg, video) => {
    applyRoomState(msg);
    ui.render();
    if (state.isHost && ui.prepareInviteLink) {
      ui.prepareInviteLink().catch(err => {
        console.warn('[JellyWatchParty] Invite pre-generation failed:', err);
      });
    }
    if (!state.isHost && msg.payload?.media_id) {
      if (switchToMedia(msg)) return;
    }
    syncToRoom(msg, video);
  };

  h.handleStateUpdate = (msg, video) => {
    if (state.isHost) return;
    if (msg.payload?.media_id && switchToMedia(msg)) return;
    if (!video) return;
    if (msg.payload) {
      state.lastSyncPlayState = msg.payload.play_state || state.lastSyncPlayState;
    }
    if (msg.payload.play_state === 'playing' && video.paused) {
      utils.startSyncing();
      video.play().catch(() => {});
      state.lastSyncServerTs = utils.getServerNow();
      state.lastSyncPosition = video.currentTime;
      state.syncCooldownUntil = utils.nowMs() + 2000;
      return;
    } else if (msg.payload.play_state === 'paused' && !video.paused) {
      utils.startSyncing();
      state.syncCooldownUntil = 0;
      state.isInitialSync = false;
      state.initialSyncUntil = 0;
      state.initialSyncTargetPos = 0;
      video.pause();
    }
    if (state.isBuffering || !utils.isVideoReady()) return;
    if (state.syncCooldownUntil && utils.nowMs() < state.syncCooldownUntil) {
      return;
    }
    if (msg.payload) {
      state.lastSyncServerTs = positionServerTs(msg);
      state.lastSyncPosition = typeof msg.payload.position === 'number'
        ? msg.payload.position
        : state.lastSyncPosition;
    }
  };
})();
