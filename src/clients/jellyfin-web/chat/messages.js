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
      ? 'Room ready — copy the link to invite someone. Hold Ctrl over the video to point.'
      : 'You’re in — playback will follow the host. Hold Ctrl over the video to point.';
    container.appendChild(message);
  };

  const formatTime = (ts) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const quoteText = (reply) => reply.unavailable
    ? 'Original message is no longer available.'
    : (chat.plainEmotes ? chat.plainEmotes(reply.text) : reply.text);

  const updateReplyPreview = () => {
    const preview = document.getElementById('jwp-chat-reply-preview');
    if (!preview) return;
    const reply = chat.replyTo;
    preview.hidden = !reply;
    const label = document.getElementById('jwp-chat-reply-label');
    const text = document.getElementById('jwp-chat-reply-text');
    if (label) label.textContent = reply ? `Replying to ${reply.username}` : '';
    if (text) text.textContent = reply ? quoteText(reply) : '';
  };

  const cancelReply = () => {
    chat.replyTo = null;
    updateReplyPreview();
  };

  const startReply = (message) => {
    if (!message.id || !JWP.state.inRoom) return;
    chat.replyTo = { id: message.id, username: message.username, text: message.text, roomId: JWP.state.roomId };
    updateReplyPreview();
    document.getElementById('jwp-chat-input')?.focus();
  };

  const renderMessage = (message, replacing = null) => {
    const container = document.getElementById('jwp-chat-messages');
    if (!container) return;
    const emptyMessage = container.querySelector('.jwp-chat-system');
    if (emptyMessage) emptyMessage.remove();
    const msgEl = document.createElement('div');
    msgEl.className = 'jwp-chat-message' + (message.isOwn ? ' jwp-chat-own' : '');
    if (chat.containsOnlyEmotes?.(message.text)) msgEl.className += ' jwp-chat-emote-only';
    const identityColor = utils.userColor(message.username);
    msgEl.innerHTML = `
      <div class="jwp-chat-meta">
        <span class="jwp-chat-username" style="--jwp-user-color:${identityColor}">${utils.escapeHtml(message.username)}</span>
        <span class="jwp-chat-time">${formatTime(message.timestamp)}</span>
        ${message.id ? `<button type="button" class="jwp-chat-reply" aria-label="Reply to ${utils.escapeHtml(message.username)}">Reply</button>` : ''}
      </div>
      ${message.replyTo ? `<blockquote class="jwp-chat-quote">${message.replyTo.unavailable ? '' : `<strong>${utils.escapeHtml(message.replyTo.username)}</strong>`}<span>${utils.escapeHtml(quoteText(message.replyTo))}</span></blockquote>` : ''}
      <div class="jwp-chat-text">${chat.renderEmotes ? chat.renderEmotes(message.text) : utils.escapeHtml(message.text)}</div>
    `;
    if (message.id) msgEl.querySelector('.jwp-chat-reply').onclick = () => startReply(message);
    if (replacing?.parentNode === container) replacing.replaceWith(msgEl);
    else {
      container.appendChild(msgEl);
      container.scrollTop = container.scrollHeight;
    }
    message.element = msgEl;
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

  const receive = (msg, source = 'ws') => {
    if (msg.room && msg.room !== JWP.state.roomId) return;
    const confirmed = source === 'ws';
    const id = confirmed ? msg.payload?.message_id : null;
    const transportId = msg.payload?._jwp_message_id;
    const existing = chat.messages.find(entry => (id && entry.id === id)
      || (transportId && entry.transportId === transportId && (!entry.id || !id)));
    if (existing && (!confirmed || existing.id)) return;
    const message = {
      id,
      transportId,
      replyTo: confirmed ? msg.payload?.reply_to : null,
      clientId: msg.client,
      username: msg.payload?.username || 'Anonymous',
      text: msg.payload?.text || '',
      timestamp: msg.server_ts || Date.now(),
      isOwn: msg.client === JWP.state.clientId
    };
    // The direct copy is shown immediately, then replaced by the server's
    // canonical identity and quote without a second message or notification.
    if (existing) {
      chat.messages[chat.messages.indexOf(existing)] = message;
      renderMessage(message, existing.element);
      return;
    }
    chat.messages.push(message);
    if (chat.messages.length > MAX_MESSAGES) {
      chat.messages.shift().element?.remove();
    }
    if (!chat.isChatVisible()) {
      chat.unreadCount++;
      chat.updateBadge();
      if (!message.isOwn && JWP.ui && JWP.ui.showChatToast) {
        JWP.ui.showChatToast(message.username, chat.plainEmotes ? chat.plainEmotes(message.text) : message.text);
      }
    }
    renderMessage(message);
  };

  const clear = () => {
    cancelReply();
    chat.draftText = '';
    chat.messages = [];
    chat.unreadCount = 0;
    chat.updateBadge();
    renderAllMessages();
  };

  // Replaces chat.messages with server-replayed history (on join/reattach).
  // Unlike receive(), this never bumps the unread badge or fires a toast —
  // it's backfill, not a live message.
  const hydrate = (entries) => {
    if (chat.replyTo && chat.replyTo.roomId !== JWP.state.roomId) cancelReply();
    chat.messages = entries.slice(-MAX_MESSAGES).map(entry => ({
      id: entry.message_id,
      transportId: entry._jwp_message_id,
      replyTo: entry.reply_to,
      clientId: entry.client_id,
      username: entry.username || 'Anonymous',
      text: entry.text || '',
      timestamp: entry.server_ts || Date.now(),
      isOwn: entry.client_id === JWP.state.clientId
    }));
    renderAllMessages();
  };

  Object.assign(chat, { renderMessage, renderAllMessages, receive, clear, hydrate, startReply, cancelReply, updateReplyPreview });
})();
