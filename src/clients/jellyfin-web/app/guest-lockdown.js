(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const lockdown = JWP.guestLockdown = JWP.guestLockdown || {};
  const state = JWP.state;
  const utils = JWP.utils;

  const ROOT_CLASS = 'jwp-party-guest';
  const BLOCKED_CONTROL_SELECTOR = [
    '.btnUserData',
    '.btnUserData-favorite',
    '.headerBackButton',
    '.headerHomeButton',
    '.headerSearchButton',
    '.headerCastButton',
    '.headerUserButton',
    '.mainDrawerButton',
    '[title="Add to favorites"]',
    '[title="Remove from favorites"]',
    '[aria-label="Add to favorites"]',
    '[aria-label="Remove from favorites"]',
    '[data-action="favorite"]',
    '[data-action="favourite"]'
  ].join(',');

  let initialized = false;
  let redirectAt = 0;
  let enforceTimer = null;
  let detectionPromise = null;

  const classListToggle = (element, enabled) => {
    if (element?.classList?.toggle) element.classList.toggle(ROOT_CLASS, enabled);
  };

  const applyGuestClass = () => {
    classListToggle(document.documentElement, !!state.guestMode);
    classListToggle(document.body, !!state.guestMode);
  };

  const serverAddress = () => {
    const apiClient = window.ApiClient;
    if (!apiClient) return '';
    return typeof apiClient.serverAddress === 'function'
      ? apiClient.serverAddress()
      : (apiClient._serverAddress || '');
  };

  const accessToken = () => {
    const apiClient = window.ApiClient;
    if (!apiClient) return '';
    return typeof apiClient.accessToken === 'function'
      ? apiClient.accessToken()
      : (apiClient._accessToken || '');
  };

  const currentUserName = () => String(
    state.userName
      || window.ApiClient?._currentUser?.Name
      || window.ApiClient?.currentUser?.()?.Name
      || ''
  );

  const setGuestState = (payload) => {
    const isGuest = !!(payload && (payload.IsGuest === true || payload.isGuest === true));
    // The username check lets the UI lock immediately during the short window
    // before ShareLinks/GuestState is ready after redemption.
    state.guestMode = isGuest || /^share-/i.test(currentUserName());
    state.guestShareItemId = utils.normalizeItemId?.(
      payload?.AllowedItemId || payload?.allowedItemId || ''
    ) || '';
    applyGuestClass();
    return state.guestMode;
  };

  const detect = async (attempt = 0) => {
    if (detectionPromise && attempt === 0) return detectionPromise;
    const run = async () => {
      const base = serverAddress();
      const token = accessToken();
      if (!base || !token) {
        setGuestState(null);
        if (attempt < 20) setTimeout(() => detect(attempt + 1), 250);
        return state.guestMode;
      }
      try {
        const response = await fetch(`${base}/ShareLinks/GuestState`, {
          headers: { 'X-Emby-Token': token },
          cache: 'no-store'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return setGuestState(await response.json());
      } catch (error) {
        setGuestState(null);
        if (attempt < 8) setTimeout(() => detect(attempt + 1), 500);
        return state.guestMode;
      }
    };
    const promise = run();
    if (attempt === 0) detectionPromise = promise;
    return promise;
  };

  const isRestricted = () => !!(
    state.guestMode
    && (state.inRoom || state.pendingJoinRoomId || state.inviteJoinActive)
  );

  const isVideoRoute = () => /^#\/(?:video|playback)(?:[/?]|$)/i.test(window.location.hash || '');

  const expectedMediaId = () => utils.normalizeItemId?.(state.roomMediaId) || '';

  const enforce = () => {
    applyGuestClass();
    if (!isRestricted()) return false;
    const expected = expectedMediaId();
    if (!expected || state.joiningItemId === expected) return false;
    const current = utils.normalizeItemId?.(utils.getCurrentItemId?.()) || '';
    if (isVideoRoute() && (!current || current === expected)) return false;
    const now = Date.now();
    if (now - redirectAt < 750) return false;
    redirectAt = now;
    JWP.playback?.ensurePlayback?.(expected);
    return true;
  };

  const enforceSoon = (delay = 0) => {
    if (enforceTimer) clearTimeout(enforceTimer);
    enforceTimer = setTimeout(() => {
      enforceTimer = null;
      enforce();
    }, delay);
  };

  const isAllowedControl = (target) => {
    if (!target?.closest) return true;
    if (target.closest(`#${JWP.constants.PANEL_ID}, #${JWP.constants.BTN_ID}, #jwp-global-btn`)) return true;
    if (target.closest(BLOCKED_CONTROL_SELECTOR)) return false;
    if (isVideoRoute() && target.closest('.videoPlayerContainer, .videoOsd, .videoOsdBottom, .osdHeader, .actionSheet, .dialog')) return true;
    if (target.closest('.mainDetailButtons .btnPlay, .mainDetailButtons [data-action="play"], .mainDetailButtons [data-action="resume"]')) return true;
    return !target.closest('a, button, [role="button"], [role="menuitem"], .card, [data-action], [data-itemid], [data-item-id]');
  };

  const handleClick = (event) => {
    if (!isRestricted() || isAllowedControl(event.target)) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    enforceSoon();
  };

  const init = () => {
    if (initialized) return;
    initialized = true;
    document.addEventListener?.('click', handleClick, true);
    window.addEventListener?.('hashchange', () => enforceSoon(50));
    window.addEventListener?.('popstate', () => enforceSoon(50));
    detect();
  };

  Object.assign(lockdown, {
    init,
    detect,
    enforce,
    enforceSoon,
    isRestricted,
    isAllowedControl,
    setGuestState
  });
})();
