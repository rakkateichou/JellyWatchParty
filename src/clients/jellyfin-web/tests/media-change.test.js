const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

JWP.ui = {
  render: () => {},
  showToast: () => {}
};
JWP.playback = {
  ensurePlayback: () => {},
  watchReady: () => {}
};
JWP._wsHandlers = {};

require('../ws/handlers/sync.js');

describe('room episode transitions', () => {
  const oldMediaId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const newMediaId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  beforeEach(() => {
    JWP.state.inRoom = true;
    JWP.state.isHost = false;
    JWP.state.roomMediaId = oldMediaId;
    JWP.state.readyRoomId = 'room-1';
    JWP.state.mediaChangeToken = 0;
    JWP.utils.getCurrentItemId = () => oldMediaId;
    JWP.utils.getVideo = () => null;
    JWP.utils.startSyncing = () => {};
  });

  afterEach(() => {
    // Cancels the short settle loop scheduled by a media transition.
    JWP.state.inRoom = false;
    JWP.state.mediaChangeToken += 1;
  });

  it('opens the host episode for a follower and requires fresh readiness', () => {
    let openedMediaId = '';
    JWP.playback.ensurePlayback = (mediaId) => {
      openedMediaId = mediaId;
    };

    JWP._wsHandlers.handleStateUpdate({
      server_ts: JWP.utils.getServerNow(),
      payload: {
        media_id: newMediaId,
        position: 12.5,
        play_state: 'playing'
      }
    }, null);

    assert.equal(openedMediaId, newMediaId);
    assert.equal(JWP.state.roomMediaId, newMediaId);
    assert.equal(JWP.state.readyRoomId, '');
    assert.equal(JWP.state.lastSyncPosition, 12.5);
    assert.equal(JWP.state.lastSyncPlayState, 'playing');
  });

  it('does not redirect the room host', () => {
    let opened = false;
    JWP.state.isHost = true;
    JWP.playback.ensurePlayback = () => {
      opened = true;
    };

    JWP._wsHandlers.handleStateUpdate({
      payload: { media_id: newMediaId, position: 0, play_state: 'paused' }
    }, null);

    assert.equal(opened, false);
    assert.equal(JWP.state.roomMediaId, oldMediaId);
  });
});
