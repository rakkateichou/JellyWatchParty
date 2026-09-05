(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  if (JWP.state) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const CHAT_NICKNAME_STORAGE_KEY = 'jwp_chat_nickname';
  const PANEL_THEME_STORAGE_KEY = 'jwp_panel_theme';
  const PANEL_BRIGHTNESS_STORAGE_KEY = 'jwp_panel_brightness';
  const PANEL_THEMES = ['monochrome', 'frost', 'violet', 'ember'];

  const readPreference = (key) => {
    try { return window.localStorage?.getItem(key) || ''; } catch (err) { return ''; }
  };

  const cleanNickname = (value) => String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 100);

  const savedNickname = cleanNickname(readPreference(CHAT_NICKNAME_STORAGE_KEY));
  const savedTheme = readPreference(PANEL_THEME_STORAGE_KEY);
  // Preserve the percentage chosen before the control was renamed to brightness.
  const savedBrightness = (readPreference(PANEL_BRIGHTNESS_STORAGE_KEY) || readPreference('jwp_panel_opacity')).trim();
  const normalizePanelBrightness = (value) => {
    const number = value === '' || value == null ? NaN : Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 100 ? Math.round(number) : 80;
  };

  // LRU Cache implementation for image URLs
  class LRUCache {
    constructor(maxSize = 50) {
      this.maxSize = maxSize;
      this.cache = new Map();
    }

    get(key) {
      if (!this.cache.has(key)) return undefined;
      // Move to end (most recently used)
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    set(key, value) {
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.maxSize) {
        // Remove oldest (first) entry
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(key, value);
    }

    has(key) {
      return this.cache.has(key);
    }

    clear() {
      this.cache.clear();
    }
  }

  JWP.constants = {
    PANEL_ID: 'jwp-panel',
    BTN_ID: 'jwp-osd-btn',
    STYLE_ID: 'jwp-style',
    SYNC_HIDE_STYLE_ID: 'jwp-hide-native-sync',
    HOME_SECTION_ID: 'jwp-home-section',
    CHAT_NICKNAME_STORAGE_KEY,
    PANEL_THEME_STORAGE_KEY,
    PANEL_BRIGHTNESS_STORAGE_KEY,
    normalizePanelBrightness,
    PANEL_THEMES,
    protocol,
    host,
    DEFAULT_WS_URL: `${protocol}//${host}:3000/ws`,
    SUPPRESS_MS: 2000,
    TRACK_SWITCH_SUPPRESS_MS: 8000, // Safety-net suppression window for host audio/subtitle track switches (collapses early via settle-shortcut, see playback/tracks.js)
    SEEK_THRESHOLD: 1.0,          // Reduced from 2.5s - smaller seeks now broadcast (UX-P2)
    STATE_UPDATE_MS: 500,         // Fresh host position snapshots without excessive traffic
    SYNC_LEAD_MS: 75,             // Small decode/start allowance; sample timestamps handle network transit
    DRIFT_CORRECTION_ENTER_SEC: 0.2, // Start correcting once drift becomes perceptible
    DRIFT_CORRECTION_EXIT_SEC: 0.06, // Return to 1x once the streams are visually aligned
    DRIFT_SOFT_MAX_SEC: 0.75,     // Seek rather than audibly chasing a large offset
    PLAYBACK_RATE_MIN: 0.85,      // Allow slowdown if ahead
    PLAYBACK_RATE_MAX: 2.0,       // Aggressive catch-up (browser pitch correction preserves audio)
    DRIFT_GAIN: 0.50,             // For sqrt curve: 0.50 * sqrt(1s) = 0.50 → 1.50x at 1s drift
    // Interval timings (P2 optimization)
    UI_CHECK_MS: 2000,            // UI button injection check
    PING_INIT_MS: 2000,            // Fast ping interval (clock convergence)
    PING_STABLE_MS: 30000,         // Stable ping interval (after convergence)
    PING_STABLE_AFTER: 5,          // Pongs before switching to stable interval
    HOME_REFRESH_MS: 5000,        // Home watch parties refresh (increased from 2s)
    SYNC_LOOP_MS: 250,            // Re-evaluate drift promptly between host snapshots
    RECONNECT_BASE_MS: 1000,      // Base reconnect delay (1s)
    RECONNECT_MAX_MS: 30000,      // Max reconnect delay (30s)
    INITIAL_SYNC_COOLDOWN_MS: 8000, // Cooldown after join to let playback rate catch up (not HARD_SEEK)
    INITIAL_SYNC_MAX_MS: 30000,   // Max time for initial sync before allowing HARD_SEEK
    INITIAL_SYNC_DRIFT_THRESHOLD: 0.25, // Drift threshold to exit initial sync early
    INITIAL_SYNC_MAX_DRIFT: 10,  // Max drift (seconds) before forcing HARD_SEEK during initial sync
    // Time sync (hybrid min-delay + EMA)
    TIME_SYNC_MAX_SAMPLES: 8,    // Number of samples in circular buffer
    TIME_SYNC_EMA_ALPHA: 0.4     // EMA smoothing coefficient
  };

  JWP.state = {
    ws: null,
    roomId: '',
    clientId: '',
    name: '',
    isHost: false,
    followHost: true,
    suppressUntil: 0,
    rooms: [],
    inRoom: false,
    bound: false,
    autoReconnect: true,
    isConnecting: false,
    wsUrl: '',
    reconnectAttempts: 0,        // For exponential backoff
    initialized: false,
    // Log buffering (for logs sent before WS connected)
    logBuffer: [],
    logBufferMax: 100,
    successfulPings: 0,
    serverOffsetMs: 0,
    timeSyncSamples: [],         // Circular buffer of { rtt, offset, ts } for hybrid time sync
    lastSeekSentAt: 0,
    lastStateSentAt: 0,
    lastSentPosition: 0,
    hasTimeSync: false,
    pendingActionTimer: null,
    homeRoomCache: new LRUCache(50),
    lastParticipantCount: 0,
    joiningItemId: '',
    nativeLaunchItemId: '',
    nativeLaunchUntil: 0,
    nativeButtonItemId: '',
    nativeButtonReadyAt: 0,
    pendingJoinRoomId: '',  // Room to join after navigating to video player
    inviteJoinActive: false, // True while handling an accountless ShareLinks invitation
    roomJoinPending: false, // A signed-in user selected an existing room; await its authoritative room_state
    roomJoinActive: false,  // A non-host room join is opening the host's active video
    waitingForTitle: false,
    guestMode: !!window.__jwpGuestRoom,
    guestRoomId: window.__jwpGuestRoom || '',
    guestClosedMessage: window.__jwpGuestClosed ? 'You left this room. Open an invitation to join again.' : '',
    guestShareItemId: '',    // Root item granted by ShareLinks (room media remains stricter)
    guestReadyMediaId: '',
    guestAccessCheckingId: '',
    roomName: '',
    roomHostId: '',
    isRoomOwner: false,
    roomMediaId: '',
    inviteRoomId: '',
    inviteBaseUrl: '',
    inviteShareItemId: '',
    inviteMediaId: null,
    invitePromise: null,
    mediaChangeToken: 0,
    participantCount: 0,
    lastSyncServerTs: 0,
    lastSyncPosition: 0,
    lastSyncPlayState: '',
    readyRoomId: '',
    isBuffering: false,
    wantsToPlay: false,
    isSyncing: false,
    isDriftCorrecting: false, // Hysteresis latch: true while actively rate-correcting drift (see playback/sync.js)
    syncCooldownUntil: 0,  // Timestamp until which position updates are ignored (after resume)
    isInitialSync: false,  // True during initial catch-up after joining (disables HARD_SEEK)
    initialSyncUntil: 0,   // Timestamp when initial sync phase ends (max duration)
    initialSyncTargetPos: 0, // Target position when joining - used to detect/fix Jellyfin resume jumps
    initialTrackSyncKey: '', // Host tracks are inherited once on room entry, then remain user-controlled
    syncStatus: 'unknown',  // 'unknown' | 'synced' | 'syncing' | 'pending_play' - for UX indicator (UX-P3)
    currentDrift: 0,       // Current playback drift in seconds (positive = behind host)
    pendingPlayUntil: 0,   // Timestamp when pending play ends (for spinner) (UX-P3)
    coordinatedPlayPending: false, // Host is held on the paused frame until the shared start time
    coordinatedPlayRequestId: '', // Reject delayed starts from an earlier cancelled resume
    coordinatedPlayStarting: false, // Suppress the synthetic Play event fired by the shared start
    // Admin plugin config (delivered via /JellyWatchParty/Token)
    hideNativeSyncButton: false, // Hide Jellyfin's built-in SyncPlay button
    allowThirdPartyHost: false,  // Opt-in: bridge a third-party client in as a room host
    allowSupportedReceiver: false, // Opt-in: attach a supported client (e.g. Android TV) as a receiver
    // Authentication
    authToken: null,
    authEnabled: false,
    userId: '',
    userName: '',
    chatNickname: savedNickname,
    panelTheme: PANEL_THEMES.includes(savedTheme) ? savedTheme : 'monochrome',
    panelBrightness: normalizePanelBrightness(savedBrightness),
    chatSettingsOpen: false,
    panelCollapsed: false,
    tokenExpiresAt: 0,           // Timestamp when token expires
    tokenRefreshTimer: null,     // Timer for token refresh
    // Interval tracking (P4 - memory leak prevention)
    intervals: {
      ui: null,
      ping: null,
      home: null,
      sync: null,
      stateUpdate: null
    },
    // Video event listener cleanup
    videoListeners: null,
    currentVideoElement: null
  };
})();
