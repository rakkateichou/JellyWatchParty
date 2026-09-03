const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

let container;

const makeElement = () => ({
  className: '',
  innerHTML: '',
  textContent: '',
  remove() {
    container.children = container.children.filter(child => child !== this);
  }
});

globalThis.document = {
  getElementById: (id) => id === 'jwp-chat-messages' ? container : null,
  createElement: makeElement
};

require('../chat/messages.js');

describe('empty chat system message', () => {
  beforeEach(() => {
    container = {
      children: [],
      _innerHTML: '',
      scrollTop: 0,
      scrollHeight: 0,
      set innerHTML(value) {
        this._innerHTML = value;
        this.children = [];
      },
      get innerHTML() { return this._innerHTML; },
      appendChild(element) { this.children.push(element); },
      querySelector(selector) {
        return selector === '.jwp-chat-system'
          ? this.children.find(child => child.className === 'jwp-chat-system') || null
          : null;
      }
    };
    JWP.state.inRoom = true;
    JWP.state.isHost = true;
    JWP.chat.messages = [];
  });

  it('shows a quiet room-ready message before anyone chats', () => {
    JWP.chat.renderAllMessages();

    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].className, 'jwp-chat-system');
    assert.match(container.children[0].textContent, /Room ready/);
  });

  it('replaces the system message with the first real chat message', () => {
    JWP.chat.renderAllMessages();
    JWP.chat.renderMessage({
      username: 'admin',
      text: 'Hello',
      timestamp: Date.now(),
      isOwn: true
    });

    assert.equal(container.children.length, 1);
    assert.match(container.children[0].className, /jwp-chat-message/);
  });
});
