(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const utils = JWP.utils = JWP.utils || {};

  const normalizeItemId = (value) => {
    const raw = String(value || '').trim();
    if (/^[a-f0-9]{32}$/i.test(raw)) return raw.toLowerCase();
    if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(raw)) {
      return raw.replace(/-/g, '').toLowerCase();
    }
    return null;
  };

  const getCurrentItem = () => {
    const pm = utils.getPlaybackManager();
    if (!pm) return null;
    if (typeof pm.getCurrentItem === 'function') return pm.getCurrentItem();
    if (typeof pm.currentItem === 'function') return pm.currentItem();
    return pm.currentItem || pm._currentItem || null;
  };

  const getPlaybackItemId = () => {
    try {
      const nowPlayingId = normalizeItemId(window.NowPlayingItem?.Id);
      if (nowPlayingId) return nowPlayingId;
      const playbackInfo = sessionStorage.getItem('playbackInfo');
      if (playbackInfo) {
        const info = JSON.parse(playbackInfo);
        const playbackId = normalizeItemId(info?.ItemId);
        if (playbackId) return playbackId;
      }
    } catch (e) { /* ignore */ }
    const pm = utils.getPlaybackManager();
    if (pm) {
      const item = getCurrentItem();
      const currentId = normalizeItemId(item?.Id);
      if (currentId) return currentId;
    }
    return null;
  };

  const getPageItemId = () => {
    const routeId = normalizeItemId(window.appRouter?.currentRouteInfo?.options?.item?.Id);
    if (routeId) return routeId;
    return normalizeItemId(window.Emby?.Page?.currentItem?.Id);
  };

  // Jellyfin keeps the player's OSD page in the DOM after you leave the
  // player, only hidden (`div.page ... hide`), and its buttons (e.g.
  // .btnUserRating) still carry the last item's id. Reading that would report
  // the previous movie as playing on the home screen, so skip anything
  // inside a hidden page.
  const isOnHiddenPage = (el) => typeof el.closest === 'function' && !!el.closest('.page.hide');

  const firstOnVisiblePage = (selector) => {
    if (typeof document.querySelectorAll !== 'function') {
      const el = document.querySelector(selector);
      return el && !isOnHiddenPage(el) ? el : null;
    }
    const list = document.querySelectorAll(selector);
    for (let i = 0; i < list.length; i++) {
      if (!isOnHiddenPage(list[i])) return list[i];
    }
    return null;
  };

  const getItemIdFromDom = () => {
    const titleEl = firstOnVisiblePage('.osdTitle[data-id], .videoOsdTitle[data-id], [class*="osd"] [data-id]');
    const titleId = normalizeItemId(titleEl?.dataset?.id);
    if (titleId) return titleId;
    const itemIdEl = firstOnVisiblePage('.videoOsd [data-itemid], .videoOsdBottom [data-itemid]');
    const itemId = normalizeItemId(itemIdEl?.dataset?.itemid);
    if (itemId) return itemId;
    return null;
  };

  const getItemIdFromUrl = () => {
    const hash = window.location.hash || '';
    const patterns = [
      /[?&]id=([a-f0-9-]{32,36})/i,
      /\/items\/([a-f0-9-]{32,36})/i,
      /\/videos\/([a-f0-9-]{32,36})/i,
      /id=([a-f0-9-]{32,36})/i
    ];
    for (const pattern of patterns) {
      const match = hash.match(pattern);
      const itemId = normalizeItemId(match?.[1]);
      if (itemId) return itemId;
    }
    return null;
  };

  // Authenticated fetch against the Jellyfin server via the page's ApiClient.
  const apiFetch = (path, options) => {
    const apiClient = window.ApiClient;
    if (!apiClient) return Promise.reject(new Error('ApiClient not available'));
    const token = typeof apiClient.accessToken === 'function' ? apiClient.accessToken() : null;
    const serverAddress = typeof apiClient.serverAddress === 'function' ? apiClient.serverAddress() : '';
    const headers = Object.assign({}, options && options.headers, token ? { Authorization: utils.buildAuthHeader(apiClient, token) } : {});
    return fetch(`${serverAddress}${path}`, Object.assign({}, options, { headers }));
  };

  const getDeviceId = () => {
    const apiClient = window.ApiClient;
    if (!apiClient) return '';
    if (typeof apiClient.deviceId === 'function') return apiClient.deviceId() || '';
    return apiClient._deviceId || '';
  };

  const getUserId = () => {
    const apiClient = window.ApiClient;
    if (!apiClient) return '';
    return (typeof apiClient.getCurrentUserId === 'function' && apiClient.getCurrentUserId())
      || apiClient._currentUserId || '';
  };

  // The server's view of this browser's own session. Independent of
  // jellyfin-web internals, so it keeps working when playbackManager is not
  // exposed globally (Jellyfin 12.1+). Resolves to null when unavailable.
  const getOwnSession = async () => {
    const deviceId = getDeviceId();
    if (!deviceId) return null;
    const res = await apiFetch(`/Sessions?deviceId=${encodeURIComponent(deviceId)}`);
    if (!res || !res.ok) return null;
    const sessions = await res.json();
    if (!Array.isArray(sessions)) return null;
    const userId = normalizeItemId(getUserId());
    const own = sessions.filter((s) => s && s.DeviceId === deviceId);
    const match = own.find((s) => userId && normalizeItemId(s.UserId) === userId) || own[0];
    if (!match) return null;
    return {
      id: match.Id,
      nowPlayingItemId: normalizeItemId(match.NowPlayingItem && match.NowPlayingItem.Id)
    };
  };

  const getCurrentItemId = () => {
    const isVideoPage = /^#\/video(?:[/?]|$)/i.test(window.location.hash || '');
    if (isVideoPage) {
      return getPlaybackItemId() || getItemIdFromDom() || getItemIdFromUrl() || getPageItemId() || JWP.state?.serverNowPlayingId || null;
    }
    // On details pages the playback manager can still describe the previous
    // video, while ShareLinks puts the actual selected item in a UUID-style
    // route. Prefer the page route there so a room is never born with stale
    // or missing media.
    return getItemIdFromUrl() || getPageItemId() || getPlaybackItemId() || getItemIdFromDom() || null;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Updates the cached server-side now-playing id. Returns the id or null.
  const refreshServerNowPlaying = async () => {
    try {
      const session = await getOwnSession();
      const id = session && session.nowPlayingItemId;
      if (id && JWP.state) JWP.state.serverNowPlayingId = id;
      return id || null;
    } catch (e) {
      return null;
    }
  };

  const clearServerNowPlaying = () => {
    if (JWP.state) JWP.state.serverNowPlayingId = '';
  };

  // Async variant of getCurrentItemId: when local detection fails, asks the
  // server which item this session is playing. The server only learns that
  // after the player's first progress report, so retry briefly.
  const resolveCurrentItemId = async ({ retries = 4, delayMs = 500 } = {}) => {
    const local = getCurrentItemId();
    if (local) return local;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const id = await refreshServerNowPlaying();
      if (id) return id;
      if (attempt < retries) await sleep(delayMs);
    }
    return (JWP.state && JWP.state.serverNowPlayingId) || null;
  };

  Object.assign(utils, {
    getCurrentItem,
    getCurrentItemId,
    resolveCurrentItemId,
    refreshServerNowPlaying,
    clearServerNowPlaying,
    getOwnSession,
    apiFetch,
    normalizeItemId
  });
})();
