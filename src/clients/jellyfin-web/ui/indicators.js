(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const ui = JWP.ui = JWP.ui || {};
  const state = JWP.state;
  let playbackStatusTimer = null;

  const cleanupPlaybackStatus = () => {
    if (playbackStatusTimer) clearInterval(playbackStatusTimer);
    playbackStatusTimer = null;
    document.getElementById('jwp-playback-status')?.remove();
  };

  const updatePlaybackStatus = () => {
    const active = state.inRoom && !state.waitingForTitle && !state.guestClosedMessage
      && (state.coordinatedPlayPending || state.syncStatus === 'pending_play')
      && JWP.playback?.isVideoPage?.();
    if (!active) { cleanupPlaybackStatus(); return; }
    let status = document.getElementById('jwp-playback-status');
    if (!status) {
      status = document.createElement('div');
      status.id = 'jwp-playback-status';
      status.innerHTML = '<div class="jwp-sync-spinner" aria-hidden="true"></div><span id="jwp-playback-label" role="status"></span><span id="jwp-playback-countdown" aria-hidden="true"></span><button type="button" id="jwp-playback-cancel" aria-label="Cancel synced playback">Cancel</button>';
      ui.stopPlayerCapture(status);
      status.querySelector('button').onclick = () => JWP.playback?.cancelCoordinatedPlay?.();
      document.body.appendChild(status);
    }
    const label = status.querySelector('#jwp-playback-label');
    const scheduled = state.pendingPlayUntil > 0;
    const text = scheduled ? 'Starting together…' : 'Syncing playback…';
    if (label.textContent !== text) label.textContent = text;
    status.querySelector('#jwp-playback-countdown').textContent = scheduled
      ? `${Math.max(0, (state.pendingPlayUntil - JWP.utils.getServerNow()) / 1000).toFixed(1)}s` : '';
    status.querySelector('#jwp-playback-cancel').hidden = !state.isHost;
    if (!playbackStatusTimer) playbackStatusTimer = setInterval(updatePlaybackStatus, 100);
  };

  const updateStatusIndicator = () => {
    const el = document.getElementById('jwp-ws-indicator');
    if (!el) return;
    const connected = state.ws && state.ws.readyState === 1;
    el.style.color = connected ? 'var(--jwp-success)' : 'var(--jwp-danger)';
    el.textContent = connected ? 'Online' : 'Offline';
  };

  const updateServerFooter = () => {
    const el = document.getElementById('jwp-server-footer');
    if (!el) return;
    const wsUrl = state.wsUrl || JWP.constants.DEFAULT_WS_URL;
    el.textContent = `Server: ${wsUrl.replace(/^wss?:\/\//, '').replace('/ws', '')}`;
  };

  const describeSyncStatus = (status) => {
    if (status === 'pending_play') {
      const remaining = Math.max(0, (state.pendingPlayUntil - (Date.now() + (state.serverOffsetMs || 0))) / 1000);
      return { dotClass: 'pending', label: `Waiting for sync... ${remaining.toFixed(1)}s`, showSpinner: true };
    }
    if (status === 'syncing') {
      return { dotClass: 'syncing', label: 'Out of sync', showSpinner: false };
    }
    if (status === 'synced') {
      return { dotClass: 'synced', label: 'In sync', showSpinner: false };
    }
    return { dotClass: 'unknown', label: 'Not synced yet', showSpinner: false };
  };

  const updateSyncIndicator = () => {
    updatePlaybackStatus();
    const el = document.getElementById('jwp-sync-indicator');
    if (!el || state.isHost) return;
    const { dotClass, label, showSpinner } = describeSyncStatus(state.syncStatus);
    el.innerHTML = showSpinner
      ? `<div class="jwp-sync-spinner"></div><span>${label}</span>`
      : `<div class="jwp-sync-dot ${dotClass}"></div><span>${label}</span>`;
  };

  const buildSyncStatusIndicator = () => {
    if (state.isHost) return '';
    const { dotClass, label, showSpinner } = describeSyncStatus(state.syncStatus);
    return `
      <div class="jwp-sync-status" id="jwp-sync-indicator">
        ${showSpinner ? '<div class="jwp-sync-spinner"></div>' : `<div class="jwp-sync-dot ${dotClass}"></div>`}
        <span>${label}</span>
      </div>
    `;
  };

  const stopPlayerCapture = (input) => {
    const stopPropagation = (e) => e.stopPropagation();
    input.addEventListener('keydown', stopPropagation);
    input.addEventListener('keyup', stopPropagation);
    input.addEventListener('keypress', stopPropagation);
    input.addEventListener('click', stopPropagation);
    input.addEventListener('mousedown', stopPropagation);
  };

  Object.assign(ui, { updateStatusIndicator, updateServerFooter, updateSyncIndicator, buildSyncStatusIndicator, stopPlayerCapture, cleanupPlaybackStatus });
})();
