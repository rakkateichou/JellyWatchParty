(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const h = JWP._wsHandlers = JWP._wsHandlers || {};
  const state = JWP.state;
  const utils = JWP.utils;
  const ui = JWP.ui;
  const { SEEK_THRESHOLD, DRIFT_CORRECTION_ENTER_SEC } = JWP.constants;

  const positionServerTs = (msg) => {
    const sampleTs = Number(msg.payload?.sample_server_ts);
    const envelopeTs = Number(msg.server_ts);
    if (Number.isFinite(sampleTs)
        && (!Number.isFinite(envelopeTs) || Math.abs(sampleTs - envelopeTs) < 5000)) {
      return sampleTs;
    }
    return Number.isFinite(envelopeTs) ? envelopeTs : utils.getServerNow();
  };

  const handlePlayerPlay = (msg, video) => {
    const targetTs = msg.payload.target_server_ts || msg.server_ts || utils.getServerNow();
    state.lastSyncPlayState = 'playing';
    state.lastSyncServerTs = targetTs;
    state.lastSyncPosition = msg.payload.position;
    state.syncCooldownUntil = utils.nowMs() + 2000;
    if (targetTs && targetTs > utils.getServerNow()) {
      state.syncStatus = 'pending_play';
      state.pendingPlayUntil = targetTs;
      if (ui.updateSyncIndicator) ui.updateSyncIndicator();
      utils.scheduleAt(targetTs, () => {
        state.syncStatus = 'syncing';
        state.pendingPlayUntil = 0;
        if (ui.updateSyncIndicator) ui.updateSyncIndicator();
        if (state.isHost) {
          state.coordinatedPlayPending = false;
          state.coordinatedPlayStarting = true;
        }
        video.play().catch(() => {
          if (state.isHost) state.coordinatedPlayStarting = false;
        });
      });
    } else {
      state.syncStatus = 'syncing';
      if (ui.updateSyncIndicator) ui.updateSyncIndicator();
      if (state.isHost) {
        state.coordinatedPlayPending = false;
        state.coordinatedPlayStarting = true;
      }
      video.play().catch(() => {
        if (state.isHost) state.coordinatedPlayStarting = false;
      });
    }
    if (!state.isHost) ui.showToast('Host resumed playback');
  };

  const handlePlayerPause = (msg, video) => {
    state.lastSyncPlayState = 'paused';
    state.syncCooldownUntil = 0;
    state.isInitialSync = false;
    state.initialSyncUntil = 0;
    state.initialSyncTargetPos = 0;
    state.syncStatus = 'synced';
    state.pendingPlayUntil = 0;
    if (state.pendingActionTimer) {
      clearTimeout(state.pendingActionTimer);
      state.pendingActionTimer = null;
    }
    if (ui.updateSyncIndicator) ui.updateSyncIndicator();
    video.pause();
    ui.showToast('Host paused playback');
  };

  const handlePlayerSeek = (msg, video, sampleTs) => {
    const hostPlayState = msg.payload.play_state || 'paused';
    state.lastSyncPlayState = hostPlayState;
    state.lastSyncServerTs = sampleTs;
    state.lastSyncPosition = msg.payload.position;
    if (hostPlayState === 'playing') {
      state.syncCooldownUntil = utils.nowMs() + 2000;
      video.play().catch(() => {});
    }
  };

  const handlePlayerBuffering = (msg, video) => {
    state.lastSyncPlayState = 'paused';
    state.pendingPlayUntil = 0;
    if (state.pendingActionTimer) {
      clearTimeout(state.pendingActionTimer);
      state.pendingActionTimer = null;
    }
    if (state.syncStatus === 'pending_play') {
      state.syncStatus = 'syncing';
      if (ui.updateSyncIndicator) ui.updateSyncIndicator();
    }
    video.pause();
  };

  h.handlePlayerEvent = (msg, video) => {
    const coordinated = msg.payload?.coordinated === true;
    if (!video || (state.isHost && !coordinated)) return;
    if (!state.isHost) utils.startSyncing();
    if (msg.payload && typeof msg.payload.position === 'number') {
      const action = msg.payload.action;
      const sampleTs = positionServerTs(msg);
      const shouldAdvance = action === 'seek' && msg.payload.play_state === 'playing';
      const targetPos = shouldAdvance
        ? utils.adjustedPosition(msg.payload.position, sampleTs)
        : msg.payload.position;
      const gap = targetPos - video.currentTime;
      utils.log('CLIENT', {
        action,
        msg_pos: msg.payload.position,
        target_pos: targetPos,
        video_pos: video.currentTime,
        gap
      });
      const alignThreshold = (action === 'play' || action === 'pause' || action === 'buffering')
        ? DRIFT_CORRECTION_ENTER_SEC
        : SEEK_THRESHOLD;
      if (Math.abs(gap) > alignThreshold) {
        video.pause();
        video.currentTime = targetPos;
      }
      state.lastSyncServerTs = sampleTs;
      state.lastSyncPosition = msg.payload.position;
    }
    if (msg.payload) {
      switch (msg.payload.action) {
        case 'play': handlePlayerPlay(msg, video); break;
        case 'pause': handlePlayerPause(msg, video); break;
        case 'seek': handlePlayerSeek(msg, video, positionServerTs(msg)); break;
        case 'buffering': handlePlayerBuffering(msg, video); break;
      }
    }
  };
})();
