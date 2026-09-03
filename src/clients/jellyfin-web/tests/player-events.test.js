const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

JWP.ui = {
  showToast: () => {},
  updateSyncIndicator: () => {}
};
JWP._wsHandlers = {};
JWP.utils.startSyncing = () => {};
JWP.utils.log = () => {};

require('../ws/handlers/playback.js');

describe('host pause and resume events', () => {
  let video;

  beforeEach(() => {
    JWP.state.isHost = false;
    JWP.state.syncCooldownUntil = 0;
    JWP.state.pendingActionTimer = null;
    video = {
      currentTime: 20,
      paused: false,
      playCalls: 0,
      pauseCalls: 0,
      play() {
        this.paused = false;
        this.playCalls += 1;
        return Promise.resolve();
      },
      pause() {
        this.paused = true;
        this.pauseCalls += 1;
      }
    };
  });

  it('pauses a guest when the host pauses', () => {
    JWP._wsHandlers.handlePlayerEvent({
      server_ts: JWP.utils.getServerNow(),
      payload: { action: 'pause', position: 20, play_state: 'paused' }
    }, video);

    assert.equal(video.paused, true);
    assert.equal(video.pauseCalls, 1);
    assert.equal(JWP.state.lastSyncPlayState, 'paused');
  });

  it('aligns a paused guest to the exact host position without a lead offset', () => {
    video.currentTime = 19.5;
    JWP._wsHandlers.handlePlayerEvent({
      server_ts: JWP.utils.getServerNow(),
      payload: { action: 'pause', position: 20, play_state: 'paused' }
    }, video);

    assert.equal(video.currentTime, 20);
    assert.equal(video.paused, true);
  });

  it('resumes a guest when the host resumes', () => {
    video.paused = true;
    JWP._wsHandlers.handlePlayerEvent({
      server_ts: JWP.utils.getServerNow(),
      payload: { action: 'play', position: 20, play_state: 'playing' }
    }, video);

    assert.equal(video.paused, false);
    assert.equal(video.playCalls, 1);
    assert.equal(JWP.state.lastSyncPlayState, 'playing');
  });

  it('uses the position paired with a scheduled resume timestamp', () => {
    video.paused = true;
    JWP._wsHandlers.handlePlayerEvent({
      server_ts: JWP.utils.getServerNow(),
      payload: { action: 'play', position: 21, play_state: 'playing' }
    }, video);

    assert.equal(video.currentTime, 21);
    assert.equal(JWP.state.lastSyncPosition, 21);
  });
});
