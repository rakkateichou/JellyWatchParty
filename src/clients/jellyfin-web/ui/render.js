(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const ui = JWP.ui = JWP.ui || {};
  const state = JWP.state;
  const utils = JWP.utils;
  const { PANEL_ID, BTN_ID, SYNC_HIDE_STYLE_ID } = JWP.constants;
  const GLOBAL_BTN_ID = 'jwp-global-btn';
  const CHAT_REOPEN_ID = 'jwp-chat-reopen';
  const PLAYER_DOCK_CLASS = 'jwp-player-docked';
  const CHAT_THEMES = [
    { id: 'monochrome', label: 'Monochrome' },
    { id: 'frost', label: 'Frost' },
    { id: 'violet', label: 'Violet' },
    { id: 'ember', label: 'Ember' }
  ];

  // Entry chat is available before Jellyfin's icon font has loaded.
  const icon = (name) => {
    const paths = {
      link: '<path d="M10 14l4-4M8 10l-3 3a4.25 4.25 0 0 0 6 6l3-3M10 8l3-3a4.25 4.25 0 0 1 6 6l-3 3"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/><circle cx="12" cy="12" r="7"/>',
      chevron: '<path d="m9 5 7 7-7 7"/>',
      smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 8v2m8-2v2"/>'
    };
    return `<svg class="jwp-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  };

  const storePreference = (key, value) => {
    try { window.localStorage?.setItem(key, value); } catch (err) {}
  };

  const setPanelTheme = (theme, persist = false) => {
    const allowed = JWP.constants.PANEL_THEMES || CHAT_THEMES.map(item => item.id);
    const normalized = allowed.includes(theme) ? theme : 'monochrome';
    state.panelTheme = normalized;
    const panel = document.getElementById(PANEL_ID);
    if (panel?.dataset) panel.dataset.theme = normalized;
    if (persist) storePreference(JWP.constants.PANEL_THEME_STORAGE_KEY, normalized);
  };

  const setPanelBrightness = (value, persist = false) => {
    const brightness = JWP.constants.normalizePanelBrightness(value);
    state.panelBrightness = brightness;
    const panel = document.getElementById(PANEL_ID);
    // Keep the minimum faintly visible so the slider can still be found on OLED.
    panel?.style?.setProperty('--jwp-panel-brightness', String(Math.max(0.02, brightness / 100)));
    const output = panel?.querySelector('#jwp-panel-brightness-value');
    if (output) output.textContent = `${brightness}%`;
    if (persist) storePreference(JWP.constants.PANEL_BRIGHTNESS_STORAGE_KEY, String(brightness));
  };

  const saveNickname = (value) => {
    const nickname = String(value || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 100);
    if (!nickname) return false;
    state.chatNickname = nickname;
    storePreference(JWP.constants.CHAT_NICKNAME_STORAGE_KEY, nickname);
    return true;
  };

  const renderThemeOptions = () => CHAT_THEMES.map(theme => `
    <button type="button" class="jwp-theme-option" data-jwp-theme="${theme.id}" aria-pressed="${state.panelTheme === theme.id}">
      <span class="jwp-theme-swatch" aria-hidden="true"></span>
      <span>${theme.label}</span>
    </button>
  `).join('');

  const renderNicknameGate = () => `
    <div class="jwp-nickname-gate">
      <div class="jwp-settings-title">Choose a nickname</div>
      <div class="jwp-settings-copy">This is the name everyone in the room will see. It’s saved on this device.</div>
      <input type="text" id="jwp-nickname-input" class="jwp-input" maxlength="100" autocomplete="nickname" placeholder="Nickname">
      <button class="jwp-btn jwp-settings-save" id="jwp-nickname-save">Enter chat</button>
    </div>
  `;

  const renderChatSettings = () => `
    <div id="jwp-chat-settings">
      <div class="jwp-settings-title">Chat settings</div>
      <label class="jwp-settings-label" for="jwp-settings-nickname">Nickname</label>
      <input type="text" id="jwp-settings-nickname" class="jwp-input" maxlength="100" autocomplete="nickname" value="${utils.escapeHtml(state.chatNickname)}" placeholder="Nickname">
      <div class="jwp-settings-label">Theme</div>
      <div class="jwp-theme-options">${renderThemeOptions()}</div>
      <label class="jwp-settings-label jwp-brightness-label" for="jwp-panel-brightness">Panel brightness <output id="jwp-panel-brightness-value" for="jwp-panel-brightness">${state.panelBrightness}%</output></label>
      <input type="range" id="jwp-panel-brightness" min="0" max="100" step="1" value="${state.panelBrightness}" aria-label="Panel brightness" aria-describedby="jwp-panel-brightness-hint">
      <div class="jwp-settings-copy" id="jwp-panel-brightness-hint">Dims the whole panel. 0% is near-black; 100% is normal.</div>
      <button class="jwp-btn jwp-settings-save" id="jwp-settings-save">Save settings</button>
      <div class="jwp-settings-room-actions">
        <button class="jwp-btn danger" id="jwp-settings-leave">Leave room</button>
        ${state.isRoomOwner ? '<button class="jwp-btn danger jwp-delete-room" id="jwp-settings-delete">Delete room for everyone</button>' : ''}
      </div>
    </div>
  `;

  const renderChatArea = () => `
    <div id="jwp-chat-section">
      <div id="jwp-chat-messages"></div>
      <div id="jwp-chat-reply-preview" hidden>
        <div class="jwp-chat-reply-summary" role="status"><strong id="jwp-chat-reply-label"></strong><span id="jwp-chat-reply-text"></span></div>
        <button type="button" id="jwp-chat-reply-cancel" aria-label="Cancel reply" title="Cancel reply">×</button>
      </div>
      <div id="jwp-chat-input-container">
        <button type="button" id="jwp-emote-toggle" title="Emotes" aria-label="Emotes" aria-expanded="false">${icon('smile')}</button>
        <div id="jwp-emote-picker" role="dialog" aria-label="Emotes" hidden>
          <div class="jwp-emote-picker-title">Emotes</div>
          <div class="jwp-emote-grid">
            ${(JWP.chat?.emotes || []).map(emote => `<button type="button" class="jwp-emote-option" data-jwp-emote="${emote.token}" title="${emote.token}" aria-label="${emote.label}"><img class="jwp-emote-picker-image" src="${emote.src}" alt="" loading="lazy" decoding="async"><small>${emote.label}</small></button>`).join('')}
          </div>
          <div class="jwp-emote-picker-hint">Type :pe to find emotes. Use ↑/↓ to choose, Enter or Tab to insert.</div>
        </div>
        <input type="text" id="jwp-chat-input" placeholder="Type a message..." maxlength="500">
        <button id="jwp-chat-send">Send</button>
      </div>
    </div>
  `;

  const updateDockedPlayerLayout = () => {
    const root = document.documentElement;
    if (!root?.classList) return;
    // Room members reopen chat with the arrow; the group icon launches the lobby.
    root.classList.toggle('jwp-in-room', !!state.inRoom);
    // Remove the former launcher if Jellyfin retained its OSD across a refresh.
    document.getElementById(BTN_ID)?.remove();
    const panel = document.getElementById(PANEL_ID);
    const isDesktop = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 800px)').matches
      : (window.innerWidth || 1024) >= 800;
    const isVideoPage = JWP.playback?.isVideoPage
      ? JWP.playback.isVideoPage()
      : /^#\/(?:video|playback)(?:[/?]|$)/i.test(window.location.hash || '') && !!utils.getVideo();
    const shouldDock = !!(
      isDesktop
      && state.inRoom
      && isVideoPage
      && panel
      && !panel.classList.contains('hide')
    );
    root.classList.toggle(PLAYER_DOCK_CLASS, shouldDock);

    const hidden = !!panel?.classList.contains('hide');
    const canReopen = state.inRoom && hidden && !state.guestClosedMessage;
    root.classList.toggle('jwp-chat-collapsed', canReopen);
    let reopen = document.getElementById(CHAT_REOPEN_ID);
    if (canReopen && !reopen) {
      reopen = document.createElement('button');
      reopen.id = CHAT_REOPEN_ID;
      reopen.type = 'button';
      reopen.title = 'Show chat';
      reopen.setAttribute('aria-label', 'Show chat');
      reopen.setAttribute('aria-controls', PANEL_ID);
      reopen.innerHTML = icon('chevron');
      reopen.onclick = togglePanel;
      ui.stopPlayerCapture(reopen);
    }
    if (reopen) {
      // Give the arrow its own place after the native header buttons. Waiting
      // and joining screens need it outside the hidden Jellyfin header.
      const header = !state.waitingForTitle && !state.inviteJoinActive && !state.roomJoinActive
        ? document.querySelector(isVideoPage ? '.skinHeader.osdHeader .headerRight' : '.skinHeader .headerRight') : null;
      const target = header || document.body;
      if (canReopen && reopen.parentElement !== target) target.appendChild(reopen);
      reopen.hidden = !canReopen;
    }
  };

  const updateWaitingRoom = () => {
    const waiting = !!(state.inRoom && state.waitingForTitle);
    document.documentElement?.classList?.toggle('jwp-room-waiting', waiting);
    let screen = document.getElementById('jwp-waiting-player');
    if (!waiting) {
      screen?.remove();
      return;
    }
    if (!screen) {
      screen = document.createElement('section');
      screen.id = 'jwp-waiting-player';
      screen.setAttribute('aria-label', 'Watch party player');
      screen.innerHTML = `<div class="jwp-waiting-message" role="status">
        <span class="material-icons" aria-hidden="true">movie</span>
        <h1>Waiting for a title</h1>
        <p>Wait until the owner of the room picks a title.</p>
        <p class="jwp-waiting-hint">You can chat while you wait. Playback will open automatically.</p>
      </div>`;
      document.body.appendChild(screen);
    }
    if (!state.panelCollapsed) document.getElementById(PANEL_ID)?.classList.remove('hide');
  };

  const copyText = async (value) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (err) {
        // Fall through to the DOM copy path for non-secure/private contexts.
      }
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.readOnly = true;
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    document.body.appendChild(input);
    input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (err) {}
    input.remove();
    return copied;
  };

  const resetPreparedInvite = () => {
    state.inviteRoomId = '';
    state.inviteBaseUrl = '';
    state.inviteShareItemId = '';
    state.inviteMediaId = null;
    state.invitePromise = null;
  };

  const isCompactInviteUrl = value => {
    if (!value) return false;
    try {
      const fallbackOrigin = window.location?.origin || 'http://localhost';
      const path = new URL(value, fallbackOrigin).pathname;
      return /\/j\/[^/]+\/?$/.test(path);
    } catch (err) {
      return false;
    }
  };

  const prepareInviteLink = () => {
    const itemId = state.roomMediaId || '';
    const roomId = state.roomId;
    const canPrepareInvite = state.isHost && !state.guestMode;
    if (!roomId) {
      return Promise.reject(new Error('Could not identify this room.'));
    }
    if (state.inviteRoomId === roomId && state.inviteBaseUrl
        && (!canPrepareInvite || (isCompactInviteUrl(state.inviteBaseUrl) && state.inviteMediaId === itemId))) {
      return Promise.resolve(state.inviteBaseUrl);
    }
    if (state.inviteRoomId === roomId && state.invitePromise) {
      return state.invitePromise;
    }
    if (!canPrepareInvite) {
      return Promise.reject(new Error('The host is still preparing this invitation.'));
    }

    const apiClient = window.ApiClient;
    if (!apiClient) {
      return Promise.reject(new Error('Could not access Jellyfin to prepare this invitation.'));
    }

    resetPreparedInvite();
    state.inviteRoomId = roomId;
    const pending = (async () => {
      const serverAddress = typeof apiClient.serverAddress === 'function'
        ? apiClient.serverAddress()
        : (apiClient._serverAddress || '');
      const accessToken = typeof apiClient.accessToken === 'function'
        ? apiClient.accessToken()
        : '';
      const userId = typeof apiClient.getCurrentUserId === 'function'
        ? apiClient.getCurrentUserId()
        : apiClient._currentUserId;
      let shareItemId = itemId;
      if (itemId && userId && typeof apiClient.getItem === 'function') {
        const item = await apiClient.getItem(userId, itemId);
        if (item?.Type === 'Series') {
          shareItemId = item.Id;
        } else if (item?.SeriesId) {
          // The permission remains scoped to the whole series so the room can
          // continue through episodes without issuing another guest account.
          shareItemId = item.SeriesId;
        }
      }

      const response = await fetch(`${serverAddress}/ShareLinks/Admin/Create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: JWP.utils.buildAuthHeader(window.ApiClient, accessToken)
        },
        body: JSON.stringify({
          itemId: shareItemId || null,
          expiryHours: 6,
          oneUse: false,
          partyId: roomId,
          mediaId: itemId || null
        })
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `HTTP ${response.status}`);
      }
      const data = await response.json();
      const rawUrl = data.ShareUrl || data.shareUrl;
      if (!rawUrl) throw new Error('The server did not return an invite URL.');
      if (state.roomId !== roomId || !state.isHost || state.guestMode) {
        throw new Error('The room changed while preparing its invitation.');
      }
      state.inviteBaseUrl = rawUrl;
      state.inviteShareItemId = shareItemId;
      state.inviteMediaId = itemId;
      // Share the reusable base URL with current and future room members.
      // They can then copy the same invitation without admin permissions.
      JWP.actions?.send?.('invite_update', { invite_url: rawUrl });
      return rawUrl;
    })();

    state.invitePromise = pending.then(
      value => {
        if (state.inviteRoomId === roomId) state.invitePromise = null;
        return value;
      },
      err => {
        if (state.inviteRoomId === roomId) state.invitePromise = null;
        throw err;
      }
    );
    return state.invitePromise;
  };

  const createInviteLink = async (button) => {
    // Creation starts as soon as the room_state arrives. The ShareLinks server
    // stores the room and media routing behind its short code, so a click only
    // copies the already-prepared URL.
    const roomId = state.roomId;
    if (!roomId) {
      ui.showToast('Could not identify this room.');
      return;
    }

    const oldHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = state.invitePromise ? 'Finishing link…' : 'Copying…';
    try {
      const rawUrl = await prepareInviteLink();
      const invite = new URL(rawUrl, window.location.origin).toString();
      const copied = await copyText(invite);
      ui.showToast(copied
        ? 'Link copied'
        : `Invite ready: ${invite}`);
    } catch (err) {
      console.error('[JellyWatchParty] Could not create guest invite:', err);
      ui.showToast(state.isHost && !state.guestMode
        ? 'Could not create the invite link. Check that ShareLinks is enabled.'
        : 'The invite link is still being prepared by the host.');
    } finally {
      button.disabled = false;
      button.innerHTML = oldHtml;
    }
  };
  // aria-controls value of Jellyfin 12's MUI SyncPlay button, exported as
  // `ID` from jellyfin-web's apps/modern/components/AppToolbar/menus/
  // SyncPlayMenu.tsx — the only stable selector for that button, since MUI
  // assigns it no meaningful class name of its own.
  const SYNC_PLAY_MENU_ID = 'app-sync-play-menu';

  // Jellyfin's built-in SyncPlay button is `.headerSyncButton` (also carries
  // `.syncButton`) — rendered in the app header and, during playback, in the
  // player OSD header (see jellyfin-web libraryMenu.js / videoosd.scss). On
  // Jellyfin 12's default MUI toolbar it's a different component entirely
  // (apps/modern/components/AppToolbar/SyncPlayButton.tsx), identified by
  // `aria-controls="app-sync-play-menu"` — MUI generates no stable class name
  // of its own. When the admin enables "Hide native SyncPlay button",
  // JellyWatchParty's own watch-party controls replace it, so we hide it via
  // an injected stylesheet. CSS (rather than removing the node) survives
  // Jellyfin's SPA re-renders, which repeatedly rebuild the header DOM, and
  // avoids fighting React over nodes it owns.
  //
  // `display: none` is correct for both: our own button is now a real in-flow
  // child of the same flex container (see tryInjectMuiToolbar below), so it
  // simply takes the freed slot. Earlier versions needed `visibility: hidden`
  // here purely to keep the hidden button's layout box measurable for
  // absolute-positioning math; that math is gone.
  const applyNativeSyncButtonVisibility = () => {
    const existing = document.getElementById(SYNC_HIDE_STYLE_ID);
    if (state.hideNativeSyncButton) {
      if (existing) return;
      const style = document.createElement('style');
      style.id = SYNC_HIDE_STYLE_ID;
      style.textContent = '.headerSyncButton, .syncButton { display: none !important; } '
        + `[aria-controls="${SYNC_PLAY_MENU_ID}"] { display: none !important; }`;
      document.head.appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  };

  const togglePanel = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const chatInput = panel.querySelector('#jwp-chat-input');
    if (chatInput && JWP.chat) JWP.chat.draftText = chatInput.value;
    if (!panel.classList.contains('hide')) {
      const bounds = panel.querySelector('#jwp-btn-hide')?.getBoundingClientRect?.();
      if (bounds?.width && bounds.height) {
        const root = document.documentElement;
        const viewportWidth = root.clientWidth || window.innerWidth;
        root.style.setProperty('--jwp-chat-reopen-top', `${bounds.top}px`);
        root.style.setProperty('--jwp-chat-reopen-right', `${Math.max(0, viewportWidth - bounds.right)}px`);
      }
    }
    panel.classList.toggle('hide');
    state.panelCollapsed = panel.classList.contains('hide');
    if (state.panelCollapsed) JWP.chat?.closeEmoteAutocomplete?.(true);
    if (!state.panelCollapsed) render(true);
    updateDockedPlayerLayout();
    if (state.panelCollapsed) document.getElementById(CHAT_REOPEN_ID)?.focus();
    else (panel.querySelector('#jwp-chat-input') || panel.querySelector('#jwp-btn-settings'))?.focus();
  };

  const renderLobby = (panel) => {
    // The native-client host bridge is an opt-in admin feature: only surface
    // the "Host From Another Device" picker when an admin has enabled it.
    const bridgeSection = state.allowThirdPartyHost ? `
          <div class="jwp-section jwp-section-divider">
            <div class="jwp-label">Host From Another Device (e.g. Fladder)</div>
            <div id="jwp-bridge-active"></div>
            <div id="jwp-bridge-available"></div>
          </div>` : '';
    panel.innerHTML = `
      <div class="jwp-header"><span>JellyWatchParty</span></div>
      <div class="jwp-lobby-container">
          <div class="jwp-section">
            <div class="jwp-label">Available Rooms</div>
            <div id="jwp-room-list"></div>
          </div>
          <div class="jwp-section jwp-section-divider">
            <button class="jwp-btn" style="width:100%" id="jwp-btn-create">Create Room</button>
          </div>
          ${bridgeSection}
      </div>
    `;
    const btn = panel.querySelector('#jwp-btn-create');
    if (btn) btn.onclick = () => {
      if (!JWP.actions || !JWP.actions.createRoom) return;
      JWP.actions.createRoom();
    };
    ui.updateRoomListUI();
    ui.updateBridgeListUI();
  };

  const renderRoom = (panel) => {
    const participantCount = state.participantCount || 1;
    // Attaching a supported client (e.g. Android TV) as a receiver of this
    // room is an opt-in admin feature: only surface the picker when enabled.
    const bridgeSection = state.allowSupportedReceiver ? `
      <div class="jwp-section jwp-section-divider" style="flex-shrink:0;">
        <div class="jwp-label">Add a Device to This Room</div>
        <div id="jwp-bridge-active"></div>
        <div id="jwp-bridge-available"></div>
      </div>` : '';
    const roomContent = state.chatSettingsOpen
      ? renderChatSettings()
      : (state.chatNickname ? renderChatArea() : renderNicknameGate());
    panel.innerHTML = `
      <div class="jwp-room-toolbar">
        <div id="jwp-participants-list" class="jwp-participants-list">${participantCount} online</div>
        <div class="jwp-room-actions">
          <button class="jwp-btn secondary jwp-invite-btn" id="jwp-btn-invite">${icon('link')} Copy link</button>
          <button type="button" class="jwp-icon-btn" id="jwp-btn-settings" title="Chat settings" aria-label="Chat settings" aria-expanded="${state.chatSettingsOpen}">${icon('settings')}</button>
          <button class="jwp-icon-btn" id="jwp-btn-hide" title="Hide panel" aria-label="Hide panel">${icon('chevron')}</button>
        </div>
      </div>
      ${roomContent}
      ${bridgeSection}
    `;
    const hideBtn = panel.querySelector('#jwp-btn-hide');
    if (hideBtn) hideBtn.onclick = togglePanel;
    const inviteBtn = panel.querySelector('#jwp-btn-invite');
    if (inviteBtn) inviteBtn.onclick = () => createInviteLink(inviteBtn);
    ui.updateBridgeListUI();
  };

  const setupChatInput = (panel) => {
    const settingsButton = panel.querySelector('#jwp-btn-settings');
    if (settingsButton) settingsButton.onclick = () => {
      state.chatSettingsOpen = !state.chatSettingsOpen;
      render(true);
    };

    const bindNicknameSave = (inputSelector, buttonSelector, closeSettings) => {
      const input = panel.querySelector(inputSelector);
      const button = panel.querySelector(buttonSelector);
      if (!input || !button) return;
      ui.stopPlayerCapture(input);
      const submit = () => {
        if (!saveNickname(input.value)) {
          input.classList.add('jwp-input-error');
          input.focus();
          ui.showToast('Enter a nickname first');
          return;
        }
        state.chatSettingsOpen = closeSettings ? false : state.chatSettingsOpen;
        render(true);
      };
      button.onclick = submit;
      input.addEventListener('input', () => input.classList.remove('jwp-input-error'));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      });
    };

    bindNicknameSave('#jwp-nickname-input', '#jwp-nickname-save', false);
    bindNicknameSave('#jwp-settings-nickname', '#jwp-settings-save', true);

    const brightnessInput = panel.querySelector('#jwp-panel-brightness');
    if (brightnessInput) {
      ui.stopPlayerCapture(brightnessInput);
      brightnessInput.addEventListener('input', () => setPanelBrightness(brightnessInput.value, true));
    }

    const leaveButton = panel.querySelector('#jwp-settings-leave');
    if (leaveButton) leaveButton.onclick = () => JWP.actions?.leaveRoom?.();

    const deleteButton = panel.querySelector('#jwp-settings-delete');
    if (deleteButton) deleteButton.onclick = async () => {
      const confirmed = await ui.confirmAction?.({
        title: 'Delete this room?',
        message: 'Everyone will be disconnected immediately.',
        submitLabel: 'Delete room',
        danger: true
      });
      if (!confirmed) return;
      deleteButton.disabled = true;
      deleteButton.textContent = 'Deleting…';
      if (!JWP.actions?.deleteRoom?.()) {
        deleteButton.disabled = false;
        deleteButton.textContent = 'Delete room for everyone';
      }
    };

    if (typeof panel.querySelectorAll === 'function') {
      panel.querySelectorAll('[data-jwp-theme]').forEach(button => {
        button.onclick = () => {
          setPanelTheme(button.dataset.jwpTheme, true);
          panel.querySelectorAll('[data-jwp-theme]').forEach(option => {
            option.setAttribute('aria-pressed', String(option === button));
          });
        };
      });
    }

    const chatInput = panel.querySelector('#jwp-chat-input');
    const chatSend = panel.querySelector('#jwp-chat-send');
    if (!chatInput || !chatSend) return;
    chatInput.value = JWP.chat?.draftText || '';
    chatInput.addEventListener('input', () => { if (JWP.chat) JWP.chat.draftText = chatInput.value; });
    const replyCancel = panel.querySelector('#jwp-chat-reply-cancel');
    if (replyCancel) replyCancel.onclick = () => { JWP.chat?.cancelReply(); chatInput.focus(); };
    JWP.chat?.updateReplyPreview?.();
    const emoteToggle = panel.querySelector('#jwp-emote-toggle');
    const emotePicker = panel.querySelector('#jwp-emote-picker');
    JWP.chat?.initEmoteAutocomplete?.(chatInput, panel.querySelector('#jwp-chat-input-container'));
    const closeEmotePicker = () => {
      if (!emotePicker || !emoteToggle) return;
      emotePicker.hidden = true;
      emoteToggle.setAttribute('aria-expanded', 'false');
    };
    if (emoteToggle && emotePicker) {
      const keepWheelInPicker = (event) => event.stopPropagation();
      emotePicker.onwheel = keepWheelInPicker;
      emotePicker.onmousewheel = keepWheelInPicker;
      emoteToggle.onclick = (event) => {
        event.stopPropagation();
        const willOpen = emotePicker.hidden;
        JWP.chat?.closeEmoteAutocomplete?.(true);
        emotePicker.hidden = !willOpen;
        emoteToggle.setAttribute('aria-expanded', String(willOpen));
      };
      panel.querySelectorAll('.jwp-emote-option').forEach(button => {
        button.onclick = () => {
          JWP.chat?.closeEmoteAutocomplete?.(true);
          JWP.chat?.insertEmote?.(chatInput, button.dataset.jwpEmote);
        };
      });
    }
    ui.stopPlayerCapture(chatInput);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && emotePicker && !emotePicker.hidden) {
        e.preventDefault();
        closeEmotePicker();
        return;
      }
      if (e.key === 'Escape' && JWP.chat?.replyTo) {
        e.preventDefault();
        JWP.chat.cancelReply();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (JWP.chat && JWP.chat.send(chatInput.value)) {
          chatInput.value = '';
          closeEmotePicker();
        }
      }
    });
    chatSend.addEventListener('click', () => {
      JWP.chat?.closeEmoteAutocomplete?.(true);
      if (JWP.chat && JWP.chat.send(chatInput.value)) {
        chatInput.value = '';
        closeEmotePicker();
      }
    });
    if (JWP.chat) {
      if (!panel.classList.contains('hide')) JWP.chat.markRead();
      JWP.chat.renderAllMessages();
    }
  };

  const render = (forceFullRender = false) => {
    ui.updateSyncIndicator();
    updateWaitingRoom();
    JWP.guestLockdown?.updateGuestView?.();
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    setPanelTheme(state.panelTheme);
    setPanelBrightness(state.panelBrightness);
    const view = state.guestClosedMessage ? 'closed' : state.inRoom ? 'room'
      : (state.inviteJoinActive || state.pendingJoinRoomId || state.roomJoinPending || state.guestRoomId ? 'joining' : 'lobby');
    if (!forceFullRender && panel.dataset.view === view && panel.children.length > 0) {
      ui.updateStatusIndicator();
      ui.updateServerFooter();
      ui.updateSyncIndicator();
      ui.updateRoomListUI();
      ui.updateBridgeListUI();
      ui.renderHomeWatchParties();
      updateDockedPlayerLayout();
      return;
    }
    JWP.chat?.destroyEmoteAutocomplete?.();
    panel.dataset.inRoom = String(state.inRoom);
    panel.dataset.view = view;
    if (view === 'closed') {
      panel.innerHTML = `<div class="jwp-header">Watch party chat</div><p role="status">${utils.escapeHtml(state.guestClosedMessage)}</p>`;
    } else if (view === 'joining') {
      panel.innerHTML = `<div class="jwp-header">Watch party chat</div>
        <p class="jwp-connecting-note" role="status">Connecting to room…</p>
        ${state.chatNickname ? renderChatArea() : renderNicknameGate()}`;
      setupChatInput(panel);
      const input = panel.querySelector('#jwp-chat-input');
      const send = panel.querySelector('#jwp-chat-send');
      if (input) { input.disabled = true; input.placeholder = 'Connecting to room…'; }
      if (send) send.disabled = true;
    } else if (view === 'lobby') {
      renderLobby(panel);
    } else {
      renderRoom(panel);
      setupChatInput(panel);
    }
    ui.updateStatusIndicator();
    ui.renderHomeWatchParties();
    updateDockedPlayerLayout();
  };

  // Jellyfin 12's default "modern" (React/MUI) layout wraps the entire legacy
  // header DOM in a display:none ancestor — RootAppRouter.tsx renders
  // `<AppHeader isHidden={layoutManager.modern || isNewLayoutPath} />`, and
  // apphost.js's getDefaultLayout() returns the modern layout unconditionally
  // for any normal browser — even though scripts/libraryMenu.js still builds
  // .headerRight into that hidden subtree completely unconditionally. So
  // .headerRight still exists in the DOM on v12, it's just invisible; a plain
  // existence check can't tell the two situations apart. Mirrors jQuery's
  // :visible technique (verified against jellyfin-web's release-12.z source,
  // not assumed).
  const isRendered = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  // Jellyfin 10.11, and Jellyfin 12 only if the user manually opts back into
  // the legacy layout in Settings: insert into .headerRight as a native icon
  // button, like the rest of Jellyfin's own header buttons. Once inserted, no
  // further per-tick management is needed — .headerRight's own visibility is
  // entirely CSS-driven by Jellyfin's header wrapper, so the button shows and
  // hides itself in step with it automatically.
  const tryInjectLegacyHeader = () => {
    const headerRight = document.querySelector('.headerRight') || document.querySelector('.skinHeader .headerRight');
    if (!headerRight || !isRendered(headerRight)) return false;

    const btn = document.createElement('button');
    btn.id = GLOBAL_BTN_ID;
    // The trailing marker class records which strategy created this button so
    // injectGlobalButton() can tell the two apart later without re-deriving it
    // from the DOM around it.
    btn.className = 'paper-icon-button-light jwp-global-btn jwp-global-btn-legacy';
    btn.type = 'button';
    btn.title = 'JellyWatchParty';
    btn.setAttribute('aria-label', 'JellyWatchParty');
    btn.innerHTML = '<span class="material-icons groups" aria-hidden="true"></span>';
    btn.onclick = togglePanel;

    headerRight.prepend(btn);
    return true;
  };

  // Jellyfin 12's default layout renders a React/MUI toolbar instead
  // (components/toolbar/AppToolbar.tsx), which has no .headerRight equivalent.
  // Its structure, verified against release-12.z, is:
  //
  //   <Toolbar class="MuiToolbar-root ...">
  //     {children}                                        <- ServerButton/UserViewNav
  //     <Box sx={{flexGrow:1, justifyContent:'flex-end'}}> <- the "actions" box:
  //       <SyncPlayButton/><RemotePlayButton/><SearchButton/>
  //     </Box>
  //     <Box sx={{flexGrow:0}}><UserMenuButton/></Box>     <- the avatar
  //   </Toolbar>
  //
  // That actions box is the correct home for a plugin button: it is the same
  // flex container Jellyfin uses for its own toolbar actions, so an in-flow
  // child lands in the right place with no coordinate math whatsoever.
  //
  // Contrary to a long-standing assumption in this plugin, React does *not*
  // remove foreign nodes from a container it manages. React reconciles
  // against its own fiber tree, deleting only nodes it created
  // (removeChild(specificNode)) and inserting relative to its own host
  // siblings; it never enumerates or clears the real child list. The one
  // exception is hydration, and jellyfin-web mounts with createRoot
  // (utils/reactUtils.tsx), never hydrateRoot. Verified empirically against
  // the real jellyfin-web 12.0 production build in Chromium: an appended
  // button survives 200 route navigations, MUI menu open/close churn and
  // viewport/breakpoint changes untouched.
  //
  // Only a genuine unmount of the toolbar removes it — which happens exactly
  // where the button should be gone anyway (the /video OSD, where
  // apps/modern/components/AppToolbar returns null). MutationObserver-driven
  // re-injection restores it on the way back.
  const MUI_TOOLBAR_SELECTOR = '.MuiToolbar-root';
  const AVATAR_SELECTOR = '[aria-controls="app-user-menu"]';

  // Resolve the actions box via the avatar, since the avatar is the only
  // element in the toolbar with a stable, semantic selector of its own
  // (aria-controls="app-user-menu", from components/toolbar/UserMenuButton.tsx).
  // MUI assigns no meaningful class names to the two Boxes, so their identity
  // comes from position: the actions box is the toolbar child immediately
  // preceding the avatar's box.
  //
  // This naturally yields null exactly where no button should exist:
  //   - the video OSD and public paths (login/select-server) render
  //     isUserMenuAvailable={false}, so there is no avatar at all;
  //   - the legacy layout has no MUI toolbar.
  // The admin dashboard does reuse the same toolbar and avatar, so it needs
  // an explicit exclusion: apps/dashboard/AppLayout.tsx tags document.body
  // with `dashboardDocument` for its own CSS scoping, reused here.
  const findMuiActionsBox = () => {
    if (document.body.classList.contains('dashboardDocument')) return null;
    const avatar = document.querySelector(AVATAR_SELECTOR);
    if (!avatar || typeof avatar.closest !== 'function') return null;
    const toolbar = avatar.closest(MUI_TOOLBAR_SELECTOR);
    if (!toolbar) return null;
    const avatarBox = avatar.closest(`${MUI_TOOLBAR_SELECTOR} > *`);
    if (!avatarBox) return null;
    const box = avatarBox.previousElementSibling;
    return (box && toolbar.contains(box)) ? box : null;
  };

  // MUI 6 keeps its real styling in emotion-generated hash classes
  // (e.g. `css-z77o6z-MuiButtonBase-root-MuiIconButton-root`); the stable
  // `Mui*` class names are only selectors for overrides and carry no styles
  // themselves. So rather than hardcoding a hash that changes with every MUI
  // release, or hand-rolling a lookalike, copy the class list verbatim off a
  // real neighbouring IconButton. Measured against the live 12.0 build this
  // yields a *zero* computed-style difference from a native toolbar button.
  const findDonorButton = (box) => {
    if (typeof box.querySelectorAll !== 'function') return null;
    const candidates = box.querySelectorAll('button, a');
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.id === GLOBAL_BTN_ID) continue;
      if (el.classList && el.classList.contains('MuiIconButton-root')) return el;
    }
    return null;
  };

  const buildMuiButton = (donor) => {
    const btn = document.createElement('button');
    btn.id = GLOBAL_BTN_ID;
    btn.type = 'button';
    btn.title = 'JellyWatchParty';
    btn.setAttribute('aria-label', 'JellyWatchParty');
    // Fall back to the bare Mui* names plus our own reset when no donor is
    // available (e.g. SyncPlay/RemotePlay/Search all hidden on this page).
    btn.className = donor && donor.className
      ? `${donor.className} jwp-global-btn`
      : 'MuiButtonBase-root MuiIconButton-root MuiIconButton-colorInherit MuiIconButton-sizeLarge jwp-global-btn jwp-global-btn-standalone';
    btn.innerHTML = '<span class="material-icons groups" aria-hidden="true"></span>';
    btn.onclick = togglePanel;
    return btn;
  };

  const tryInjectMuiToolbar = () => {
    const box = findMuiActionsBox();
    if (!box) return false;
    box.appendChild(buildMuiButton(findDonorButton(box)));
    return true;
  };

  const injectGlobalButton = () => {
    const existing = document.getElementById(GLOBAL_BTN_ID);
    if (existing) {
      // The legacy .headerRight button needs no upkeep once inserted — its
      // visibility is entirely CSS-driven by Jellyfin's own header wrapper,
      // including while the legacy video OSD hides the whole header.
      //
      // The one exception is a live layout switch: Settings → Display → Layout
      // calls layoutManager.setLayout() without reloading the page
      // (apps/modern/features/preferences/hooks/useDisplaySettings.ts), so a
      // legacy button can end up stranded in a now-hidden header while the MUI
      // toolbar takes over. Only treat it as stranded when a MUI actions box
      // has actually appeared, so the legacy OSD case isn't churned.
      if (existing.classList && existing.classList.contains('jwp-global-btn-legacy')) {
        if (isRendered(existing) || !findMuiActionsBox()) return;
        existing.remove();
        tryInjectMuiToolbar();
        return;
      }

      const box = findMuiActionsBox();
      if (!box) {
        // Navigated somewhere the button must not appear: the video OSD or a
        // public path (no avatar at all), or the admin dashboard.
        existing.remove();
        return;
      }
      // React re-adds its own children relative to its own fiber siblings, so
      // after it tears down and rebuilds the action buttons ours can end up
      // ahead of them. Keep it pinned to the trailing slot next to the avatar.
      if (existing.parentElement !== box || box.lastElementChild !== existing) {
        box.appendChild(existing);
      }
      return;
    }
    // Try the v10.11-style DOM first; fall back to the v12 MUI toolbar.
    if (!tryInjectLegacyHeader()) {
      tryInjectMuiToolbar();
    }
  };

  // Jellyfin 12's toolbar is only rebuilt on real route transitions, so
  // observing the DOM reacts immediately and does far less work than polling.
  // Callbacks are coalesced through requestAnimationFrame because a single
  // React commit produces many mutation records, and because injectGlobalButton
  // mutates the DOM itself and would otherwise re-enter its own observer.
  let observer = null;
  let scheduled = false;

  const observeToolbar = () => {
    if (observer || typeof window.MutationObserver !== 'function') return;
    const raf = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (cb) => setTimeout(cb, 16);
    observer = new window.MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      raf(() => { scheduled = false; injectGlobalButton(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const disconnectToolbarObserver = () => {
    if (observer) { observer.disconnect(); observer = null; }
    scheduled = false;
  };

  Object.assign(ui, {
    render,
    injectGlobalButton,
    applyNativeSyncButtonVisibility,
    updateDockedPlayerLayout,
    updateWaitingRoom,
    prepareInviteLink,
    resetPreparedInvite,
    observeToolbar,
    disconnectToolbarObserver
  });
})();
