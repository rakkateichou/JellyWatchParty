(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const ui = JWP.ui = JWP.ui || {};
  const state = JWP.state;
  const utils = JWP.utils;
  const { PANEL_ID, BTN_ID, SYNC_HIDE_STYLE_ID } = JWP.constants;
  const GLOBAL_BTN_ID = 'jwp-global-btn';
  const PLAYER_DOCK_CLASS = 'jwp-player-docked';

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

  const createInviteLink = async (button) => {
    // The room's media id is the authoritative currently playing title. The
    // generic page detector can still point at the series page while the video
    // player is open, which made TV invitations land one level too high.
    const itemId = state.roomMediaId || utils.getCurrentItemId();
    const roomId = state.roomId;
    const apiClient = window.ApiClient;
    if (!itemId || !roomId || !apiClient) {
      ui.showToast('Could not identify this room or title.');
      return;
    }

    const oldHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Creating link…';
    try {
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
          // Keep the whole series as the guest's permission scope so episode
          // changes continue to work inside one room. The separate `media`
          // parameter below controls only the initial landing page.
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
      const invite = new URL(rawUrl, window.location.origin);
      invite.searchParams.set('party', roomId);
      invite.searchParams.set('media', itemId);
      const copied = await copyText(invite.toString());
      ui.showToast(copied
        ? 'Link copied'
        : `Invite ready: ${invite.toString()}`);
    } catch (err) {
      console.error('[JellyWatchParty] Could not create guest invite:', err);
      ui.showToast('Could not create the invite link. Check that ShareLinks is enabled.');
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
    const leaveLabel = state.isHost ? 'Close room' : 'Leave room';
    // Attaching a supported client (e.g. Android TV) as a receiver of this
    // room is an opt-in admin feature: only surface the picker when enabled.
    const bridgeSection = state.allowSupportedReceiver ? `
      <div class="jwp-section jwp-section-divider" style="flex-shrink:0;">
        <div class="jwp-label">Add a Device to This Room</div>
        <div id="jwp-bridge-active"></div>
        <div id="jwp-bridge-available"></div>
      </div>` : '';
    panel.innerHTML = `
      <div class="jwp-room-toolbar">
        <div id="jwp-participants-list" class="jwp-participants-list">${participantCount} online</div>
        <div class="jwp-room-actions">
          ${state.isHost ? '<button class="jwp-btn secondary jwp-invite-btn" id="jwp-btn-invite"><span class="material-icons" aria-hidden="true">link</span> Copy link</button>' : ''}
          <button class="jwp-icon-btn danger" id="jwp-btn-leave" title="${leaveLabel}" aria-label="${leaveLabel}"><span class="material-icons" aria-hidden="true">close</span></button>
        </div>
      </div>
      <div id="jwp-chat-section">
        <div id="jwp-chat-messages"></div>
        <div id="jwp-chat-input-container">
          <input type="text" id="jwp-chat-input" placeholder="Type a message..." maxlength="500">
          <button id="jwp-chat-send">Send</button>
        </div>
      </div>
      ${bridgeSection}
    `;
    const leaveBtn = panel.querySelector('#jwp-btn-leave');
    if (leaveBtn) leaveBtn.onclick = () => JWP.actions && JWP.actions.leaveRoom && JWP.actions.leaveRoom();
    const inviteBtn = panel.querySelector('#jwp-btn-invite');
    if (inviteBtn) inviteBtn.onclick = () => createInviteLink(inviteBtn);
    ui.updateBridgeListUI();
  };

  const setupChatInput = (panel) => {
    const chatInput = panel.querySelector('#jwp-chat-input');
    const chatSend = panel.querySelector('#jwp-chat-send');
    if (!chatInput || !chatSend) return;
    ui.stopPlayerCapture(chatInput);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (JWP.chat && JWP.chat.send(chatInput.value)) {
          chatInput.value = '';
        }
      }
    });
    chatSend.addEventListener('click', () => {
      if (JWP.chat && JWP.chat.send(chatInput.value)) {
        chatInput.value = '';
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

  Object.assign(ui, { render, injectOsdButton, injectGlobalButton, applyNativeSyncButtonVisibility, updateDockedPlayerLayout });
})();
