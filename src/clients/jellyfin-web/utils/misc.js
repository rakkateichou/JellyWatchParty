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

  // Builds a Jellyfin `Authorization` header using the MediaBrowser scheme.
  //
  // This is the only token transport Jellyfin accepts unconditionally. The
  // X-Emby-Token header we used to rely on is gated behind the server's
  // EnableLegacyAuthorization setting, which Jellyfin 12 both defaults to
  // false for new installs and force-disables on upgrade - so on a 12 server
  // an X-Emby-Token-only request gets a 401 and the whole feature goes
  // quiet. The MediaBrowser scheme works on 10.11 and 12 alike, and also
  // survives an admin turning legacy auth off on 10.11.
  //
  // Descriptive parts are omitted rather than sent empty when ApiClient does
  // not expose them, since Jellyfin parses the header positionally by name
  // and a Device="undefined" is worse than no Device at all.
  //
  // Shared by ws/auth.js (the /JellyWatchParty/Token handshake) and
  // utils/media.js (apiFetch, used by playback session commands and the
  // native-client bridge UI) - both need it, and this file loads before
  // either.
  const buildAuthHeader = (apiClient, accessToken) => {
    const quote = (value) => `"${String(value).replace(/"/g, '')}"`;
    const part = (name, accessor) => {
      if (!apiClient || typeof apiClient[accessor] !== 'function') return null;
      let value;
      try {
        value = apiClient[accessor]();
      } catch (e) {
        return null;
      }
      if (value === null || value === undefined || value === '') return null;
      return `${name}=${quote(value)}`;
    };

    const parts = [
      part('Client', 'appName'),
      part('Device', 'deviceName'),
      part('DeviceId', 'deviceId'),
      part('Version', 'appVersion'),
      `Token=${quote(accessToken)}`
    ].filter(Boolean);

    return `MediaBrowser ${parts.join(', ')}`;
  };

  Object.assign(utils, { shouldSend, suppress, buildAuthHeader, escapeHtml, userColor, getItemImageUrl, isHomeView });
})();
