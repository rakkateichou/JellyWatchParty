(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const playback = JWP.playback = JWP.playback || {};
  const state = JWP.state;
  const utils = JWP.utils;
  const { STATE_UPDATE_MS, SEEK_THRESHOLD } = JWP.constants;

  const sendStateUpdate = (video) => {
    const actions = JWP.actions;
    if (!state.isHost || !actions || !actions.send) return;
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
    if (action === 'play' && state.coordinatedPlayStarting) {
      state.coordinatedPlayStarting = false;
      return;
    }
    if (action === 'pause' && state.coordinatedPlayPending) return;
    if (action === 'play' && state.coordinatedPlayPending) {
      if (!video.paused) video.pause();
      return;
    }
    if (!state.isHost || !actions || !actions.send || !utils.shouldSend()) return;
    if (state.isSyncing) return;
    if (action === 'seek' && !utils.isVideoReady()) return;
    if (action === 'pause') {
      if (state.isBuffering) return;
      if (utils.isSeeking()) return;
      state.wantsToPlay = false;
    }
    if (action === 'play') {
      if (utils.isSeeking()) return;
      state.wantsToPlay = true;
      // Jellyfin starts the host immediately. Hold it on the exact frame that
      // was requested until the server gives every participant one common
      // future start time. The resulting synthetic Pause event is ignored by
      // the coordinatedPlayPending guard above.
      state.coordinatedPlayPending = true;
      if (!video.paused) video.pause();
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
    const eventSent = actions.send('player_event', payload);
    if (action === 'play' && eventSent === false) {
      // Do not strand the host on a paused frame if the room connection drops
      // at the exact moment they resume.
      state.coordinatedPlayPending = false;
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
        state.coordinatedPlayStarting = false;
        const wasBuffering = state.isBuffering;
        state.isBuffering = false;
        if (wasBuffering) {
          utils.log('VIDEO', { event: 'playing', pos: video.currentTime });
          if (state.isHost && JWP.actions && JWP.actions.send) {
            JWP.actions.send('player_event', { action: 'play', position: video.currentTime });
          }
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

  Object.assign(playback, { bindVideo, cleanupVideoListeners, onHostEvent });
})();
