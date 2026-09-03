(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const chat = JWP.chat = JWP.chat || { messages: [], unreadCount: 0 };
  const utils = JWP.utils;

  const MAX_MESSAGES = 100;

  const renderEmptyMessage = (container) => {
    if (!JWP.state.inRoom) return;
    const message = document.createElement('div');
    message.className = 'jwp-chat-system';
    message.textContent = JWP.state.isHost
      ? 'Room ready — copy the link to invite someone.'
      : 'You’re in — playback will follow the host.';
    container.appendChild(message);
  };

  const formatTime = (ts) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = (message) => {
    const container = document.getElementById('jwp-chat-messages');
    if (!container) return;
    const emptyMessage = container.querySelector('.jwp-chat-system');
    if (emptyMessage) emptyMessage.remove();
    const msgEl = document.createElement('div');
    msgEl.className = 'jwp-chat-message' + (message.isOwn ? ' jwp-chat-own' : '');
    msgEl.innerHTML = `
      <div class="jwp-chat-meta">
        <span class="jwp-chat-username">${utils.escapeHtml(message.username)}</span>
        <span class="jwp-chat-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="jwp-chat-text">${utils.escapeHtml(message.text)}</div>
    `;
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
  };

  const renderAllMessages = () => {
    const container = document.getElementById('jwp-chat-messages');
    if (!container) return;
    container.innerHTML = '';
    if (chat.messages.length === 0) {
      renderEmptyMessage(container);
      return;
    }
    chat.messages.forEach(msg => renderMessage(msg));
  };

  const receive = (msg) => {
    console.log('[JellyWatchParty] Chat.receive called with:', msg);
    const message = {
      clientId: msg.client,
      username: msg.payload?.username || 'Anonymous',
      text: msg.payload?.text || '',
      timestamp: msg.server_ts || Date.now(),
      isOwn: msg.client === JWP.state.clientId
    };
    chat.messages.push(message);
    if (chat.messages.length > MAX_MESSAGES) {
      chat.messages.shift();
    }
    if (!chat.isChatVisible()) {
      chat.unreadCount++;
      chat.updateBadge();
      if (!message.isOwn && JWP.ui && JWP.ui.showChatToast) {
        JWP.ui.showChatToast(message.username, message.text);
      }
    }
    renderMessage(message);
  };

  const clear = () => {
    chat.messages = [];
    chat.unreadCount = 0;
    chat.updateBadge();
    renderAllMessages();
  };

  // Replaces chat.messages with server-replayed history (on join/reattach).
  // Unlike receive(), this never bumps the unread badge or fires a toast —
  // it's backfill, not a live message.
  const hydrate = (entries) => {
    chat.messages = entries.map(entry => ({
      clientId: entry.client_id,
      username: entry.username || 'Anonymous',
      text: entry.text || '',
      timestamp: entry.server_ts || Date.now(),
      isOwn: entry.client_id === JWP.state.clientId
    }));
    renderAllMessages();
  };

  Object.assign(chat, { renderMessage, renderAllMessages, receive, clear, hydrate });
})();
