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
    JWP.utils.isVideoReady = () => true;
    JWP.utils.startSyncing = () => {};
    JWP.utils.log = () => {};
    JWP.ui.prepareInviteLink = undefined;
    JWP.ui.resetPreparedInvite = undefined;
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

  it('uses the host sample timestamp for steady-state position tracking', () => {
    const sampleTs = JWP.utils.getServerNow() - 120;
    const video = {
      currentTime: 12.1,
      paused: false,
      readyState: 4,
      networkState: 1,
      play: () => Promise.resolve(),
      pause() { this.paused = true; }
    };

    JWP._wsHandlers.handleStateUpdate({
      server_ts: sampleTs + 120,
      payload: {
        media_id: oldMediaId,
        position: 12,
        play_state: 'playing',
        sample_server_ts: sampleTs
      }
    }, video);

    assert.equal(JWP.state.lastSyncServerTs, sampleTs);
    assert.equal(JWP.state.lastSyncPosition, 12);
  });

  it('starts preparing the invite as soon as the host receives room state', async () => {
    let prepares = 0;
    JWP.state.clientId = 'host-client';
    JWP.state.roomId = '';
    JWP.ui.prepareInviteLink = () => {
      prepares += 1;
      return Promise.resolve('ready');
    };
    JWP.ui.resetPreparedInvite = () => {};

    JWP._wsHandlers.handleRoomState({
      room: 'room-1',
      client: 'host-client',
      server_ts: JWP.utils.getServerNow(),
      payload: {
        name: "Host's room",
        host_id: 'host-client',
        media_id: oldMediaId,
        participant_count: 1,
        state: { position: 10, play_state: 'paused' },
        chat_history: []
      }
    }, null);
    await Promise.resolve();

    assert.equal(prepares, 1);
  });

  it('does not advance the saved position of a paused room', () => {
    JWP.state.clientId = 'guest-client';
    JWP.state.roomId = 'room-1';
    const video = {
      currentTime: 8,
      paused: false,
      readyState: 4,
      networkState: 1,
      play: () => Promise.resolve(),
      pause() { this.paused = true; }
    };

    JWP._wsHandlers.handleRoomState({
      room: 'room-1',
      client: 'guest-client',
      server_ts: JWP.utils.getServerNow(),
      payload: {
        name: "Host's room",
        host_id: 'host-client',
        media_id: oldMediaId,
        participant_count: 2,
        state: { position: 10, play_state: 'paused' },
        state_server_ts: JWP.utils.getServerNow() - 2000,
        chat_history: []
      }
    }, video);

    assert.equal(video.currentTime, 10);
    assert.equal(video.paused, true);
  });
});
