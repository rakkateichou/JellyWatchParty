(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const ui = JWP.ui = JWP.ui || {};
  const { PANEL_ID, STYLE_ID } = JWP.constants;

  const CSS_STYLES = `
    #${PANEL_ID} {
      --jwp-panel-top: rgba(30, 40, 54, .97);
      --jwp-panel-bottom: rgba(13, 20, 30, .985);
      --jwp-surface: rgba(255, 255, 255, .055);
      --jwp-surface-hover: rgba(255, 255, 255, .09);
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
      position: fixed;
      right: 20px;
      bottom: 100px;
      width: min(340px, calc(100vw - 40px));
      max-height: 450px;
      padding: 1.15rem;
      border: 1px solid var(--jwp-border);
      border-radius: 1rem;
      background:
        radial-gradient(circle at 90% 0%, rgba(105, 153, 188, .13), transparent 38%),
        linear-gradient(180deg, var(--jwp-panel-top), var(--jwp-panel-bottom));
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
    #${PANEL_ID}.hide { display: none; }
    #${PANEL_ID} * { box-sizing: border-box; }
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
    .jwp-participants-list { color: var(--jwp-text); font-size: .82rem; }
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
    .jwp-input:focus-visible,
    .jwp-select:focus-visible,
    #jwp-chat-input:focus-visible,
    #jwp-chat-send:focus-visible {
      outline: 2px solid rgba(171, 210, 238, .9);
      outline-offset: 2px;
    }
    .jwp-btn.secondary {
      border-color: rgba(171, 204, 229, .2);
      background: rgba(132, 171, 202, .16);
      box-shadow: none;
      color: #dbe9f5;
    }
    .jwp-btn.secondary:hover { background: rgba(148, 186, 216, .24); }
    .jwp-btn.danger {
      border-color: rgba(255, 126, 136, .2);
      background: rgba(190, 57, 67, .18);
      box-shadow: none;
      color: var(--jwp-danger);
    }
    .jwp-btn.danger:hover { background: rgba(205, 65, 76, .27); }
    .jwp-invite-btn {
      width: 100%;
      margin-top: .75rem;
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
      background: rgba(6, 12, 20, .42);
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
      border-color: rgba(171, 210, 238, .5);
      background: rgba(9, 17, 27, .65);
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
    #jwp-chat-section { height: 180px; margin-top: .65rem; padding-top: .8rem; border-top: 1px solid var(--jwp-border); display: flex; flex-direction: column; }
    #jwp-chat-messages { flex: 1; overflow-y: auto; padding: .25rem 0; font-size: .75rem; scrollbar-color: rgba(188, 208, 229, .28) transparent; }
    .jwp-chat-message { margin-bottom: .55rem; padding: .25rem 0; }
    .jwp-chat-message.jwp-chat-own .jwp-chat-username { color: var(--jwp-success); }
    .jwp-chat-meta { margin-bottom: .12rem; display: flex; align-items: baseline; gap: .5rem; }
    .jwp-chat-username { color: #a9d2ed; font-size: .7rem; font-weight: 700; }
    .jwp-chat-time { color: var(--jwp-faint); font-size: .64rem; }
    .jwp-chat-text { color: var(--jwp-text); line-height: 1.4; word-wrap: break-word; }
    #jwp-chat-input-container { padding-top: .65rem; border-top: 1px solid var(--jwp-border); display: flex; gap: .5rem; }
    #jwp-chat-input { min-width: 0; flex: 1; padding: .58rem .7rem; font-size: .75rem; }
    #jwp-chat-send {
      padding: .55rem .8rem;
      border: 1px solid rgba(171, 204, 229, .2);
      border-radius: .68rem;
      background: rgba(132, 171, 202, .18);
      color: #dbe9f5;
      cursor: pointer;
      font: inherit;
      font-size: .75rem;
      font-weight: 700;
    }
    #jwp-chat-send:hover { background: rgba(148, 186, 216, .26); }
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
    .jwp-toast-username { margin-right: .4rem; color: #a9d2ed; font-weight: 700; }
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
    /* Modal (in-DOM window.prompt() replacement — see ui/modal.js) */
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
