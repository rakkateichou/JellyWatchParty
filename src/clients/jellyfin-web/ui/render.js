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

  const setPanelOpacity = (value, persist = false) => {
    const opacity = JWP.constants.normalizePanelOpacity(value);
    state.panelOpacity = opacity;
    const panel = document.getElementById(PANEL_ID);
    panel?.style?.setProperty('--jwp-panel-opacity', String(opacity / 100));
    const output = panel?.querySelector('#jwp-panel-opacity-value');
    if (output) output.textContent = `${opacity}%`;
    if (persist) storePreference(JWP.constants.PANEL_OPACITY_STORAGE_KEY, String(opacity));
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
      <label class="jwp-settings-label jwp-opacity-label" for="jwp-panel-opacity">Panel opacity <output id="jwp-panel-opacity-value" for="jwp-panel-opacity">${state.panelOpacity}%</output></label>
      <input type="range" id="jwp-panel-opacity" min="0" max="100" step="1" value="${state.panelOpacity}" aria-label="Panel opacity">
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
          <div class="jwp-emote-picker-hint">You can also type an emote name, like :pog:</div>
        </div>
        <input type="text" id="jwp-chat-input" placeholder="Type a message..." maxlength="500">
        <button id="jwp-chat-send">Send</button>
      </div>
    </div>
  `;

  const updateDockedPlayerLayout = () => {
    const root = document.documentElement;
    if (!root?.classList) return;
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
    const fullScreenChat = !!(JWP.guestLockdown?.isRestricted?.() || state.waitingForTitle || state.inviteJoinActive || state.roomJoinActive);
    const canReopen = state.inRoom && hidden && (fullScreenChat || isVideoPage) && !state.guestClosedMessage;
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
      // Give the arrow its own place after the native player buttons. Waiting
      // and joining screens need it outside the hidden Jellyfin header.
      const playerHeader = isVideoPage && !state.waitingForTitle && !state.inviteJoinActive && !state.roomJoinActive
        ? document.querySelector('.skinHeader.osdHeader .headerRight') : null;
      const target = playerHeader || document.body;
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
          'X-Emby-Token': accessToken
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

  // Jellyfin's built-in SyncPlay button is `.headerSyncButton` (also carries
  // `.syncButton`) — rendered in the app header and, during playback, in the
  // player OSD header (see jellyfin-web libraryMenu.js / videoosd.scss). When
  // the admin enables "Hide native SyncPlay button", JellyWatchParty's own
  // watch-party controls replace it, so we hide it via an injected stylesheet.
  // CSS (rather than removing the node) survives Jellyfin's SPA re-renders,
  // which repeatedly rebuild the header DOM.
  const applyNativeSyncButtonVisibility = () => {
    const existing = document.getElementById(SYNC_HIDE_STYLE_ID);
    if (state.hideNativeSyncButton) {
      if (existing) return;
      const style = document.createElement('style');
      style.id = SYNC_HIDE_STYLE_ID;
      style.textContent = '.headerSyncButton, .syncButton { display: none !important; }';
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

    const opacityInput = panel.querySelector('#jwp-panel-opacity');
    if (opacityInput) {
      ui.stopPlayerCapture(opacityInput);
      opacityInput.addEventListener('input', () => setPanelOpacity(opacityInput.value, true));
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
        emotePicker.hidden = !willOpen;
        emoteToggle.setAttribute('aria-expanded', String(willOpen));
      };
      panel.querySelectorAll('.jwp-emote-option').forEach(button => {
        button.onclick = () => {
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
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (JWP.chat && JWP.chat.send(chatInput.value)) {
          chatInput.value = '';
          closeEmotePicker();
        }
      }
    });
    chatSend.addEventListener('click', () => {
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
    updateWaitingRoom();
    JWP.guestLockdown?.updateGuestView?.();
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    setPanelTheme(state.panelTheme);
    setPanelOpacity(state.panelOpacity);
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

  const injectGlobalButton = () => {
    if (document.getElementById(GLOBAL_BTN_ID)) return;
    const headerRight = document.querySelector('.headerRight') || document.querySelector('.skinHeader .headerRight');
    if (!headerRight) return;

    const btn = document.createElement('button');
    btn.id = GLOBAL_BTN_ID;
    btn.className = 'paper-icon-button-light jwp-global-btn';
    btn.type = 'button';
    btn.title = 'JellyWatchParty';
    btn.setAttribute('aria-label', 'JellyWatchParty');
    btn.innerHTML = '<span class="material-icons groups" aria-hidden="true"></span>';
    btn.onclick = togglePanel;

    headerRight.prepend(btn);
  };

  Object.assign(ui, {
    render,
    injectGlobalButton,
    applyNativeSyncButtonVisibility,
    updateDockedPlayerLayout,
    updateWaitingRoom,
    prepareInviteLink,
    resetPreparedInvite
  });
})();
