(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const ui = JWP.ui = JWP.ui || {};
  const { PANEL_ID, STYLE_ID } = JWP.constants;

  const CSS_STYLES = `
    html.jwp-invite-launching body::before {
      content: 'Joining watch party…';
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: grid;
      place-items: center;
      background: #000;
      color: rgba(255, 255, 255, .78);
      font: 600 1rem/1.4 system-ui, sans-serif;
      letter-spacing: .01em;
    }
    #${PANEL_ID} {
      --jwp-panel-top: rgba(13, 13, 14, .85);
      --jwp-panel-bottom: rgba(0, 0, 0, .85);
      --jwp-glow: rgba(255, 255, 255, .035);
      --jwp-panel-background: rgba(0, 0, 0, .85);
      --jwp-surface: rgba(255, 255, 255, .055);
      --jwp-surface-hover: rgba(255, 255, 255, .105);
      --jwp-border: rgba(255, 255, 255, .14);
      --jwp-border-strong: rgba(255, 255, 255, .27);
      --jwp-text: #f5f5f5;
      --jwp-muted: #b5b5b8;
      --jwp-faint: #77777c;
      --jwp-accent: #d8d8dc;
      --jwp-accent-strong: #ffffff;
      --jwp-accent-ink: #080808;
      --jwp-success: #ffffff;
      --jwp-danger: #ffffff;
      --jwp-action-bg: rgba(255, 255, 255, .075);
      --jwp-action-hover: rgba(255, 255, 255, .13);
      --jwp-input-bg: rgba(255, 255, 255, .035);
      --jwp-input-focus: rgba(255, 255, 255, .065);
      --jwp-focus: rgba(255, 255, 255, .86);
      --jwp-danger-bg: rgba(255, 255, 255, .075);
      --jwp-danger-hover: rgba(255, 255, 255, .13);
      position: fixed;
      right: 20px;
      bottom: 100px;
      width: min(340px, calc(100vw - 40px));
      max-height: 450px;
      padding: 1.15rem;
      border: 1px solid var(--jwp-border);
      border-radius: 1rem;
      background: var(--jwp-panel-background);
      -webkit-backdrop-filter: blur(24px) saturate(135%);
      backdrop-filter: blur(24px) saturate(135%);
      box-shadow: 0 18px 60px rgba(0, 0, 0, .42), inset 0 1px rgba(255, 255, 255, .035);
      box-sizing: border-box;
      color: var(--jwp-text);
      font-family: inherit;
      line-height: 1.4;
      z-index: 20000;
      display: flex;
      flex-direction: column;
    }
    #${PANEL_ID}[data-theme="frost"] {
      --jwp-panel-background:
        radial-gradient(circle at 90% 0%, var(--jwp-glow), transparent 38%),
        linear-gradient(180deg, var(--jwp-panel-top), var(--jwp-panel-bottom));
      --jwp-panel-top: rgba(30, 40, 54, .85);
      --jwp-panel-bottom: rgba(13, 20, 30, .85);
      --jwp-glow: rgba(105, 153, 188, .13);
      --jwp-border: rgba(190, 207, 229, .16);
      --jwp-border-strong: rgba(190, 207, 229, .26);
      --jwp-text: #e6ebf2;
      --jwp-muted: #9aa6b6;
      --jwp-faint: #6f7b8c;
      --jwp-accent: #b7d5e9;
      --jwp-accent-strong: #dce8f5;
      --jwp-accent-ink: #101722;
      --jwp-success: #76d6b0;
      --jwp-danger: #ff9da4;
      --jwp-action-bg: rgba(132, 171, 202, .16);
      --jwp-action-hover: rgba(148, 186, 216, .24);
      --jwp-input-bg: rgba(6, 12, 20, .42);
      --jwp-input-focus: rgba(9, 17, 27, .65);
      --jwp-focus: rgba(171, 210, 238, .9);
      --jwp-danger-bg: rgba(190, 57, 67, .18);
      --jwp-danger-hover: rgba(205, 65, 76, .27);
    }
    #${PANEL_ID}[data-theme="violet"] {
      --jwp-panel-background:
        radial-gradient(circle at 90% 0%, var(--jwp-glow), transparent 38%),
        linear-gradient(180deg, var(--jwp-panel-top), var(--jwp-panel-bottom));
      --jwp-panel-top: rgba(30, 24, 43, .85);
      --jwp-panel-bottom: rgba(11, 7, 18, .85);
      --jwp-glow: rgba(151, 108, 226, .17);
      --jwp-border: rgba(208, 184, 242, .17);
      --jwp-border-strong: rgba(216, 193, 248, .3);
      --jwp-text: #f2ecf9;
      --jwp-muted: #b7a9c8;
      --jwp-faint: #7e718f;
      --jwp-accent: #cbb2ee;
      --jwp-accent-strong: #e8dcf8;
      --jwp-accent-ink: #1b1028;
      --jwp-success: #d4baff;
      --jwp-danger: #ffabb8;
      --jwp-action-bg: rgba(151, 108, 226, .16);
      --jwp-action-hover: rgba(166, 123, 238, .25);
      --jwp-input-bg: rgba(14, 8, 23, .5);
      --jwp-input-focus: rgba(25, 15, 39, .72);
      --jwp-focus: rgba(215, 187, 250, .9);
      --jwp-danger-bg: rgba(185, 68, 88, .18);
      --jwp-danger-hover: rgba(202, 75, 98, .28);
    }
    #${PANEL_ID}[data-theme="ember"] {
      --jwp-panel-background:
        radial-gradient(circle at 90% 0%, var(--jwp-glow), transparent 38%),
        linear-gradient(180deg, var(--jwp-panel-top), var(--jwp-panel-bottom));
      --jwp-panel-top: rgba(43, 28, 22, .85);
      --jwp-panel-bottom: rgba(18, 9, 6, .85);
      --jwp-glow: rgba(224, 122, 65, .16);
      --jwp-border: rgba(235, 195, 168, .17);
      --jwp-border-strong: rgba(241, 203, 177, .3);
      --jwp-text: #f8eee7;
      --jwp-muted: #c2aa9a;
      --jwp-faint: #897366;
      --jwp-accent: #e9b790;
      --jwp-accent-strong: #f6d4b9;
      --jwp-accent-ink: #26130b;
      --jwp-success: #f3c5a0;
      --jwp-danger: #ffac9f;
      --jwp-action-bg: rgba(211, 111, 55, .16);
      --jwp-action-hover: rgba(226, 127, 70, .25);
      --jwp-input-bg: rgba(24, 12, 7, .5);
      --jwp-input-focus: rgba(40, 21, 12, .72);
      --jwp-focus: rgba(245, 192, 150, .9);
      --jwp-danger-bg: rgba(185, 68, 64, .18);
      --jwp-danger-hover: rgba(205, 78, 72, .28);
    }
    #${PANEL_ID}.hide { display: none; }
    #${PANEL_ID} * { box-sizing: border-box; }
    /* ShareLinks already confines temporary users on the server. These rules
       make its guest web UI watch-only; JellyWatchParty's class additionally
       disables navigation inside the otherwise permitted series tree. */
    body.sharelinks-guest .btnUserData,
    body.sharelinks-guest .btnUserData-favorite,
    body.sharelinks-guest .btnUserRating,
    body.sharelinks-guest button[is="emby-ratingbutton"],
    body.sharelinks-guest [title="Add to favorites"],
    body.sharelinks-guest [title="Remove from favorites"],
    body.sharelinks-guest [aria-label="Add to favorites"],
    body.sharelinks-guest [aria-label="Remove from favorites"],
    html.jwp-party-guest .btnUserData,
    html.jwp-party-guest .btnUserData-favorite,
    html.jwp-party-guest .btnUserRating,
    html.jwp-party-guest button[is="emby-ratingbutton"],
    html.jwp-party-guest [title="Add to favorites"],
    html.jwp-party-guest [title="Remove from favorites"],
    html.jwp-party-guest [aria-label="Add to favorites"],
    html.jwp-party-guest [aria-label="Remove from favorites"] { display: none !important; }
    html.jwp-party-guest .headerBackButton,
    html.jwp-party-guest .headerHomeButton,
    html.jwp-party-guest .headerSearchButton,
    html.jwp-party-guest .headerCastButton,
    html.jwp-party-guest .headerUserButton,
    html.jwp-party-guest .mainDrawerButton,
    html.jwp-party-guest .mainDetailButtons button:not(.btnPlay):not([data-action="play"]):not([data-action="resume"]) { display: none !important; }
    html.jwp-party-guest .detailPage .card,
    html.jwp-party-guest .detailPage [data-itemid],
    html.jwp-party-guest .detailPage [data-item-id] { pointer-events: none !important; cursor: default !important; }
    /* Globally suppress Jellyfin Enhanced's pause splash, including its
       accountless-guest fallback before per-user settings have loaded. */
    #pause-screen-overlay {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    html.pause-screen-active .videoOsdBottom {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
    html.pause-screen-active .skinHeader.osdHeader {
      width: auto !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
    html.pause-screen-active .skinHeader.osdHeader .headerRight {
      display: flex !important;
    }
    .jwp-header {
      min-height: 2.35rem;
      margin-bottom: 1rem;
      padding: 0 0 .8rem;
      border-bottom: 1px solid var(--jwp-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .65rem;
      color: var(--jwp-text);
      font-size: 1rem;
      font-weight: 700;
    }
    .jwp-lobby-container { min-height: 0; overflow-y: auto; }
    .jwp-section { margin-bottom: 1rem; overflow-y: auto; }
    .jwp-section-divider {
      margin-top: .2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--jwp-border);
    }
    .jwp-label {
      margin-bottom: .65rem;
      color: var(--jwp-muted);
      font-size: .7rem;
      font-weight: 600;
      letter-spacing: .075em;
      text-transform: uppercase;
    }
    .jwp-empty-state {
      padding: 1.25rem .75rem 1.4rem;
      color: var(--jwp-faint);
      font-size: .78rem;
      text-align: center;
    }
    .jwp-room-toolbar {
      min-height: 2.8rem;
      padding-bottom: .8rem;
      border-bottom: 1px solid var(--jwp-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
      flex-shrink: 0;
    }
    .jwp-room-actions { display: flex; align-items: center; flex: 0 0 auto; gap: .45rem; }
    .jwp-participants-list { min-width: 0; color: var(--jwp-muted); font-size: .78rem; font-weight: 650; }
    .jwp-room-item {
      min-height: 3.35rem;
      margin-bottom: .55rem;
      padding: .75rem;
      border: 1px solid var(--jwp-border);
      border-radius: .8rem;
      background: var(--jwp-surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
      color: var(--jwp-text);
      cursor: pointer;
      transition: background .16s ease, border-color .16s ease, transform .16s ease;
    }
    .jwp-room-item:hover {
      border-color: var(--jwp-border-strong);
      background: var(--jwp-surface-hover);
      transform: translateY(-1px);
    }
    .jwp-room-name { font-size: .82rem; font-weight: 650; }
    .jwp-room-meta { margin-top: .12rem; color: var(--jwp-muted); font-size: .68rem; }
    .jwp-btn {
      min-height: 2.55rem;
      padding: .62rem .95rem;
      border: 1px solid rgba(215, 229, 244, .28);
      border-radius: .72rem;
      background: linear-gradient(135deg, var(--jwp-accent-strong), var(--jwp-accent));
      box-shadow: 0 .3rem 1rem rgba(5, 12, 20, .18);
      color: var(--jwp-accent-ink);
      cursor: pointer;
      font: inherit;
      font-size: .82rem;
      font-weight: 700;
      transition: filter .16s ease, transform .16s ease, background .16s ease, border-color .16s ease;
    }
    .jwp-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }
    .jwp-btn:active { filter: brightness(.97); transform: translateY(0); }
    .jwp-btn:focus-visible,
    .jwp-icon-btn:focus-visible,
    .jwp-input:focus-visible,
    .jwp-select:focus-visible,
    #jwp-chat-input:focus-visible,
    #jwp-chat-send:focus-visible {
      outline: 2px solid var(--jwp-focus);
      outline-offset: 2px;
    }
    .jwp-btn.secondary {
      border-color: var(--jwp-border);
      background: var(--jwp-action-bg);
      box-shadow: none;
      color: var(--jwp-text);
    }
    .jwp-btn.secondary:hover { background: var(--jwp-action-hover); }
    .jwp-btn.danger {
      border-color: var(--jwp-border);
      background: var(--jwp-danger-bg);
      box-shadow: none;
      color: var(--jwp-danger);
    }
    .jwp-btn.danger:hover { background: var(--jwp-danger-hover); }
    .jwp-icon-btn {
      width: 2.25rem;
      height: 2.25rem;
      flex: 0 0 2.25rem;
      padding: 0;
      border: 1px solid var(--jwp-border);
      border-radius: 50%;
      background: var(--jwp-surface);
      color: var(--jwp-text);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background .16s ease, border-color .16s ease, transform .16s ease;
    }
    .jwp-icon-btn:hover { border-color: var(--jwp-border-strong); background: var(--jwp-surface-hover); transform: translateY(-1px); }
    .jwp-icon-btn:active { transform: translateY(0); }
    #jwp-btn-settings {
      display: inline-flex !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    #jwp-btn-settings[aria-expanded="true"] { border-color: var(--jwp-border-strong); background: var(--jwp-action-hover); color: var(--jwp-accent-strong); }
    .jwp-icon-btn.danger { color: var(--jwp-muted); }
    .jwp-icon-btn.danger:hover { color: var(--jwp-danger); background: var(--jwp-danger-hover); }
    .jwp-icon-btn .material-icons { font-size: 1.15rem; }
    .jwp-invite-btn {
      min-height: 2.25rem;
      margin: 0;
      padding: .45rem .7rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .45rem;
    }
    .jwp-invite-btn .material-icons { font-size: 1.05rem; }
    .jwp-invite-btn:disabled { opacity: .55; cursor: wait; transform: none; }
    .jwp-input,
    .jwp-select,
    #jwp-chat-input {
      width: 100%;
      border: 1px solid var(--jwp-border);
      border-radius: .72rem;
      background: var(--jwp-input-bg);
      color: var(--jwp-text);
      font: inherit;
      transition: background .16s ease, border-color .16s ease;
    }
    .jwp-input {
      margin-bottom: .7rem;
      padding: .72rem .8rem;
      font-size: .82rem;
    }
    .jwp-input::placeholder,
    #jwp-chat-input::placeholder { color: var(--jwp-faint); opacity: 1; }
    .jwp-input:focus,
    .jwp-select:focus,
    #jwp-chat-input:focus {
      border-color: var(--jwp-border-strong);
      background: var(--jwp-input-focus);
    }
    .jwp-select {
      padding: .62rem 2rem .62rem .72rem;
      font-size: .78rem;
      cursor: pointer; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%239aa6b6'%3E%3Cpath d='M6 8L2 4h8z'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 10px center;
    }
    .jwp-checkbox-row {
      margin-top: .55rem;
      display: flex;
      align-items: center;
      gap: .5rem;
      color: var(--jwp-muted);
      font-size: .74rem;
    }
    .jwp-checkbox-row input { accent-color: #9ec8e5; }
    .jwp-nickname-gate {
      flex: 1;
      min-height: 0;
      padding: 1.35rem 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    #jwp-chat-settings {
      flex: 1;
      min-height: 0;
      padding-top: 1rem;
      overflow-y: auto;
    }
    .jwp-settings-title {
      margin-bottom: .35rem;
      color: var(--jwp-text);
      font-size: 1rem;
      font-weight: 720;
    }
    .jwp-settings-copy {
      margin-bottom: 1rem;
      color: var(--jwp-muted);
      font-size: .74rem;
      line-height: 1.5;
    }
    .jwp-settings-label {
      margin: .25rem 0 .45rem;
      display: block;
      color: var(--jwp-muted);
      font-size: .7rem;
      font-weight: 650;
      letter-spacing: .055em;
      text-transform: uppercase;
    }
    .jwp-settings-save { width: 100%; margin-top: .15rem; }
    .jwp-settings-room-actions {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--jwp-border);
      display: grid;
      gap: .55rem;
    }
    .jwp-settings-room-actions .jwp-btn { width: 100%; }
    .jwp-input-error { border-color: var(--jwp-danger) !important; }
    .jwp-theme-options {
      margin-bottom: .85rem;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .5rem;
    }
    .jwp-theme-option {
      min-width: 0;
      padding: .55rem .6rem;
      border: 1px solid var(--jwp-border);
      border-radius: .7rem;
      background: var(--jwp-surface);
      color: var(--jwp-muted);
      display: flex;
      align-items: center;
      gap: .48rem;
      cursor: pointer;
      font: inherit;
      font-size: .73rem;
      font-weight: 650;
      text-align: left;
      transition: background .16s ease, border-color .16s ease, color .16s ease;
    }
    .jwp-theme-option:hover { border-color: var(--jwp-border-strong); background: var(--jwp-surface-hover); color: var(--jwp-text); }
    .jwp-theme-option[aria-pressed="true"] { border-color: var(--jwp-focus); color: var(--jwp-text); }
    .jwp-theme-swatch {
      width: .85rem;
      height: .85rem;
      border: 0;
      border-radius: 50%;
      background: linear-gradient(135deg, #f5f5f5 0 48%, #111 52% 100%);
      box-shadow: none;
      flex: 0 0 auto;
      overflow: hidden;
    }
    .jwp-theme-option[data-jwp-theme="frost"] .jwp-theme-swatch { background: linear-gradient(135deg, #dce8f5 0 48%, #182638 52% 100%); }
    .jwp-theme-option[data-jwp-theme="violet"] .jwp-theme-swatch { background: linear-gradient(135deg, #e8dcf8 0 48%, #241332 52% 100%); }
    .jwp-theme-option[data-jwp-theme="ember"] .jwp-theme-swatch { background: linear-gradient(135deg, #f6d4b9 0 48%, #35170c 52% 100%); }
    /* UX-P3: Sync status indicator styles */
    .jwp-sync-status {
      margin-top: .6rem;
      padding: .48rem .6rem;
      border: 1px solid var(--jwp-border);
      border-radius: .6rem;
      background: var(--jwp-surface);
      display: flex;
      align-items: center;
      gap: .45rem;
      color: var(--jwp-muted);
      font-size: .7rem;
    }
    .jwp-sync-dot { width: .45rem; height: .45rem; border-radius: 50%; }
    .jwp-sync-dot.synced { background: var(--jwp-success); }
    .jwp-sync-dot.syncing { background: #e9ca72; animation: jwp-pulse 1s infinite; }
    .jwp-sync-dot.pending { background: #e3a75f; animation: jwp-pulse .5s infinite; }
    .jwp-sync-dot.unknown { background: var(--jwp-faint); }
    @keyframes jwp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .jwp-sync-spinner { width: .75rem; height: .75rem; border: 2px solid var(--jwp-border); border-top-color: #e3a75f; border-radius: 50%; animation: jwp-spin .8s linear infinite; }
    @keyframes jwp-spin { to { transform: rotate(360deg); } }
    /* Chat styles */
    #jwp-chat-section { height: 180px; display: flex; flex-direction: column; }
    #jwp-chat-messages { flex: 1; overflow-y: auto; padding: .8rem 0 .25rem; font-size: 1rem; scrollbar-color: rgba(188, 208, 229, .28) transparent; }
    .jwp-chat-system {
      max-width: 90%;
      margin: .1rem auto 1rem;
      padding: .55rem .7rem;
      border: 1px solid rgba(190, 207, 229, .1);
      border-radius: .7rem;
      background: rgba(255, 255, 255, .035);
      color: var(--jwp-faint);
      font-size: .85rem;
      line-height: 1.45;
      text-align: center;
    }
    .jwp-chat-message { margin-bottom: .55rem; padding: .25rem 0; }
    .jwp-chat-message.jwp-chat-own .jwp-chat-username { font-weight: 800; }
    .jwp-chat-meta { margin-bottom: .12rem; display: flex; align-items: baseline; gap: .5rem; }
    .jwp-chat-username { color: var(--jwp-user-color, var(--jwp-accent)); font-size: .9rem; font-weight: 700; }
    .jwp-chat-time { color: var(--jwp-faint); font-size: .75rem; }
    .jwp-chat-text { color: var(--jwp-text); line-height: 1.4; word-wrap: break-word; }
    #jwp-chat-input-container { position: relative; padding-top: .65rem; border-top: 1px solid var(--jwp-border); display: flex; align-items: center; gap: .5rem; }
    #jwp-chat-input { min-width: 0; flex: 1; min-height: 2.75rem; padding: .65rem .8rem; font-size: 1rem; }
    #jwp-emote-toggle {
      width: 2.75rem;
      height: 2.75rem;
      flex: 0 0 2.75rem;
      padding: 0;
      border: 1px solid var(--jwp-border);
      border-radius: .68rem;
      background: var(--jwp-action-bg);
      color: var(--jwp-text);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    #jwp-emote-toggle:hover,
    #jwp-emote-toggle[aria-expanded="true"] { background: var(--jwp-action-hover); border-color: var(--jwp-border-strong); }
    #jwp-emote-toggle .material-icons { font-size: 1.25rem; }
    #jwp-emote-picker {
      position: absolute;
      left: 0;
      right: 0;
      bottom: calc(100% + .55rem);
      padding: .75rem;
      border: 1px solid var(--jwp-border-strong);
      border-radius: .85rem;
      background: var(--jwp-panel-background);
      box-shadow: 0 -.5rem 2rem rgba(0, 0, 0, .4);
      z-index: 4;
    }
    #jwp-emote-picker[hidden] { display: none; }
    .jwp-emote-picker-title { margin-bottom: .55rem; color: var(--jwp-text); font-size: .78rem; font-weight: 750; }
    .jwp-emote-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .35rem; }
    .jwp-emote-option {
      min-width: 0;
      padding: .35rem .15rem .28rem;
      border: 1px solid transparent;
      border-radius: .58rem;
      background: transparent;
      color: var(--jwp-muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .12rem;
      cursor: pointer;
      font: inherit;
    }
    .jwp-emote-option:hover { border-color: var(--jwp-border); background: var(--jwp-surface-hover); color: var(--jwp-text); }
    .jwp-emote-picker-image { width: auto; height: 2.2rem; max-width: 4.5rem; object-fit: contain; }
    .jwp-emote-option small { max-width: 100%; font-size: .56rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jwp-emote-picker-hint { margin-top: .55rem; color: var(--jwp-faint); font-size: .62rem; text-align: center; }
    .jwp-chat-emote { display: inline-block; width: auto; height: 1.8em; max-width: 5em; margin: 0 .06em; object-fit: contain; vertical-align: -.48em; }
    .jwp-chat-emote-only .jwp-chat-emote { width: auto; height: 3.25rem; max-width: 8rem; margin-right: .12em; vertical-align: middle; }
    .jwp-chat-emote-only .jwp-chat-text { line-height: 1.15; }
    #jwp-chat-send {
      padding: .55rem .8rem;
      border: 1px solid var(--jwp-border);
      border-radius: .68rem;
      background: var(--jwp-action-bg);
      color: var(--jwp-text);
      cursor: pointer;
      font: inherit;
      font-size: .9rem;
      font-weight: 700;
    }
    #jwp-chat-send:hover { background: var(--jwp-action-hover); }
    .jwp-chat-badge { display: none; margin-left: .25rem; padding: .1rem .35rem; border-radius: 999px; background: rgba(190, 57, 67, .8); color: #fff; font-size: .62rem; }
    .jwp-meta { color: var(--jwp-faint) !important; font-size: .64rem !important; }
    /* Toast styles */
    .jwp-toast-container {
      position: fixed; top: 70px; right: 20px; z-index: 30000;
      display: flex; flex-direction: column; gap: 8px; pointer-events: none;
    }
    .jwp-toast {
      max-width: 320px; padding: .7rem .9rem;
      border: 1px solid rgba(190, 207, 229, .16); border-radius: .8rem;
      background: rgba(23, 33, 48, .95); color: #e6ebf2; font-size: .8rem;
      -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
      box-shadow: 0 .5rem 1.8rem rgba(0,0,0,.35); pointer-events: auto; cursor: pointer;
      animation: jwp-toast-in 0.3s ease-out;
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
    }
    .jwp-toast.jwp-toast-out {
      animation: jwp-toast-out 0.3s ease-in forwards;
    }
    .jwp-toast-username { margin-right: .4rem; color: var(--jwp-user-color, #a9d2ed); font-weight: 700; }
    .jwp-toast-text { color: #e6ebf2; word-wrap: break-word; }
    .jwp-toast-system {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      padding: .75rem 1.15rem; border: 1px solid rgba(190, 207, 229, .16);
      border-radius: .8rem; background: rgba(23, 33, 48, .96); color: #e6ebf2;
      font-size: .8rem; z-index: 30000;
      -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
      box-shadow: 0 .5rem 1.8rem rgba(0,0,0,.35); cursor: pointer;
      animation: jwp-toast-system-in 0.3s ease-out;
    }
    .jwp-toast-system.jwp-toast-out {
      animation: jwp-toast-system-out 0.3s ease-in forwards;
    }
    .jwp-shared-cursor {
      --jwp-user-color: #ffffff;
      position: fixed;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
      transform: translate(-2px, -2px);
      transition: left .045s linear, top .045s linear, opacity .1s ease;
      z-index: 25000;
    }
    .jwp-shared-cursor-trail {
      --jwp-user-color: #ffffff;
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      overflow: visible;
      pointer-events: none;
      z-index: 24999;
    }
    .jwp-shared-cursor-trail-line {
      fill: none;
      stroke: var(--jwp-user-color);
      stroke-width: 3.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      filter:
        drop-shadow(0 0 2px #000)
        drop-shadow(0 0 4px var(--jwp-user-color))
        drop-shadow(0 0 8px var(--jwp-user-color));
    }
    .jwp-shared-cursor.visible { opacity: 1; }
    .jwp-shared-cursor-arrow {
      position: absolute;
      left: 0;
      top: 0;
      width: 20px;
      height: 28px;
      overflow: visible;
      filter:
        drop-shadow(0 0 2px #000)
        drop-shadow(0 0 4px var(--jwp-user-color))
        drop-shadow(0 0 9px var(--jwp-user-color));
    }
    .jwp-shared-cursor-arrow path {
      fill: #fff;
      stroke: #050505;
      stroke-linejoin: round;
      stroke-width: 1.5;
    }
    .jwp-shared-cursor-name {
      position: absolute;
      left: 17px;
      top: 19px;
      max-width: 10rem;
      padding: .16rem .42rem;
      border: 1px solid var(--jwp-user-color);
      border-radius: 999px;
      background: rgba(0, 0, 0, .78);
      box-shadow: 0 0 10px var(--jwp-user-color);
      color: var(--jwp-user-color);
      font: 700 .65rem/1.25 system-ui, sans-serif;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 1px 2px #000;
      white-space: nowrap;
    }
    @keyframes jwp-toast-in {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes jwp-toast-out {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(20px); }
    }
    @keyframes jwp-toast-system-in {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes jwp-toast-system-out {
      from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      to { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
    }
    /* Confirmation modal */
    .jwp-modal-overlay {
      position: fixed; inset: 0; background: rgba(5, 9, 15, .68);
      z-index: 40000; display: flex; align-items: center; justify-content: center;
      -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);
      animation: jwp-toast-system-in 0.2s ease-out;
    }
    .jwp-modal {
      width: min(430px, calc(100vw - 32px)); padding: 1.15rem;
      border: 1px solid rgba(190, 207, 229, .16); border-radius: 1rem;
      background: linear-gradient(180deg, rgba(30, 40, 54, .985), rgba(13, 20, 30, .99));
      box-shadow: 0 1rem 3rem rgba(0,0,0,.45); color: #e6ebf2; font-family: inherit;
    }
    .jwp-modal,
    .jwp-modal * { box-sizing: border-box; }
    .jwp-modal-title { margin-bottom: .8rem; font-size: .88rem; font-weight: 700; }
    .jwp-modal-copy { color: var(--jwp-muted); font-size: .78rem; line-height: 1.45; }
    .jwp-modal-actions { margin-top: .8rem; display: flex; gap: .55rem; }
    .jwp-modal-actions .jwp-btn { flex: 1; }
    @media (min-width: 440px) {
      .jwp-modal-title { white-space: nowrap; }
    }
    @media (min-width: 800px) {
      #${PANEL_ID} { top: 72px; right: 20px; bottom: 20px; width: 340px; max-height: none; }
      #jwp-chat-section { flex: 1; min-height: 220px; height: auto; }
      html.jwp-player-docked { --jwp-dock-width: clamp(340px, 24vw, 420px); }
      html.jwp-player-docked #${PANEL_ID} {
        top: 0; right: 0; bottom: 0;
        width: var(--jwp-dock-width); max-height: none;
        border-width: 0 0 0 1px; border-radius: 0;
        box-shadow: -1rem 0 2.5rem rgba(0, 0, 0, .28), inset 1px 0 rgba(255, 255, 255, .025);
      }
      html.jwp-player-docked .videoPlayerContainer {
        width: calc(100vw - var(--jwp-dock-width)) !important;
      }
      html.jwp-player-docked .videoPlayerContainer .htmlvideoplayer,
      html.jwp-player-docked .videoPlayerContainer .videoSubtitles {
        width: 100% !important;
      }
      html.jwp-player-docked .osdHeader,
      html.jwp-player-docked .videoOsdBottom {
        right: var(--jwp-dock-width) !important;
        width: auto !important;
      }
    }
    @media (max-width: 799px) {
      #${PANEL_ID} {
        left: 12px; right: 12px; bottom: calc(78px + env(safe-area-inset-bottom));
        width: auto; max-height: min(520px, calc(100dvh - 110px)); padding: 1rem;
      }
    }
  `;

  const injectStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS_STYLES;
    document.head.appendChild(style);
  };

  Object.assign(ui, { injectStyles });
})();
