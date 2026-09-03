const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

require('../utils/media.js');

describe('Jellyfin media id detection', () => {
  beforeEach(() => {
    delete globalThis.NowPlayingItem;
    delete globalThis.Emby;
    delete globalThis.appRouter;
    globalThis.window.location.hash = '';
    JWP.utils.getPlaybackManager = () => null;
  });

  afterEach(() => {
    globalThis.window.location.hash = '';
  });

  it('normalizes the hyphenated ids used by ShareLinks routes', () => {
    assert.equal(
      JWP.utils.normalizeItemId('9f032e27-8fe0-8a85-9c93-8a84226842ce'),
      '9f032e278fe08a859c938a84226842ce'
    );
  });

  it('detects a hyphenated item id from the current details route', () => {
    globalThis.window.location.hash = '#/details?id=9f032e27-8fe0-8a85-9c93-8a84226842ce';

    assert.equal(
      JWP.utils.getCurrentItemId(),
      '9f032e278fe08a859c938a84226842ce'
    );
  });

  it('prefers the selected details item over stale playback state', () => {
    globalThis.window.location.hash = '#/details?id=9f032e27-8fe0-8a85-9c93-8a84226842ce';
    globalThis.NowPlayingItem = { Id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };

    assert.equal(
      JWP.utils.getCurrentItemId(),
      '9f032e278fe08a859c938a84226842ce'
    );
  });
});
