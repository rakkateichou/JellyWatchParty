const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

let received = 0;
JWP.ui = { render: () => {} };
JWP.chat = { receive: () => { received += 1; } };
JWP.cursor = { receive: () => {} };
JWP._wsHandlers = new Proxy({}, { get: () => () => {} });
JWP.actions = {};
JWP.utils.getVideo = () => null;
require('../ws/connection.js');

describe('fast-path message deduplication', () => {
  it('handles the first copy and ignores the later fallback copy', () => {
    const message = {
      type: 'chat_message',
      room: 'room-1',
      client: 'guest',
      payload: { text: 'hi', _jwp_message_id: 'same-message' }
    };

    JWP.actions.handleIncomingMessage(message, 'p2p');
    JWP.actions.handleIncomingMessage(message, 'ws');

    assert.equal(received, 1);
  });
});
