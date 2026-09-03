const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

JWP.actions = {};
JWP.playback = { resetInitialTrackSync() {} };
require('../ws/send.js');

describe('room-list join intent', () => {
  beforeEach(() => {
    JWP.state.clientId = 'client-1';
    JWP.state.roomId = '';
    JWP.state.roomJoinPending = false;
    JWP.state.pendingJoinRoomId = '';
    JWP.state.inviteJoinActive = false;
    JWP.state.ws = {
      readyState: 1,
      sent: [],
      send(value) { this.sent.push(JSON.parse(value)); }
    };
  });

  it('marks a normal room selection for follower routing', () => {
    JWP.actions.joinRoom('room-1');

    assert.equal(JWP.state.roomJoinPending, true);
    assert.equal(JWP.state.ws.sent.at(-1).type, 'join_room');
    assert.equal(JWP.state.ws.sent.at(-1).room, 'room-1');
  });

  it('does not re-run follower routing for an invite already in playback', () => {
    JWP.state.inviteJoinActive = true;

    JWP.actions.joinRoom('room-1');

    assert.equal(JWP.state.roomJoinPending, false);
  });
});
