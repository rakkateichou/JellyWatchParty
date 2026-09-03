const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

require('../playback/bind.js');

describe('coordinated host resume', () => {
  let sent;
  let video;

  beforeEach(() => {
    sent = [];
    JWP.state.isHost = true;
    JWP.state.inRoom = true;
    JWP.state.isSyncing = false;
    JWP.state.isBuffering = false;
    JWP.state.coordinatedPlayPending = false;
    JWP.state.coordinatedPlayStarting = false;
    JWP.state.roomMediaId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    JWP.actions = {
      send(type, payload) { sent.push({ type, payload }); }
    };
    JWP.utils.shouldSend = () => true;
    JWP.utils.isSeeking = () => false;
    JWP.utils.isVideoReady = () => true;
    JWP.utils.getCurrentItemId = () => JWP.state.roomMediaId;
    JWP.utils.log = () => {};
    video = {
      currentTime: 42,
      paused: false,
      pauseCalls: 0,
      pause() {
        this.paused = true;
        this.pauseCalls += 1;
      }
    };
  });

  it('holds the host on the requested frame until the server schedules everyone', () => {
    JWP.playback.onHostEvent('play', video);

    assert.equal(video.paused, true);
    assert.equal(video.pauseCalls, 1);
    assert.equal(JWP.state.coordinatedPlayPending, true);
    assert.equal(sent[0].type, 'player_event');
    assert.equal(sent[0].payload.action, 'play');
    assert.equal(sent[0].payload.position, 42);
    assert.equal(sent.length, 1);
  });

  it('does not broadcast the synthetic pause used to hold the host', () => {
    JWP.state.coordinatedPlayPending = true;
    video.paused = true;

    JWP.playback.onHostEvent('pause', video);

    assert.deepEqual(sent, []);
  });

  it('does not create another request from the scheduled native Play event', () => {
    JWP.state.coordinatedPlayStarting = true;

    JWP.playback.onHostEvent('play', video);

    assert.equal(JWP.state.coordinatedPlayStarting, false);
    assert.deepEqual(sent, []);
  });
});
