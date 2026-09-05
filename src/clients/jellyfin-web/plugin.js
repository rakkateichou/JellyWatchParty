(() => {
  if (window.JellyWatchParty && window.JellyWatchParty.__loaded) return;
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  JWP.__loaded = true;

  const currentScript = document.currentScript;
  let basePrefix = '';
  if (currentScript && currentScript.src) {
    try {
      const url = new URL(currentScript.src, window.location.href);
      const suffix = '/JellyWatchParty/ClientScript';
      if (url.pathname.endsWith(suffix)) {
        basePrefix = url.pathname.slice(0, -suffix.length);
      }
    } catch (err) {}
  }

  JWP.serverAddress = window.location.origin + basePrefix;
  JWP.assetBase = `${basePrefix}/JellyWatchParty/Asset`;

  // Replaced with client-modules.json in dependency order by the plugin.
  /* JWP_BUNDLED_MODULES */

  const start = () => JWP.app.init();
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
