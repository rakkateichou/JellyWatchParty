const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

JWP.actions = {};
JWP.playback = { resetInitialTrackSync() {} };
JWP.utils.getVideo = () => null;
JWP.utils.getCurrentItemId = () => '';
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

  it('reports a failed join send so invite autoplay can retry after connecting', () => {
    JWP.state.ws = { readyState: 0, send: () => {} };

    assert.equal(JWP.actions.joinRoom('room-1'), false);
  });

  it('never sends room passwords, including from legacy callers', () => {
    JWP.actions.createRoom('legacy-password');
    JWP.actions.joinRoom('room-1', 'legacy-password');

    const [create, join] = JWP.state.ws.sent.slice(-2);
    assert.equal(Object.hasOwn(create.payload, 'password'), false);
    assert.equal(Object.hasOwn(join.payload, 'password'), false);
  });
});
