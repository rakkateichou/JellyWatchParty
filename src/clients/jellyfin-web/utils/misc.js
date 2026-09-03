(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const utils = JWP.utils = JWP.utils || {};
  const state = JWP.state;
  const { SUPPRESS_MS } = JWP.constants;

  const shouldSend = () => utils.nowMs() > state.suppressUntil;

  const suppress = (ms = SUPPRESS_MS) => { state.suppressUntil = utils.nowMs() + ms; };

  const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  const escapeHtml = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, c => HTML_ENTITIES[c]);
  };

  // Stable, high-contrast identity color shared by chat names and cursors.
  // Hue uses hundredths of a degree while saturation/lightness use separate
  // hash bits, making accidental collisions between different names rare.
  const userColor = (name) => {
    const normalized = String(name || 'Anonymous').trim() || 'Anonymous';
    let hash = 2166136261;
    for (let index = 0; index < normalized.length; index++) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash >>>= 0;
    const hue = ((hash % 36000) / 100).toFixed(2);
    const saturation = 72 + ((hash >>> 16) % 17);
    const lightness = 64 + ((hash >>> 24) % 9);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  const getItemImageUrl = (itemId, imageTag) => {
    if (!itemId || !window.ApiClient) return '';
    const serverUrl = window.ApiClient._serverAddress || window.ApiClient.serverAddress?.() || '';
    if (!serverUrl) return '';
    let url = `${serverUrl}/Items/${itemId}/Images/Primary?quality=90`;
    if (imageTag) url += `&tag=${imageTag}`;
    return url;
  };

  const isHomeView = () => {
    if (document.querySelector('.homePage')) return true;
    const hash = window.location.hash || '';
    return hash.includes('home');
  };

  Object.assign(utils, { shouldSend, suppress, escapeHtml, userColor, getItemImageUrl, isHomeView });
})();
