const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

require('../chat/input.js');

describe('chat nickname requirement', () => {
  let sent;
  let toast;

  beforeEach(() => {
    sent = null;
    toast = '';
    JWP.state.chatNickname = '';
    JWP.state.roomId = 'ROOM1';
    JWP.state.ws = { readyState: 1 };
    JWP.actions = {
      send(type, payload) { sent = { type, payload }; }
    };
    JWP.ui = JWP.ui || {};
    JWP.ui.showToast = (message) => { toast = message; };
  });

  it('blocks the composer until a nickname has been chosen', () => {
    assert.equal(JWP.chat.send('Hello'), false);
    assert.equal(sent, null);
    assert.match(toast, /nickname/i);
  });

  it('includes the saved nickname with each chat message', () => {
    JWP.state.chatNickname = 'Movie Fan';

    assert.equal(JWP.chat.send('  Hello  '), true);
    assert.deepEqual(sent, {
      type: 'chat_message',
      payload: { text: 'Hello', username: 'Movie Fan' }
    });
  });
});
