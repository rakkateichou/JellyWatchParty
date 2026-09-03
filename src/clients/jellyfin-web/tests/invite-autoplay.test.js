const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

require('../utils/media.js');
require('../playback/play.js');

describe('invite episode autoplay', () => {
  const itemId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  let playCalls;
  let itemRequests;

  beforeEach(() => {
    playCalls = 0;
    itemRequests = 0;
    JWP.state.joiningItemId = '';
    JWP.state.nativeLaunchItemId = '';
    JWP.state.nativeLaunchUntil = 0;
    JWP.state.nativeButtonItemId = itemId;
    JWP.state.nativeButtonReadyAt = Date.now() - 1000;
    JWP.state.roomId = '';
    JWP.state.pendingJoinRoomId = '';
    JWP.state.inviteJoinActive = false;
    globalThis.window.location.hash = '#/details?id=' + itemId;
    globalThis.document.querySelector = () => null;
    JWP.utils.getCurrentItemId = () => itemId;
    JWP.utils.getPlaybackManager = () => ({
      play: () => { playCalls += 1; }
    });
    globalThis.ApiClient = {
      getCurrentUserId: () => 'user-1',
      getItem: async () => {
        itemRequests += 1;
        return { Id: itemId };
      }
    };
  });

  it('starts playback when the episode is only open on its details page', async () => {
    // Jellyfin may retain this element while the SPA is on the details route.
    JWP.utils.getVideo = () => ({});

    JWP.playback.ensurePlayback(itemId);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(itemRequests, 1);
    assert.equal(playCalls, 1);
  });

  it('does not restart an episode that is already playing', async () => {
    JWP.utils.getVideo = () => ({});
    globalThis.window.location.hash = '#/video';

    JWP.playback.ensurePlayback(itemId);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(itemRequests, 0);
    assert.equal(playCalls, 0);
  });

  it('does not mistake an empty video invite route for active playback', async () => {
    JWP.utils.getVideo = () => null;
    globalThis.window.location.hash = '#/video?jwpRoom=686a02d6-c84c-4b7a-94c7-ef732a0fac9e&jwpMedia=' + itemId;

    JWP.playback.ensurePlayback(itemId);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(itemRequests, 1);
    assert.equal(playCalls, 1);
  });

  it('uses a hidden details bridge when native playback is the only launcher', () => {
    JWP.utils.getVideo = () => null;
    JWP.utils.getPlaybackManager = () => null;
    JWP.state.pendingJoinRoomId = '686a02d6-c84c-4b7a-94c7-ef732a0fac9e';
    globalThis.window.location.hash = '#/video?jwpRoom=686a02d6-c84c-4b7a-94c7-ef732a0fac9e&jwpMedia=' + itemId;

    JWP.playback.ensurePlayback(itemId);

    assert.match(globalThis.window.location.hash, new RegExp(`^#/details\\?id=${itemId}&jwpRoom=.*&jwpMedia=${itemId}`));
  });

  it('normalizes UUID-style invite media before using Jellyfin native Play', () => {
    let nativePlayCalls = 0;
    const uuidItemId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    JWP.utils.getPlaybackManager = () => null;
    JWP.utils.getCurrentItemId = () => itemId;
    globalThis.document.querySelector = (selector) => selector.includes('.mainDetailButtons') ? ({
      disabled: false,
      click: () => { nativePlayCalls += 1; }
    }) : null;

    JWP.playback.ensurePlayback(uuidItemId);

    assert.equal(nativePlayCalls, 1);
    assert.equal(JWP.state.nativeLaunchItemId, itemId);
  });

  it('uses Jellyfin native Play when PlaybackManager is not exposed', () => {
    let nativePlayCalls = 0;
    JWP.utils.getPlaybackManager = () => null;
    globalThis.document.querySelector = (selector) => selector.includes('.mainDetailButtons') ? ({
      disabled: false,
      click: () => {
        nativePlayCalls += 1;
        globalThis.window.location.hash = '#/video';
      }
    }) : null;

    JWP.playback.ensurePlayback(itemId);

    assert.equal(nativePlayCalls, 1);
    assert.equal(itemRequests, 0);
  });

  it('does not relaunch native playback while Jellyfin is opening the player', () => {
    let nativePlayCalls = 0;
    JWP.utils.getPlaybackManager = () => null;
    globalThis.document.querySelector = (selector) => selector.includes('.mainDetailButtons') ? ({
      disabled: false,
      click: () => { nativePlayCalls += 1; }
    }) : null;

    JWP.playback.ensurePlayback(itemId);
    JWP.playback.ensurePlayback(itemId);

    assert.equal(nativePlayCalls, 1);
  });

  it('waits for Jellyfin to bind a newly rendered native Play button', async () => {
    let nativePlayCalls = 0;
    JWP.state.nativeButtonItemId = '';
    JWP.state.nativeButtonReadyAt = 0;
    JWP.utils.getPlaybackManager = () => null;
    globalThis.document.querySelector = (selector) => selector.includes('.mainDetailButtons') ? ({
      disabled: false,
      click: () => { nativePlayCalls += 1; }
    }) : null;

    JWP.playback.ensurePlayback(itemId);
    assert.equal(nativePlayCalls, 0);
    await new Promise(resolve => setTimeout(resolve, 1000));

    assert.equal(nativePlayCalls, 1);
    globalThis.window.location.hash = '#/video';
  });

  it('opens a changed episode before retrying the native Play button', async () => {
    const nextItemId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    let currentItemId = itemId;
    let nativePlayCalls = 0;
    JWP.state.roomId = '686a02d6-c84c-4b7a-94c7-ef732a0fac9e';
    JWP.utils.getPlaybackManager = () => null;
    JWP.utils.getCurrentItemId = () => currentItemId;
    globalThis.document.querySelector = (selector) => selector.includes('.mainDetailButtons') && currentItemId === nextItemId ? ({
      disabled: false,
      click: () => {
        nativePlayCalls += 1;
        globalThis.window.location.hash = '#/video';
      }
    }) : null;

    JWP.playback.ensurePlayback(nextItemId);
    assert.match(globalThis.window.location.hash, new RegExp(`^#/details\\?id=${nextItemId}&jwpRoom=`));

    currentItemId = nextItemId;
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(nativePlayCalls, 1);
  });
});
