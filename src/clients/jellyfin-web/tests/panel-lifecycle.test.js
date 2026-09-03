const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

let hidden;
let leaveCalls;
let cleanupCalls;

JWP.ui = {
  updateDockedPlayerLayout() {}
};
JWP.playback = {
  cleanupVideoListeners() { cleanupCalls += 1; }
};
JWP.actions = {
  leaveRoom() { leaveCalls += 1; }
};
JWP.cursor = { reset() {} };

globalThis.document = {
  getElementById: () => ({
    classList: { add(value) { hidden = value === 'hide'; } }
  })
};

require('../app/lifecycle.js');

describe('watch-party panel lifecycle', () => {
  beforeEach(() => {
    hidden = false;
    leaveCalls = 0;
    cleanupCalls = 0;
    JWP.state.inRoom = true;
    JWP.state.bound = true;
  });

  it('hides the panel without leaving when the video route exits', () => {
    JWP._lifecycle.onVideoPlayerExit();

    assert.equal(hidden, true);
    assert.equal(leaveCalls, 0);
    assert.equal(cleanupCalls, 1);
    assert.equal(JWP.state.inRoom, true);
    assert.equal(JWP.state.bound, false);
  });
});
