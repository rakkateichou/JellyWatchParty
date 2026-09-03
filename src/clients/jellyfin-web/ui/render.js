(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const ui = JWP.ui = JWP.ui || {};
  const state = JWP.state;
  const utils = JWP.utils;
  const { PANEL_ID, BTN_ID, SYNC_HIDE_STYLE_ID } = JWP.constants;
  const GLOBAL_BTN_ID = 'jwp-global-btn';
  const PLAYER_DOCK_CLASS = 'jwp-player-docked';
  const CHAT_THEMES = [
    { id: 'monochrome', label: 'Monochrome' },
    { id: 'frost', label: 'Frost' },
    { id: 'violet', label: 'Violet' },
    { id: 'ember', label: 'Ember' }
  ];

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
      <div id="jwp-chat-input-container">
        <button type="button" id="jwp-emote-toggle" title="Emotes" aria-label="Emotes" aria-expanded="false"><span class="material-icons" aria-hidden="true">sentiment_very_satisfied</span></button>
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
    const panel = document.getElementById(PANEL_ID);
    const isDesktop = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 800px)').matches
      : (window.innerWidth || 1024) >= 800;
    const isVideoPage = /^#\/video(?:[/?]|$)/i.test(window.location.hash || '');
    const shouldDock = !!(
      isDesktop
      && state.inRoom
      && isVideoPage
      && utils.getVideo()
      && panel
      && !panel.classList.contains('hide')
    );
    root.classList.toggle(PLAYER_DOCK_CLASS, shouldDock);
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
    state.invitePromise = null;
  };

  const prepareInviteLink = () => {
    const itemId = state.roomMediaId || utils.getCurrentItemId();
    const roomId = state.roomId;
    if (!itemId || !roomId) {
      return Promise.reject(new Error('Could not identify this room or title.'));
    }
    if (state.inviteRoomId === roomId && state.inviteBaseUrl) {
      return Promise.resolve(state.inviteBaseUrl);
    }
    if (state.inviteRoomId === roomId && state.invitePromise) {
      return state.invitePromise;
    }
    if (!state.isHost) {
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
      if (userId && typeof apiClient.getItem === 'function') {
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
        body: JSON.stringify({ itemId: shareItemId, expiryHours: 6, oneUse: false })
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `HTTP ${response.status}`);
      }
      const data = await response.json();
      const rawUrl = data.ShareUrl || data.shareUrl;
      if (!rawUrl) throw new Error('The server did not return an invite URL.');
      if (state.roomId !== roomId || !state.isHost) {
        throw new Error('The room changed while preparing its invitation.');
      }
      state.inviteBaseUrl = rawUrl;
      state.inviteShareItemId = shareItemId;
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
    // Creation starts as soon as the room_state arrives. A click normally only
    // decorates the prepared ShareLinks URL with the current episode and copies
    // it; if the request is still in flight, the same promise is reused.
    const itemId = state.roomMediaId || utils.getCurrentItemId();
    const roomId = state.roomId;
    if (!itemId || !roomId) {
      ui.showToast('Could not identify this room or title.');
      return;
    }

    const oldHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = state.invitePromise ? 'Finishing link…' : 'Copying…';
    try {
      const rawUrl = await prepareInviteLink();
      const invite = new URL(rawUrl, window.location.origin);
      invite.searchParams.set('party', roomId);
      invite.searchParams.set('media', itemId);
      const copied = await copyText(invite.toString());
      ui.showToast(copied
        ? 'Link copied'
        : `Invite ready: ${invite.toString()}`);
    } catch (err) {
      console.error('[JellyWatchParty] Could not create guest invite:', err);
      ui.showToast(state.isHost
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
    panel.classList.toggle('hide');
    if (!panel.classList.contains('hide')) render(true);
    updateDockedPlayerLayout();
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
    if (btn) btn.onclick = async () => {
      if (!JWP.actions || !JWP.actions.createRoom) return;
      const password = await ui.promptText({
        title: 'Room password (optional, leave blank for none):',
        placeholder: 'Password',
        submitLabel: 'Create Room'
      });
      if (password === null) return; // cancelled — don't create a room
      JWP.actions.createRoom(password);
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
          <button class="jwp-btn secondary jwp-invite-btn" id="jwp-btn-invite"><span class="material-icons" aria-hidden="true">link</span> Copy link</button>
          <button class="jwp-icon-btn" id="jwp-btn-settings" title="Chat settings" aria-label="Chat settings" aria-pressed="${state.chatSettingsOpen}"><span class="material-icons" aria-hidden="true">settings</span></button>
          <button class="jwp-icon-btn" id="jwp-btn-hide" title="Hide panel" aria-label="Hide panel"><span class="material-icons" aria-hidden="true">chevron_right</span></button>
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
    const emoteToggle = panel.querySelector('#jwp-emote-toggle');
    const emotePicker = panel.querySelector('#jwp-emote-picker');
    const closeEmotePicker = () => {
      if (!emotePicker || !emoteToggle) return;
      emotePicker.hidden = true;
      emoteToggle.setAttribute('aria-expanded', 'false');
    };
    if (emoteToggle && emotePicker) {
      emoteToggle.onclick = (event) => {
        event.stopPropagation();
        const willOpen = emotePicker.hidden;
        emotePicker.hidden = !willOpen;
        emoteToggle.setAttribute('aria-expanded', String(willOpen));
      };
      panel.querySelectorAll('.jwp-emote-option').forEach(button => {
        button.onclick = () => {
          if (JWP.chat?.insertEmote?.(chatInput, button.dataset.jwpEmote)) closeEmotePicker();
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
      if (e.key === 'Enter' && !e.shiftKey) {
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
      JWP.chat.markRead();
      JWP.chat.renderAllMessages();
    }
  };

  const render = (forceFullRender = false) => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    setPanelTheme(state.panelTheme);
    if (!forceFullRender && panel.dataset.inRoom === String(state.inRoom) && panel.children.length > 0) {
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
    if (!state.inRoom) {
      renderLobby(panel);
    } else {
      renderRoom(panel);
      setupChatInput(panel);
    }
    ui.updateStatusIndicator();
    ui.renderHomeWatchParties();
    updateDockedPlayerLayout();
  };

  const injectOsdButton = () => {
    if (document.getElementById(BTN_ID)) return;
    const videoOsd = document.querySelector('.videoOsdBottom .buttons');
    if (!videoOsd) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.className = 'paper-icon-button-light btnWatchParty autoSize';
    btn.title = 'Watch Party';
    btn.innerHTML = '<span class="material-icons groups" aria-hidden="true"></span>';
    btn.onclick = togglePanel;
    const favBtn = videoOsd.querySelector('[title="Add to favorites"], [title="Remove from favorites"]');
    if (favBtn) {
      favBtn.insertAdjacentElement('beforebegin', btn);
    } else {
      videoOsd.appendChild(btn);
    }
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
    injectOsdButton,
    injectGlobalButton,
    applyNativeSyncButtonVisibility,
    updateDockedPlayerLayout,
    prepareInviteLink,
    resetPreparedInvite
  });
})();
