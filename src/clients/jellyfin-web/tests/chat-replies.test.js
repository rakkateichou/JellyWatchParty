const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

class Element {
  constructor() { this.children = []; this.textContent = ''; this.hidden = false; this.buttons = new Map(); }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html || ''; }
  appendChild(child) { child.parentNode = this; this.children.push(child); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  replaceWith(child) {
    child.parentNode = this.parentNode;
    this.parentNode.children[this.parentNode.children.indexOf(this)] = child;
    this.parentNode = null;
  }
  querySelector(selector) {
    if (selector === '.jwp-chat-system') return this.children.find(child => child.className === 'jwp-chat-system');
    if (!this.buttons.has(selector)) this.buttons.set(selector, new Element());
    return this.buttons.get(selector);
  }
  focus() { this.focused = true; }
}
let elements;
document.getElementById = id => elements[id] || null;
document.createElement = () => new Element();
require('../chat/messages.js');

const incoming = (id, text = 'Great scene', reply) => ({
  room: 'room', client: 'guest', server_ts: 123,
  payload: { message_id: id, username: 'Guest', text, reply_to: reply }
});

describe('chat replies', () => {
  beforeEach(() => {
    elements = Object.fromEntries(['jwp-chat-messages', 'jwp-chat-input', 'jwp-chat-reply-preview',
      'jwp-chat-reply-label', 'jwp-chat-reply-text'].map(id => [id, new Element()]));
    Object.assign(JWP.state, { inRoom: true, roomId: 'room', clientId: 'self' });
    Object.assign(JWP.chat, { messages: [], unreadCount: 0, replyTo: null, isChatVisible: () => true, updateBadge() {} });
  });

  it('opens a quoted preview from the message Reply button and cancels without losing a draft', () => {
    JWP.chat.receive(incoming('parent'));
    elements['jwp-chat-messages'].children[0].querySelector('.jwp-chat-reply').onclick();
    assert.equal(JWP.chat.replyTo.id, 'parent');
    assert.equal(elements['jwp-chat-reply-preview'].hidden, false);
    assert.equal(elements['jwp-chat-reply-label'].textContent, 'Replying to Guest');
    assert.equal(elements['jwp-chat-reply-text'].textContent, 'Great scene');
    assert.equal(elements['jwp-chat-input'].focused, true);
    elements['jwp-chat-input'].value = 'My reply';
    JWP.chat.cancelReply();
    assert.equal(elements['jwp-chat-reply-preview'].hidden, true);
    assert.equal(elements['jwp-chat-input'].value, 'My reply');
  });

  it('escapes quote text and author, and restores the same quote after reconnect', () => {
    const reply = { message_id: 'parent', username: '<img src=x>', text: '<script>alert(1)</script>', unavailable: false };
    JWP.chat.receive(incoming('reply', 'Agreed', reply));
    const html = elements['jwp-chat-messages'].children[0].innerHTML;
    assert.match(html, /&lt;img src=x&gt;/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>|<img/);
    JWP.chat.hydrate([{ message_id: 'reply', client_id: 'guest', username: 'Guest', text: 'Agreed', server_ts: 123, reply_to: reply }]);
    assert.equal(elements['jwp-chat-messages'].children[0].innerHTML, html);
  });

  it('updates the existing direct message with its canonical ID without adding another row', () => {
    const msg = incoming(null);
    msg.payload._jwp_message_id = 'direct-id';
    JWP.chat.receive(msg, 'p2p');
    JWP.chat.receive({ ...msg, payload: { ...msg.payload, message_id: 'confirmed' } });
    assert.equal(elements['jwp-chat-messages'].children.length, 1);
    elements['jwp-chat-messages'].children[0].querySelector('.jwp-chat-reply').onclick();
    assert.equal(JWP.chat.replyTo.id, 'confirmed');
  });

  it('bounds visible history, keeps a selected reply through replay, and clears it on leaving', () => {
    JWP.chat.receive(incoming('parent'));
    JWP.chat.startReply(JWP.chat.messages[0]);
    for (let i = 0; i < 105; i++) JWP.chat.receive(incoming(`message-${i}`));
    assert.equal(JWP.chat.messages.length, 100);
    assert.equal(elements['jwp-chat-messages'].children.length, 100);
    JWP.chat.hydrate([]);
    assert.equal(JWP.chat.replyTo.id, 'parent');
    JWP.chat.clear();
    assert.equal(JWP.chat.replyTo, null);
    assert.equal(elements['jwp-chat-reply-preview'].hidden, true);
  });

  it('shows an expired reference gracefully and ignores traffic from other rooms', () => {
    JWP.chat.receive(incoming('reply', 'Late reply', { unavailable: true }));
    assert.match(elements['jwp-chat-messages'].children[0].innerHTML, /Original message is no longer available/);
    JWP.chat.receive({ ...incoming('other'), room: 'other-room' });
    assert.equal(JWP.chat.messages.length, 1);
    JWP.chat.startReply(JWP.chat.messages[0]);
    JWP.state.roomId = 'other-room';
    JWP.chat.hydrate([]);
    assert.equal(JWP.chat.replyTo, null);
  });
});
