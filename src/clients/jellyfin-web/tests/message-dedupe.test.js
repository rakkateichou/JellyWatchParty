const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

JWP.ui = { render: () => {} };
JWP.chat = { messages: [], isChatVisible: () => true };
document.getElementById = () => null;
require('../chat/messages.js');
JWP.cursor = { receive: () => {} };
JWP._wsHandlers = new Proxy({}, { get: () => () => {} });
JWP.actions = {};
JWP.utils.getVideo = () => null;
require('../ws/connection.js');

describe('fast-path message deduplication', () => {
  it('reconciles direct and server copies without duplicate messages', () => {
    JWP.state.roomId = 'room-1';
    const message = {
      type: 'chat_message',
      room: 'room-1',
      client: 'guest',
      payload: { text: 'hi', _jwp_message_id: 'same-message' }
    };

    JWP.actions.handleIncomingMessage(message, 'p2p');
    assert.equal(JWP.chat.messages.length, 1);
    assert.equal(JWP.chat.messages[0].id, null);
    const confirmed = { ...message, payload: { ...message.payload, message_id: 'server-id' } };
    JWP.actions.handleIncomingMessage(confirmed, 'ws');
    JWP.actions.handleIncomingMessage(confirmed, 'ws');
    JWP.actions.handleIncomingMessage(message, 'p2p');

    assert.equal(JWP.chat.messages.length, 1);
    assert.equal(JWP.chat.messages[0].id, 'server-id');
    JWP.chat.hydrate([{ message_id: 'server-id', _jwp_message_id: 'same-message', text: 'hi' }]);
    JWP.actions.handleIncomingMessage(message, 'p2p');
    assert.equal(JWP.chat.messages.length, 1);
  });
});
