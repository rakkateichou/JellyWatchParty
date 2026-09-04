(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const playback = JWP.playback = JWP.playback || {};
  const utils = JWP.utils;

  const PLAY_BUTTON_SELECTOR = [
    '.mainDetailButtons .btnPlay',
    '.mainDetailButtons button[data-action="resume"]',
    '.mainDetailButtons button[data-action="play"]'
  ].join(',');

  const NATIVE_BUTTON_SETTLE_MS = 750;
  const NATIVE_LAUNCH_COOLDOWN_MS = 8000;
  const JOIN_HOLD_POLL_MS = 50;

  let joinHoldTimer = null;

  // Jellyfin's native Play action always begins at 0:00. Invitations invoke
  // that action before room_state arrives, so keep the newly-created player
  // paused until the host's authoritative position and play state are applied.
  // The index.html bootstrap also catches the very first play event, before
  // this module has loaded; this poll covers player replacement and retries.
  const pauseJoinPlayback = () => {
    if (!JWP.state?.roomJoinActive || JWP.state.isHost) return;
    const video = utils.getVideo?.() || document.querySelector('video');
    if (!video || video.paused !== false) return;
    utils.startSyncing?.(500);
    try { video.pause(); } catch (err) {}
  };

  const holdJoinPlayback = () => {
    pauseJoinPlayback();
    if (!joinHoldTimer) joinHoldTimer = setInterval(pauseJoinPlayback, JOIN_HOLD_POLL_MS);
  };

  const releaseJoinPlayback = () => {
    if (!joinHoldTimer) return;
    clearInterval(joinHoldTimer);
    joinHoldTimer = null;
  };

  const isVideoPage = () => {
    // Jellyfin keeps an old <video> element mounted while its SPA is showing an
    // episode details page. Conversely, an invite can briefly be on #/video
    // before Jellyfin has created the real player. Both the player route and a
    // live media element are therefore required.
    if (!/^#\/(?:video|playback)(?:[/?]|$)/i.test(window.location.hash || '')) return false;
    const video = utils.getVideo?.() || document.querySelector('video');
    if (!video) return false;
    if (video.__owpNativeAdapter) return true;
    const container = video.closest?.('.videoPlayerContainer');
    if (!container) return true;
    if (container.hidden) return false;
    if (typeof window.getComputedStyle !== 'function') return true;
    const style = window.getComputedStyle(container);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };

  const clickNativePlayButton = (itemId) => {
    const normalizedItemId = utils.normalizeItemId?.(itemId) || itemId;
    if ((utils.normalizeItemId?.(utils.getCurrentItemId()) || utils.getCurrentItemId()) !== normalizedItemId) return false;
    const state = JWP.state;
    const button = document.querySelector(PLAY_BUTTON_SELECTOR);
    if (!button || button.disabled) return false;
    const now = Date.now();
    if (state.nativeButtonItemId !== normalizedItemId) {
      state.nativeButtonItemId = normalizedItemId;
      state.nativeButtonReadyAt = now;
      return false;
    }
    // Jellyfin inserts the button before the details-page controller finishes
    // binding its delegated click action. Let the same button remain available
    // briefly so a single synthetic click starts one playback session instead
    // of racing the handler or repeatedly restarting transcodes.
    if (now - state.nativeButtonReadyAt < NATIVE_BUTTON_SETTLE_MS) return false;
    if (state.nativeLaunchItemId === normalizedItemId && now < state.nativeLaunchUntil) return true;
    state.nativeLaunchItemId = normalizedItemId;
    state.nativeLaunchUntil = now + NATIVE_LAUNCH_COOLDOWN_MS;
    button.click();
    console.log('[JellyWatchParty] Playback started via Jellyfin Play button');
    return true;
  };

  const openItemDetails = (itemId) => {
    const normalizedItemId = utils.normalizeItemId?.(itemId) || itemId;
    const alreadyOnDetails = /^#\/details(?:[/?]|$)/i.test(window.location.hash || '');
    const currentItemId = utils.normalizeItemId?.(utils.getCurrentItemId()) || utils.getCurrentItemId();
    if (alreadyOnDetails && currentItemId === normalizedItemId) return false;
    const state = JWP.state;
    const roomId = state.roomId || state.pendingJoinRoomId || '';
    const apiClient = window.ApiClient;
    const serverId = apiClient?.serverId?.() || apiClient?._serverId || '';
    const params = [`id=${encodeURIComponent(normalizedItemId)}`];
    if (roomId) params.push(`jwpRoom=${encodeURIComponent(roomId)}`);
    params.push(`jwpMedia=${encodeURIComponent(normalizedItemId)}`);
    if (serverId) params.push(`serverId=${encodeURIComponent(serverId)}`);
    window.location.hash = `#/details?${params.join('&')}`;
    return true;
  };

  const tryPlayMethods = (pm, item) => {
    const playOptions = { startPositionTicks: 0 };
    const errors = [];
    if (typeof pm.play === 'function') {
      try {
        pm.play({ items: [item], ...playOptions });
        console.log('[JellyWatchParty] Playback started via pm.play({ items })');
        return { success: true, errors };
      } catch (err) {
        errors.push({ method: 'play({ items })', error: err.message });
      }
      try {
        pm.play({ item: item, ...playOptions });
        console.log('[JellyWatchParty] Playback started via pm.play({ item })');
        return { success: true, errors };
      } catch (err) {
        errors.push({ method: 'play({ item })', error: err.message });
      }
      const itemId = item?.Id || item?.id;
      if (itemId) {
        try {
          pm.play({ ids: [itemId], ...playOptions });
          console.log('[JellyWatchParty] Playback started via pm.play({ ids })');
          return { success: true, errors };
        } catch (err) {
          errors.push({ method: 'play({ ids })', error: err.message });
        }
      }
    }
    if (typeof pm.playItems === 'function') {
      try {
        pm.playItems([item], 0);
        console.log('[JellyWatchParty] Playback started via pm.playItems()');
        return { success: true, errors };
      } catch (err) {
        errors.push({ method: 'playItems()', error: err.message });
      }
    }
    return { success: false, errors };
  };

  const playItem = (item) => {
    const pm = utils.getPlaybackManager();
    if (!pm) {
      console.warn('[JellyWatchParty] Playback failed: PlaybackManager not available');
      return false;
    }
    const result = tryPlayMethods(pm, item);
    if (!result.success) {
      console.error('[JellyWatchParty] All playback methods failed:', result.errors);
      if (JWP.ui && JWP.ui.showToast) {
        JWP.ui.showToast('Failed to start playback. Try refreshing the page.');
      }
    }
    return result.success;
  };

  const ensurePlayback = (itemId, attempt = 0) => {
    const state = JWP.state;
    const normalizedItemId = utils.normalizeItemId?.(itemId) || itemId;
    if (!normalizedItemId) return;
    if (state.roomJoinActive) holdJoinPlayback();
    // The same item id can mean either "already playing" or merely "open on
    // its details page". Jellyfin's SPA can retain a hidden <video> element
    // on details pages, so the player route is the authoritative distinction.
    // Guest invitation links need this path to start the episode they landed on.
    const currentItemId = utils.normalizeItemId?.(utils.getCurrentItemId()) || utils.getCurrentItemId();
    if (currentItemId === normalizedItemId && isVideoPage()) return;
    if (state.joiningItemId === normalizedItemId) return;
    const retry = () => {
      if (attempt < 80) setTimeout(() => ensurePlayback(normalizedItemId, attempt + 1), 250);
      else JWP.ui?.showToast?.('Tap Play to continue the watch party.');
    };

    // Jellyfin Web keeps PlaybackManager inside its module bundle on current
    // releases, so it is often unavailable on window. Its own Play button is
    // nevertheless ready and is the most reliable way to open the player for
    // a redeemed ShareLinks guest. For episode changes, first move to the new
    // item's details page, then retry until that button has rendered.
    if (!utils.getPlaybackManager()) {
      if (clickNativePlayButton(normalizedItemId)) return;
      openItemDetails(normalizedItemId);
      retry();
      return;
    }

    if (!window.ApiClient) {
      retry();
      return;
    }
    const userId = ApiClient.getCurrentUserId?.() || ApiClient._currentUserId;
    if (!userId) {
      retry();
      return;
    }
    state.joiningItemId = normalizedItemId;
    ApiClient.getItem(userId, normalizedItemId).then((item) => {
      if (!playItem(item)) retry();
    }).catch(() => {
      retry();
    }).finally(() => {
      state.joiningItemId = '';
    });
  };

  Object.assign(playback, {
    isVideoPage,
    playItem,
    ensurePlayback,
    holdJoinPlayback,
    releaseJoinPlayback
  });
})();
