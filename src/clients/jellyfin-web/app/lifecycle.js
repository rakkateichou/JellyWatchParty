(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const state = JWP.state;
  const ui = JWP.ui;
  const utils = JWP.utils;
  const playback = JWP.playback;
  const { UI_CHECK_MS, HOME_REFRESH_MS, SYNC_LOOP_MS } = JWP.constants;

  let panelStopPropagation = null;
  let hadVideoElement = false;
  let joinLaunchTimer = null;
  let inviteRefreshAt = 0;

  const getInviteRoomId = () => {
    const match = (window.location.hash || '').match(/[?&]jwpRoom=([0-9a-f-]{36})(?:&|$)/i);
    if (!match) return '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match[1])
      ? match[1].toLowerCase()
      : '';
  };

  const getInviteMediaId = () => {
    const match = (window.location.hash || '').match(/[?&]jwpMedia=([a-f0-9-]{32,36})(?:&|$)/i);
    return utils.normalizeItemId?.(match?.[1]) || '';
  };

  const setJoinLaunchScreen = (visible) => {
    const alreadyVisible = document.documentElement?.classList?.contains?.('jwp-invite-launching');
    if (visible && alreadyVisible && joinLaunchTimer) return;
    if (joinLaunchTimer) {
      clearTimeout(joinLaunchTimer);
      joinLaunchTimer = null;
    }
    document.documentElement?.classList?.toggle('jwp-invite-launching', !!visible);
    document.documentElement?.classList?.toggle('jwp-join-chat', !!visible);
    document.documentElement?.classList?.remove('jwp-invite-booting');
    if (visible) document.getElementById(JWP.constants.PANEL_ID)?.classList.remove('hide');
    if (visible) {
      joinLaunchTimer = setTimeout(() => {
        joinLaunchTimer = null;
        if (!JWP.guestLockdown?.isRestricted?.()) {
          document.documentElement?.classList?.toggle('jwp-invite-launching', false);
          document.documentElement?.classList?.toggle('jwp-join-chat', false);
        }
        // Keep playback held even after the cover's time limit. The native
        // player can show its own loading UI, but must not run from 0:00 while
        // room state is still being reconciled.
        ui.showToast?.('Still syncing with the host…');
      }, 7000);
    }
  };

  const hasActiveVideo = (video = utils.getVideo()) => {
    if (!video) return false;
    if (playback?.isVideoPage) return playback.isVideoPage();
    return /^#\/(?:video|playback)(?:[/?]|$)/i.test(window.location.hash || '');
  };

  const beginInviteJoin = (restoredRoomId = '', restoredMediaId = '') => {
    const roomId = getInviteRoomId() || restoredRoomId || state.guestRoomId;
    if (state.guestClosedMessage) {
      setJoinLaunchScreen(false);
      ui.render(true);
      return;
    }
    if (!roomId) return;
    const inviteMediaId = getInviteMediaId() || utils.normalizeItemId?.(restoredMediaId) || '';
    state.pendingJoinRoomId = roomId;
    state.inviteJoinActive = true;
    state.roomJoinActive = true;
    playback?.holdJoinPlayback?.();
    setJoinLaunchScreen(true);
    ui.render(true);
    if (state.ws?.readyState === 1 && JWP.actions?.joinRoom?.(roomId)) state.pendingJoinRoomId = '';

    // The signed invite already contains the validated episode id. Launch it
    // immediately so Jellyfin can create a native playback session even if the
    // WebSocket room list has not arrived yet. Room state below remains the
    // authority and will replace this hint if the host changed episodes.
    if (inviteMediaId && playback?.ensurePlayback) {
      state.roomMediaId = inviteMediaId;
      playback.ensurePlayback(inviteMediaId);
    }

    // Reconcile with the room's live media as soon as the room list arrives. On
    // Jellyfin builds that do not expose PlaybackManager, ensurePlayback uses
    // the native details-page Play button behind the launch screen.
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (state.inRoom && state.roomId === roomId) {
        clearInterval(timer);
        return;
      }
      if (!state.inviteJoinActive && !state.pendingJoinRoomId) {
        clearInterval(timer);
        return;
      }
      const room = state.rooms.find(candidate => candidate.id === roomId);
      if (room?.media_id && playback?.ensurePlayback) {
        clearInterval(timer);
        const liveMediaId = utils.normalizeItemId?.(room.media_id) || room.media_id;
        state.roomMediaId = liveMediaId;
        playback.ensurePlayback(liveMediaId);
        return;
      }
      if (attempts >= 80) {
        clearInterval(timer);
        setJoinLaunchScreen(false);
        ui.showToast('Still connecting to the watch party…');
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
    if (panel && !state.roomJoinActive && !JWP.guestLockdown?.isRestricted?.()) panel.classList.add('hide');
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
    // Jellyfin binds the mouse wheel globally to player volume. Keep wheel
    // events inside the docked panel local so scrollable chat/picker content
    // moves without also changing playback volume.
    panel.addEventListener('wheel', panelStopPropagation, { passive: true });
    panel.addEventListener('mousewheel', panelStopPropagation, { passive: true });
  };

  const startIntervals = () => {
    state.intervals.ui = setInterval(() => {
      if (JWP.app?.disablePauseSplash) JWP.app.disablePauseSplash();
      if (document.visibilityState !== 'visible') return;
      const video = utils.getVideo();
      const activeVideo = hasActiveVideo(video);
      if (state.inRoom && state.isHost && !state.guestMode && ui.prepareInviteLink
          && Date.now() >= inviteRefreshAt) {
        // Refresh the existing invite's permissions when the host starts a title
        // (or changes series), including when nobody presses Copy link again.
        inviteRefreshAt = Date.now() + 3000;
        if (activeVideo) state.roomMediaId = utils.getCurrentItemId() || state.roomMediaId;
        ui.prepareInviteLink().catch(err => {
          console.warn('[JellyWatchParty] Invite refresh failed:', err);
        });
      }
      if (state.pendingJoinRoomId && state.ws?.readyState === 1 && JWP.actions?.joinRoom) {
        const roomId = state.pendingJoinRoomId;
        console.log('[JellyWatchParty] Auto-joining room:', roomId);
        if (JWP.actions.joinRoom(roomId)) state.pendingJoinRoomId = '';
      }
      if (hadVideoElement && !activeVideo) {
        hadVideoElement = false;
        onVideoPlayerExit();
        return;
      }
      if (activeVideo && !state.waitingForTitle) {
        hadVideoElement = true;
        if (state.roomJoinActive) playback?.holdJoinPlayback?.();
        else setJoinLaunchScreen(false);
        ui.injectOsdButton();
        playback.bindVideo();
        if (playback.patchTrackSwitching) playback.patchTrackSwitching();
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
      if (state.inRoom && !state.isHost && !state.waitingForTitle) {
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
    beginInviteJoin();
    if (JWP.cursor && JWP.cursor.bind) JWP.cursor.bind();
    if (JWP.actions && JWP.actions.connect) {
      console.log('[JellyWatchParty] Initiating WebSocket connection...');
      JWP.actions.connect();
    } else {
      console.error('[JellyWatchParty] JWP.actions.connect not available!');
    }
    if (JWP.guestLockdown?.init) JWP.guestLockdown.init();
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
    hasActiveVideo,
    getInviteMediaId,
    setJoinLaunchScreen
  };

  JWP.app = JWP.app || {};
  Object.assign(JWP.app, { init, setJoinLaunchScreen, beginInviteJoin });
})();
