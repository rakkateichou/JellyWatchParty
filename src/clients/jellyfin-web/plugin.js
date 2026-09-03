(() => {
  if (window.JellyWatchParty && window.JellyWatchParty.__loaded) return;
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  JWP.__loaded = true;

  const currentScript = document.currentScript;
  let cacheBust = '';
  let basePrefix = '';
  if (currentScript && currentScript.src) {
    try {
      const url = new URL(currentScript.src, window.location.href);
      cacheBust = url.searchParams.get('v') || '';
      const suffix = '/JellyWatchParty/ClientScript';
      if (url.pathname.endsWith(suffix)) {
        basePrefix = url.pathname.slice(0, -suffix.length);
      }
    } catch (err) {}
  }
  if (!cacheBust) cacheBust = String(Date.now());

  const base = `${basePrefix}/JellyWatchParty/Client`;
  JWP.assetBase = `${basePrefix}/JellyWatchParty/Asset`;

  const SCRIPT_TIMEOUT_MS = 10000;  // 10 seconds timeout per script

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base}/${src}?v=${cacheBust}`;
    script.async = false;
    const timer = setTimeout(() => {
      reject(new Error(`Timeout loading ${src}`));
    }, SCRIPT_TIMEOUT_MS);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error(`Failed to load ${src}`)); };
    document.head.appendChild(script);
  });

  const primeInvitePlayback = () => {
    const hash = window.location.hash || '';
    const roomMatch = hash.match(/[?&]jwpRoom=([0-9a-f-]{36})(?:&|$)/i);
    const mediaMatch = hash.match(/[?&]jwpMedia=([a-f0-9-]{32,36})(?:&|$)/i);
    const roomId = roomMatch?.[1] || '';
    const mediaId = JWP.utils?.normalizeItemId?.(mediaMatch?.[1]) || '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)
        || !mediaId) return;

    // Do not wait for chat, presence and WebSocket modules before asking
    // Jellyfin to construct the player. The full lifecycle reconciles this
    // media hint with live room state once it connects.
    JWP.state.pendingJoinRoomId = roomId.toLowerCase();
    JWP.state.inviteJoinActive = true;
    JWP.state.roomMediaId = mediaId;
    JWP.playback?.ensurePlayback?.(mediaId);
  };

  const loadAll = async () => {
    await loadScript('state.js');
    await Promise.all([
      loadScript('utils/time.js'),
      loadScript('utils/video.js'),
      loadScript('utils/misc.js'),
      loadScript('utils/validation.js'),
    ]);
    await Promise.all([
      loadScript('utils/media.js'),
      loadScript('utils/log.js'),
    ]);
    await Promise.all([
      loadScript('ui/styles.js'),
      loadScript('ui/indicators.js'),
      loadScript('ui/toasts.js'),
      loadScript('ui/modal.js'),
      loadScript('ui/cards.js'),
      loadScript('ui/bridge.js'),
    ]);
    await Promise.all([
      loadScript('ui/home.js'),
      loadScript('ui/render.js'),
    ]);
    await Promise.all([
      loadScript('playback/play.js'),
      loadScript('playback/bind.js'),
      loadScript('playback/sync.js'),
      loadScript('playback/tracks.js'),
    ]);
    primeInvitePlayback();
    await Promise.all([
      loadScript('chat/emotes.js'),
      loadScript('chat/messages.js'),
      loadScript('chat/input.js'),
    ]);
    await loadScript('ws/send.js');
    await loadScript('transport/p2p.js');
    await loadScript('presence/cursor.js');
    await loadScript('ws/auth.js');
    await Promise.all([
      loadScript('ws/handlers/room.js'),
      loadScript('ws/handlers/sync.js'),
      loadScript('ws/handlers/playback.js'),
      loadScript('ws/handlers/clock.js'),
    ]);
    await loadScript('ws/connection.js');
    await loadScript('app/pause-splash.js');
    await loadScript('app/guest-lockdown.js');
    await loadScript('app/lifecycle.js');
    await loadScript('app/cleanup.js');
  };

  loadAll()
    .then(() => {
      if (window.JellyWatchParty && window.JellyWatchParty.app && typeof window.JellyWatchParty.app.init === 'function') {
        window.JellyWatchParty.app.init();
      }
    })
    .catch((err) => {
      console.error('[JellyWatchParty] Loader error:', err);
    });
})();
