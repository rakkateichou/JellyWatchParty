const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

let removedClass;
let removedElements;
let destroyed;

beforeEach(() => {
  removedClass = '';
  removedElements = [];
  destroyed = false;
  globalThis.document = {
    documentElement: {
      classList: { remove(value) { removedClass = value; } }
    },
    getElementById(id) {
      return {
        remove() { removedElements.push(id); }
      };
    }
  };
  globalThis.JellyfinEnhanced = {
    currentSettings: { pauseScreenEnabled: true },
    pauseScreenInstance: {
      destroy() { destroyed = true; }
    },
    initializePauseScreen() {}
  };
});

afterEach(() => {
  delete globalThis.JellyfinEnhanced;
});

require('../app/pause-splash.js');

describe('global pause splash blocker', () => {
  it('disables settings, destroys an existing instance, and removes its DOM', () => {
    JWP.app.disablePauseSplash();

    assert.equal(globalThis.JellyfinEnhanced.currentSettings.pauseScreenEnabled, false);
    assert.equal(destroyed, true);
    assert.equal(globalThis.JellyfinEnhanced.pauseScreenInstance, null);
    assert.equal(removedClass, 'pause-screen-active');
    assert.deepEqual(removedElements, ['pause-screen-overlay', 'pause-screen-style']);
  });

  it('neutralizes a late pause-screen initializer used by guest sessions', () => {
    JWP.app.disablePauseSplash();
    removedElements = [];

    globalThis.JellyfinEnhanced.initializePauseScreen();

    assert.deepEqual(removedElements, ['pause-screen-overlay', 'pause-screen-style']);
  });
});
