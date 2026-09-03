(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const playback = JWP.playback = JWP.playback || {};
  const state = JWP.state;
  const utils = JWP.utils;
  const { TRACK_SWITCH_SUPPRESS_MS } = JWP.constants;
  const TRACK_APPLY_SETTLE_MS = 350;

  let settleHandler = null;
  let settleVideo = null;

  const clearSettleShortcut = () => {
    if (settleVideo && settleHandler) {
      settleVideo.removeEventListener('playing', settleHandler);
      settleVideo.removeEventListener('canplay', settleHandler);
    }
    settleVideo = null;
    settleHandler = null;
  };

  // Once a host's track-switch-triggered reload visibly settles, collapse the
  // suppression window back down to the normal short one instead of leaving
  // it open for the full safety-net duration.
  const armSettleShortcut = () => {
    const video = utils.getVideo();
    clearSettleShortcut();
    if (!video) return;
    settleVideo = video;
    settleHandler = () => {
      clearSettleShortcut();
      utils.startSyncing();
    };
    video.addEventListener('playing', settleHandler);
    video.addEventListener('canplay', settleHandler);
  };

  const normalizeIndex = (value, minimum) => {
    const index = Number(value);
    return Number.isInteger(index) && index >= minimum && index <= 10000
      ? index
      : null;
  };

  const getTrackSnapshot = (overrides = {}) => {
    const pm = utils.getPlaybackManager();
    if (!pm) return {};
    let audio = Object.prototype.hasOwnProperty.call(overrides, 'audio_stream_index')
      ? normalizeIndex(overrides.audio_stream_index, 0)
      : null;
    let subtitle = Object.prototype.hasOwnProperty.call(overrides, 'subtitle_stream_index')
      ? normalizeIndex(overrides.subtitle_stream_index, -1)
      : null;
    try {
      if (audio === null && typeof pm.getAudioStreamIndex === 'function') {
        audio = normalizeIndex(pm.getAudioStreamIndex(), 0);
      }
    } catch (err) {}
    try {
      if (subtitle === null && typeof pm.getSubtitleStreamIndex === 'function') {
        subtitle = normalizeIndex(pm.getSubtitleStreamIndex(), -1);
      }
    } catch (err) {}
    const snapshot = {};
    if (audio !== null) snapshot.audio_stream_index = audio;
    if (subtitle !== null) snapshot.subtitle_stream_index = subtitle;
    return snapshot;
  };

  const addTrackSnapshot = (payload) => Object.assign(payload, getTrackSnapshot());

  const publishHostTrackSnapshot = (overrides = {}) => {
    if (!state.isHost || !state.inRoom || !JWP.actions?.send) return;
    const video = utils.getVideo();
    const mediaId = utils.getCurrentItemId();
    const payload = {
      position: video?.currentTime || 0,
      play_state: video?.paused === false ? 'playing' : 'paused',
      media_id: mediaId,
      sample_server_ts: utils.getServerNow(),
      ...getTrackSnapshot(overrides)
    };
    JWP.actions.send('state_update', payload);
  };

  const applyInitialTracks = async (payload, mediaId) => {
    if (state.isHost || !state.inRoom || !mediaId) return false;
    const selection = payload?.state || payload || {};
    const desiredAudio = normalizeIndex(selection.audio_stream_index, 0);
    const desiredSubtitle = normalizeIndex(selection.subtitle_stream_index, -1);
    if (desiredAudio === null && desiredSubtitle === null) return false;

    // This is a room-entry handoff, not a room-wide preference. Once the
    // guest has inherited the initial selection, later choices stay local —
    // including across episode changes in the same room.
    const syncKey = state.roomId;
    if (state.initialTrackSyncKey === syncKey) return false;
    const pm = utils.getPlaybackManager();
    if (!pm) return false;

    const canApplyAudio = desiredAudio !== null
      && typeof pm.setAudioStreamIndex === 'function';
    const canApplySubtitle = desiredSubtitle !== null
      && typeof pm.setSubtitleStreamIndex === 'function';
    if (!canApplyAudio && !canApplySubtitle) return false;

    state.initialTrackSyncKey = syncKey;
    utils.startSyncing(TRACK_SWITCH_SUPPRESS_MS);
    let changed = false;
    try {
      if (canApplyAudio) {
        let currentAudio = null;
        try {
          currentAudio = typeof pm.getAudioStreamIndex === 'function'
            ? normalizeIndex(pm.getAudioStreamIndex(), 0)
            : null;
        } catch (err) {}
        if (currentAudio !== desiredAudio) {
          changed = true;
          await Promise.resolve(pm.setAudioStreamIndex(desiredAudio));
        }
      }
      if (canApplySubtitle) {
        let currentSubtitle = null;
        try {
          currentSubtitle = typeof pm.getSubtitleStreamIndex === 'function'
            ? normalizeIndex(pm.getSubtitleStreamIndex(), -1)
            : null;
        } catch (err) {}
        if (currentSubtitle !== desiredSubtitle) {
          changed = true;
          await Promise.resolve(pm.setSubtitleStreamIndex(desiredSubtitle));
        }
      }
      if (changed) {
        await new Promise(resolve => setTimeout(resolve, TRACK_APPLY_SETTLE_MS));
      }
      return changed;
    } catch (err) {
      state.initialTrackSyncKey = '';
      console.warn('[JellyWatchParty] Could not apply the initial track selection:', err);
      return false;
    }
  };

  const resetInitialTrackSync = () => {
    state.initialTrackSyncKey = '';
  };

  const patchMethod = (pm, methodName, snapshotField) => {
    const original = pm[methodName];
    if (typeof original !== 'function' || original.__jwpWrapped) return;
    const wrapped = function (...args) {
      if (state.isHost && state.inRoom) {
        utils.startSyncing(TRACK_SWITCH_SUPPRESS_MS);
        armSettleShortcut();
      }
      const result = original.apply(this, args);
      if (state.isHost && state.inRoom) {
        const overrides = { [snapshotField]: args[0] };
        setTimeout(() => publishHostTrackSnapshot(overrides), 0);
      }
      return result;
    };
    wrapped.__jwpWrapped = true;
    pm[methodName] = wrapped;
  };

  const patchTrackSwitching = () => {
    const pm = utils.getPlaybackManager();
    if (!pm || pm.__jwpTracksPatched) return;
    patchMethod(pm, 'setAudioStreamIndex', 'audio_stream_index');
    patchMethod(pm, 'setSubtitleStreamIndex', 'subtitle_stream_index');
    pm.__jwpTracksPatched = true;
  };

  Object.assign(playback, {
    patchTrackSwitching,
    getTrackSnapshot,
    addTrackSnapshot,
    publishHostTrackSnapshot,
    applyInitialTracks,
    resetInitialTrackSync
  });
})();
