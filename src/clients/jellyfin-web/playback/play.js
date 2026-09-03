(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const playback = JWP.playback = JWP.playback || {};
  const utils = JWP.utils;

  const PLAY_BUTTON_SELECTOR = [
    '.mainDetailButtons .btnPlay',
    '.mainDetailButtons button[data-action="resume"]',
    '.mainDetailButtons button[data-action="play"]'
  ].join(',');

  const NATIVE_LAUNCH_COOLDOWN_MS = 8000;

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
    if (utils.getCurrentItemId() !== itemId) return false;
    const state = JWP.state;
    if (state.nativeLaunchItemId === itemId && Date.now() < state.nativeLaunchUntil) return true;
    const button = document.querySelector(PLAY_BUTTON_SELECTOR);
    if (!button || button.disabled) return false;
    state.nativeLaunchItemId = itemId;
    state.nativeLaunchUntil = Date.now() + NATIVE_LAUNCH_COOLDOWN_MS;
    button.click();
    console.log('[JellyWatchParty] Playback started via Jellyfin Play button');
    return true;
  };

  const openItemDetails = (itemId) => {
    const alreadyOnDetails = /^#\/details(?:[/?]|$)/i.test(window.location.hash || '');
    if (alreadyOnDetails && utils.getCurrentItemId() === itemId) return false;
    const state = JWP.state;
    const roomId = state.roomId || state.pendingJoinRoomId || '';
    const apiClient = window.ApiClient;
    const serverId = apiClient?.serverId?.() || apiClient?._serverId || '';
    const params = [`id=${encodeURIComponent(itemId)}`];
    if (roomId) params.push(`jwpRoom=${encodeURIComponent(roomId)}`);
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
    if (!itemId) return;
    // The same item id can mean either "already playing" or merely "open on
    // its details page". Jellyfin's SPA can retain a hidden <video> element
    // on details pages, so the player route is the authoritative distinction.
    // Guest invitation links need this path to start the episode they landed on.
    if (utils.getCurrentItemId() === itemId && isVideoPage()) return;
    if (state.joiningItemId === itemId) return;
    const retry = () => {
      if (attempt < 80) setTimeout(() => ensurePlayback(itemId, attempt + 1), 250);
      else JWP.ui?.showToast?.('Tap Play to continue the watch party.');
    };

    // Jellyfin Web keeps PlaybackManager inside its module bundle on current
    // releases, so it is often unavailable on window. Its own Play button is
    // nevertheless ready and is the most reliable way to open the player for
    // a redeemed ShareLinks guest. For episode changes, first move to the new
    // item's details page, then retry until that button has rendered.
    if (!utils.getPlaybackManager()) {
      if (clickNativePlayButton(itemId)) return;
      openItemDetails(itemId);
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
    state.joiningItemId = itemId;
    ApiClient.getItem(userId, itemId).then((item) => {
      if (!playItem(item)) retry();
    }).catch(() => {
      retry();
    }).finally(() => {
      state.joiningItemId = '';
    });
  };

  Object.assign(playback, { isVideoPage, playItem, ensurePlayback });
})();
