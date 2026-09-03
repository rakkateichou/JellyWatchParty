(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const state = JWP.state;
  const ui = JWP.ui;
  const utils = JWP.utils;
  const playback = JWP.playback;
  const { UI_CHECK_MS, HOME_REFRESH_MS, SYNC_LOOP_MS } = JWP.constants;

  let panelStopPropagation = null;
  let hadVideoElement = false;

  const getInviteRoomId = () => {
    const match = (window.location.hash || '').match(/[?&]jwpRoom=([0-9a-f-]{36})(?:&|$)/i);
    if (!match) return '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match[1])
      ? match[1].toLowerCase()
      : '';
  };

  const setInviteLaunchScreen = (visible) => {
    document.documentElement?.classList?.toggle('jwp-invite-launching', !!visible);
  };

  const hasActiveVideo = (video = utils.getVideo()) => {
    if (!video) return false;
    if (playback?.isVideoPage) return playback.isVideoPage();
    return /^#\/(?:video|playback)(?:[/?]|$)/i.test(window.location.hash || '');
  };

  const beginInviteJoin = () => {
    const roomId = getInviteRoomId();
    if (!roomId) return;
    state.pendingJoinRoomId = roomId;
    state.inviteJoinActive = true;
    setInviteLaunchScreen(true);

    // Never strand a guest behind the launch screen if Jellyfin cannot start
    // playback automatically (for example, because a browser blocks autoplay).
    setTimeout(() => setInviteLaunchScreen(false), 25000);

    // Wait briefly for the room list, then start the exact media item the host
    // is playing. The public URL lands on a dedicated player route; on Jellyfin
    // builds that do not expose PlaybackManager, ensurePlayback briefly uses the
    // native details-page Play button behind the launch screen.
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const room = state.rooms.find(candidate => candidate.id === roomId);
      if (room?.media_id && playback?.ensurePlayback) {
        clearInterval(timer);
        playback.ensurePlayback(room.media_id);
        return;
      }
      const playButton = document.querySelector('.mainDetailButtons .btnPlay, .mainDetailButtons button[data-action="resume"], .mainDetailButtons button[data-action="play"]');
      if (playButton && (room || attempts >= 24)) {
        clearInterval(timer);
        playButton.click();
      } else if (attempts >= 80) {
        clearInterval(timer);
        setInviteLaunchScreen(false);
        ui.showToast('Tap Play to join the watch party.');
      }
    }, 125);
  };

  const clearAllIntervals = () => {
    if (state.intervals.ui) { clearInterval(state.intervals.ui); state.intervals.ui = null; }
    if (state.intervals.ping) { clearInterval(state.intervals.ping); state.intervals.ping = null; }
    if (state.intervals.home) { clearInterval(state.intervals.home); state.intervals.home = null; }
    if (state.intervals.sync) { clearInterval(state.intervals.sync); state.intervals.sync = null; }
    if (state.intervals.stateUpdate) { clearInterval(state.intervals.stateUpdate); state.intervals.stateUpdate = null; }
  };

  const onVideoPlayerExit = () => {
    console.log('[JellyWatchParty] Video player closed, cleaning up...');
    const panel = document.getElementById(JWP.constants.PANEL_ID);
    if (panel && !JWP.guestLockdown?.isRestricted?.()) panel.classList.add('hide');
    if (ui.updateDockedPlayerLayout) ui.updateDockedPlayerLayout();
    // Leaving the video route is not the same as leaving the room. Keep the
    // membership and chat alive across episode transitions and navigation;
    // Leave room in Settings is the explicit exit.
    if (JWP.cursor && JWP.cursor.reset) JWP.cursor.reset();
    if (JWP.playback && JWP.playback.cleanupVideoListeners) {
      JWP.playback.cleanupVideoListeners();
    }
    state.bound = false;
    if (JWP.guestLockdown?.isRestricted?.()) JWP.guestLockdown.enforceSoon(100);
  };

  const createPanel = () => {
    if (document.getElementById(JWP.constants.PANEL_ID)) return;
    const panel = document.createElement('div');
    panel.id = JWP.constants.PANEL_ID;
    panel.className = 'hide';
    document.body.appendChild(panel);
    panelStopPropagation = (e) => e.stopPropagation();
    panel.addEventListener('click', panelStopPropagation);
    panel.addEventListener('mousedown', panelStopPropagation);
    panel.addEventListener('keydown', panelStopPropagation);
    panel.addEventListener('keyup', panelStopPropagation);
    panel.addEventListener('keypress', panelStopPropagation);
  };

  const startIntervals = () => {
    state.intervals.ui = setInterval(() => {
      if (JWP.app?.disablePauseSplash) JWP.app.disablePauseSplash();
      if (document.visibilityState !== 'visible') return;
      const video = utils.getVideo();
      const activeVideo = hasActiveVideo(video);
      if (hadVideoElement && !activeVideo) {
        hadVideoElement = false;
        onVideoPlayerExit();
        return;
      }
      if (activeVideo) {
        hadVideoElement = true;
        setInviteLaunchScreen(false);
        ui.injectOsdButton();
        playback.bindVideo();
        if (playback.patchTrackSwitching) playback.patchTrackSwitching();
        if (state.pendingJoinRoomId) {
          console.log('[JellyWatchParty] Video detected, pendingJoinRoomId:', state.pendingJoinRoomId);
          if (JWP.actions && JWP.actions.joinRoom) {
            const roomId = state.pendingJoinRoomId;
            state.pendingJoinRoomId = '';
            setTimeout(() => {
              console.log('[JellyWatchParty] Auto-joining room:', roomId);
              const room = state.rooms.find(r => r.id === roomId);
              if (room && room.has_password && ui.promptJoinWithPassword) {
                // Ask up front instead of relying on the wrong_password
                // error-retry fallback for a room we already know needs one.
                ui.promptJoinWithPassword(roomId);
              } else {
                JWP.actions.joinRoom(roomId);
              }
            }, 500);
          }
        }
      }

      // Jellyfin is an SPA; header DOM is frequently replaced during navigation.
      // Keep a global launcher button present even when no video OSD exists.
      ui.injectGlobalButton();
      if (JWP.guestLockdown?.enforce) JWP.guestLockdown.enforce();
      if (ui.updateDockedPlayerLayout) ui.updateDockedPlayerLayout();
    }, UI_CHECK_MS);
    state.intervals.home = setInterval(() => {
      if (document.visibilityState === 'visible' && utils.isHomeView()) {
        ui.renderHomeWatchParties();
      }
    }, HOME_REFRESH_MS);
    state.intervals.sync = setInterval(() => {
      if (state.inRoom && !state.isHost) {
        playback.syncLoop();
      }
    }, SYNC_LOOP_MS);
  };

  const init = () => {
    if (state.initialized) {
      console.log('[JellyWatchParty] Already initialized, skipping');
      return;
    }
    state.initialized = true;
    console.log('%c JellyWatchParty Plugin Loaded (OSD Mode) ', 'background: #2e7d32; color: #fff; font-size: 12px; padding: 2px; border-radius: 2px;');
    clearAllIntervals();
    ui.injectStyles();
    if (JWP.app?.disablePauseSplash) JWP.app.disablePauseSplash();
    createPanel();
    if (JWP.cursor && JWP.cursor.bind) JWP.cursor.bind();
    if (JWP.actions && JWP.actions.connect) {
      console.log('[JellyWatchParty] Initiating WebSocket connection...');
      JWP.actions.connect();
    } else {
      console.error('[JellyWatchParty] JWP.actions.connect not available!');
    }
    if (JWP.guestLockdown?.init) JWP.guestLockdown.init();
    beginInviteJoin();
    startIntervals();
  };

  // Expose lifecycle internals for cleanup module
  JWP._lifecycle = {
    get panelStopPropagation() { return panelStopPropagation; },
    set panelStopPropagation(v) { panelStopPropagation = v; },
    get hadVideoElement() { return hadVideoElement; },
    set hadVideoElement(v) { hadVideoElement = v; },
    clearAllIntervals,
    onVideoPlayerExit,
    hasActiveVideo
  };

  JWP.app = JWP.app || {};
  Object.assign(JWP.app, { init });
})();
