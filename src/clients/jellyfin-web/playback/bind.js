(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const playback = JWP.playback = JWP.playback || {};
  const state = JWP.state;
  const utils = JWP.utils;
  const { STATE_UPDATE_MS, SEEK_THRESHOLD } = JWP.constants;
  let syntheticPauses = 0;
  let playRequestNumber = 0;
  let scheduledStartPlayed = false;

  const holdHost = (video) => {
    if (!video.paused) {
      syntheticPauses += 1;
      video.pause();
    }
  };

  const cancelCoordinatedPlay = (video = utils.getVideo()) => {
    if (!state.inRoom || !state.isHost || !state.coordinatedPlayPending || !video) return false;
    state.coordinatedPlayPending = false;
    state.coordinatedPlayStarting = false;
    scheduledStartPlayed = false;
    state.coordinatedPlayRequestId = '';
    state.wantsToPlay = false;
    state.pendingPlayUntil = 0;
    state.syncStatus = 'synced';
    if (state.pendingActionTimer) clearTimeout(state.pendingActionTimer);
    state.pendingActionTimer = null;
    holdHost(video);
    JWP.actions?.send?.('player_event', {
      action: 'pause', position: video.currentTime, play_state: 'paused',
      media_id: utils.getCurrentItemId(), sample_server_ts: utils.getServerNow(),
      coordinated_cancel: true
    });
    JWP.ui?.updateSyncIndicator?.();
    return true;
  };

  const sendStateUpdate = (video) => {
    const actions = JWP.actions;
    if (!state.inRoom || !state.isHost || !actions || !actions.send) return;
    if (state.coordinatedPlayPending) return;
    if (state.isSyncing) return;
    if (utils.isSeeking()) return;
    if (state.isBuffering || !utils.isVideoReady()) return;
    const now = utils.nowMs();
    if (now - state.lastStateSentAt < STATE_UPDATE_MS) return;
    state.lastStateSentAt = now;
    const mediaId = utils.getCurrentItemId();
    if (mediaId) state.roomMediaId = mediaId;
    const position = video.currentTime;
    const sampleServerTs = utils.getServerNow();
    const payload = {
      position,
      play_state: video.paused ? 'paused' : 'playing',
      media_id: mediaId,
      sample_server_ts: sampleServerTs
    };
    playback.addTrackSnapshot?.(payload);
    actions.send('state_update', payload);
  };

  const onHostEvent = (action, video) => {
    const actions = JWP.actions;
    if (action === 'pause' && syntheticPauses > 0) { syntheticPauses -= 1; return; }
    if (!state.inRoom || !state.isHost) return;
    if (action === 'play' && state.coordinatedPlayStarting) {
      scheduledStartPlayed = true;
      state.coordinatedPlayStarting = false;
      return;
    }
    if ((action === 'play' || action === 'pause') && state.coordinatedPlayPending) {
      cancelCoordinatedPlay(video);
      return;
    }
    if (!state.isHost || !actions || !actions.send || !utils.shouldSend()) return;
    if (state.isSyncing) return;
    if (action === 'seek' && !utils.isVideoReady()) return;
    if (action === 'pause') {
      if (state.isBuffering) return;
      if (utils.isSeeking()) return;
      state.wantsToPlay = false;
      scheduledStartPlayed = false;
      state.coordinatedPlayRequestId = '';
    }
    if (action === 'play') {
      if (utils.isSeeking()) return;
      state.wantsToPlay = true;
      // Jellyfin starts the host immediately. Hold it on the exact frame that
      // was requested until the server gives every participant one common
      // future start time. The resulting synthetic Pause event is ignored by
      // the synthetic-pause counter above, so a real second click can cancel.
      state.coordinatedPlayPending = true;
      state.coordinatedPlayRequestId = `${state.clientId || 'host'}-${utils.nowMs()}-${++playRequestNumber}`;
      state.pendingPlayUntil = 0;
      state.syncStatus = 'pending_play';
      holdHost(video);
      JWP.ui?.updateSyncIndicator?.();
    }
    if (action === 'seek') {
      const now = utils.nowMs();
      if (now - state.lastSeekSentAt < 250) return;
      if (Math.abs(video.currentTime - state.lastSentPosition) < SEEK_THRESHOLD) return;
      state.lastSeekSentAt = now;
      state.lastSentPosition = video.currentTime;
    }
    const position = video.currentTime;
    const sampleServerTs = utils.getServerNow();
    utils.log('HOST', { action, pos: position, paused: video.paused });
    const mediaId = utils.getCurrentItemId();
    if (mediaId) state.roomMediaId = mediaId;
    const payload = {
      action,
      position,
      play_state: video.paused ? 'paused' : 'playing',
      media_id: mediaId,
      sample_server_ts: sampleServerTs
    };
    playback.addTrackSnapshot?.(payload);
    if (action === 'play') payload.request_id = state.coordinatedPlayRequestId;
    const eventSent = actions.send('player_event', payload);
    if (action === 'play' && eventSent === false) {
      // Do not strand the host on a paused frame if the room connection drops
      // at the exact moment they resume.
      state.coordinatedPlayPending = false;
      state.coordinatedPlayRequestId = '';
      state.syncStatus = 'synced';
      JWP.ui?.updateSyncIndicator?.();
      state.coordinatedPlayStarting = true;
      video.play().catch(() => {
        state.coordinatedPlayStarting = false;
      });
      return;
    }
    // A coordinated Play is already stored and rebroadcast by the server.
    // Sending the host's temporary local Pause as a second state snapshot can
    // race that command and incorrectly mark the room paused again.
    if (action === 'pause' || action === 'seek') {
      const statePayload = {
        position,
        play_state: video.paused ? 'paused' : 'playing',
        media_id: mediaId,
        sample_server_ts: sampleServerTs
      };
      playback.addTrackSnapshot?.(statePayload);
      actions.send('state_update', statePayload);
      state.lastStateSentAt = utils.nowMs();
    }
  };

  const createVideoListeners = (video) => {
    return {
      waiting: () => {
        // A Play can queue Waiting before our listener holds the video. That
        // stale event must not tell the room to pause an upcoming shared start.
        if (video.paused) return;
        state.isBuffering = true;
        utils.log('VIDEO', { event: 'buffering', pos: video.currentTime, readyState: video.readyState });
        if (state.isHost && JWP.actions && JWP.actions.send) {
          JWP.actions.send('player_event', { action: 'buffering', position: video.currentTime });
        }
      },
      canplay: () => {
        const wasBuffering = state.isBuffering;
        state.isBuffering = false;
        if (wasBuffering) utils.log('VIDEO', { event: 'ready', pos: video.currentTime, readyState: video.readyState });
      },
      playing: () => {
        // HTML queues Play and Playing together for buffered media. Holding
        // the host inside Play queues Pause *after* that Playing event. Keep
        // the synthetic-pause count until Pause consumes it, and ignore a
        // Playing notification whose video has already been paused.
        if (video.paused) return;
        const wasScheduled = scheduledStartPlayed || state.coordinatedPlayPending;
        scheduledStartPlayed = false;
        state.coordinatedPlayStarting = false;
        const wasBuffering = state.isBuffering;
        state.isBuffering = false;
        if (wasBuffering) {
          utils.log('VIDEO', { event: 'playing', pos: video.currentTime });
          // Buffer recovery needs a shared resume only when it was not already
          // the result of one; otherwise each start can schedule another one.
          if (state.isHost && !wasScheduled) onHostEvent('play', video);
        }
      },
      play: () => onHostEvent('play', video),
      pause: () => onHostEvent('pause', video),
      seeked: () => {
        utils.log('VIDEO', { event: 'seeked', pos: video.currentTime });
        onHostEvent('seek', video);
      }
    };
  };

  const bindVideo = () => {
    const video = utils.getVideo();
    if (!video) return;
    if (state.bound && state.currentVideoElement !== video) {
      cleanupVideoListeners();
      state.bound = false;
    }
    if (state.bound) return;
    state.bound = true;
    state.currentVideoElement = video;
    const listeners = createVideoListeners(video);
    state.videoListeners = listeners;
    video.addEventListener('waiting', listeners.waiting);
    video.addEventListener('canplay', listeners.canplay);
    video.addEventListener('playing', listeners.playing);
    video.addEventListener('play', listeners.play);
    video.addEventListener('pause', listeners.pause);
    video.addEventListener('seeked', listeners.seeked);
    if (state.intervals.stateUpdate) {
      clearInterval(state.intervals.stateUpdate);
    }
    state.intervals.stateUpdate = setInterval(() => {
      if (state.isHost) sendStateUpdate(video);
    }, STATE_UPDATE_MS);
  };

  const cleanupVideoListeners = () => {
    syntheticPauses = 0;
    scheduledStartPlayed = false;
    state.coordinatedPlayPending = false;
    state.coordinatedPlayStarting = false;
    state.coordinatedPlayRequestId = '';
    state.pendingPlayUntil = 0;
    if (state.pendingActionTimer) clearTimeout(state.pendingActionTimer);
    state.pendingActionTimer = null;
    if (state.syncStatus === 'pending_play') state.syncStatus = 'synced';
    JWP.ui?.updateSyncIndicator?.();
    if (state.currentVideoElement && state.videoListeners) {
      const video = state.currentVideoElement;
      const listeners = state.videoListeners;
      video.removeEventListener('waiting', listeners.waiting);
      video.removeEventListener('canplay', listeners.canplay);
      video.removeEventListener('playing', listeners.playing);
      video.removeEventListener('play', listeners.play);
      video.removeEventListener('pause', listeners.pause);
      video.removeEventListener('seeked', listeners.seeked);
    }
    if (state.intervals.stateUpdate) {
      clearInterval(state.intervals.stateUpdate);
      state.intervals.stateUpdate = null;
    }
    state.videoListeners = null;
    state.currentVideoElement = null;
  };

  Object.assign(playback, { bindVideo, cleanupVideoListeners, onHostEvent, cancelCoordinatedPlay });
})();
