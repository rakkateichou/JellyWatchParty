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

  const getItemIdFromDom = () => {
    const titleEl = document.querySelector('.osdTitle[data-id], .videoOsdTitle[data-id], [class*="osd"] [data-id]');
    const titleId = normalizeItemId(titleEl?.dataset?.id);
    if (titleId) return titleId;
    const itemIdEl = document.querySelector('.videoOsd [data-itemid], .videoOsdBottom [data-itemid]');
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

  const getCurrentItemId = () => {
    const isVideoPage = /^#\/video(?:[/?]|$)/i.test(window.location.hash || '');
    if (isVideoPage) {
      return getPlaybackItemId() || getItemIdFromDom() || getItemIdFromUrl() || getPageItemId() || null;
    }
    // On details pages the playback manager can still describe the previous
    // video, while ShareLinks puts the actual selected item in a UUID-style
    // route. Prefer the page route there so a room is never born with stale
    // or missing media.
    return getItemIdFromUrl() || getPageItemId() || getPlaybackItemId() || getItemIdFromDom() || null;
  };

  Object.assign(utils, { normalizeItemId, getCurrentItem, getCurrentItemId });
})();
