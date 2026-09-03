const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

require('../playback/play.js');

describe('invite episode autoplay', () => {
  const itemId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  let playCalls;
  let itemRequests;

  beforeEach(() => {
    playCalls = 0;
    itemRequests = 0;
    JWP.state.joiningItemId = '';
    globalThis.window.location.hash = '#/details?id=' + itemId;
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
});
