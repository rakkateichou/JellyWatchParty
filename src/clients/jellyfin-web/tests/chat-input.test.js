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
      send(type, payload) { sent = { type, payload }; return true; }
    };
    JWP.ui = JWP.ui || {};
    JWP.ui.showToast = (message) => { toast = message; };
    JWP.chat.replyTo = null;
    JWP.chat.cancelReply = () => { JWP.chat.replyTo = null; };
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

  it('sends only the reply reference and clears the selection on success', () => {
    JWP.state.chatNickname = 'Movie Fan';
    JWP.chat.replyTo = { id: 'parent', roomId: 'ROOM1', username: 'Guest', text: 'Original' };
    assert.equal(JWP.chat.send('Agreed'), true);
    assert.deepEqual(sent.payload, { text: 'Agreed', username: 'Movie Fan', reply_to_id: 'parent' });
    assert.equal(JWP.chat.replyTo, null);
  });

  it('keeps the reply and draft when the socket fails or validation fails', () => {
    JWP.state.chatNickname = 'Movie Fan';
    JWP.chat.replyTo = { id: 'parent', roomId: 'ROOM1' };
    JWP.chat.draftText = 'Agreed';
    JWP.actions.send = () => false;
    assert.equal(JWP.chat.send('Agreed'), false);
    JWP.actions.send = () => { throw new Error('Socket closed'); };
    assert.equal(JWP.chat.send('Agreed'), false);
    assert.equal(JWP.chat.send(' '), false);
    assert.equal(JWP.chat.replyTo.id, 'parent');
    assert.equal(JWP.chat.draftText, 'Agreed');
  });

  it('never replies to a selection from a different room', () => {
    JWP.state.chatNickname = 'Movie Fan';
    JWP.chat.replyTo = { id: 'parent', roomId: 'OTHER' };
    assert.equal(JWP.chat.send('Hello'), true);
    assert.equal(sent.payload.reply_to_id, undefined);
  });
});
