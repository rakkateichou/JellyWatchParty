const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

const toggledClasses = new Map();
const makeClassList = (key) => ({
  toggle(name, enabled) { toggledClasses.set(`${key}:${name}`, enabled); }
});

globalThis.document = {
  documentElement: { classList: makeClassList('html') },
  body: { classList: makeClassList('body') },
  addEventListener() {}
};
globalThis.window.addEventListener = () => {};

require('../utils/media.js');
require('../app/guest-lockdown.js');

describe('ShareLinks watch-party guest lockdown', () => {
  const mediaId = 'a'.repeat(32);
  let requestedMedia;

  beforeEach(() => {
    toggledClasses.clear();
    requestedMedia = '';
    JWP.state.guestMode = true;
    JWP.state.inRoom = true;
    JWP.state.pendingJoinRoomId = '';
    JWP.state.inviteJoinActive = false;
    JWP.state.roomMediaId = mediaId;
    JWP.state.joiningItemId = '';
    JWP.playback = { ensurePlayback(id) { requestedMedia = id; } };
    JWP.utils.getCurrentItemId = () => mediaId;
    globalThis.window.location.hash = '#/video';
  });

  it('recognizes a verified ShareLinks guest and applies the scoped class', () => {
    JWP.guestLockdown.setGuestState({ isGuest: true, allowedItemId: mediaId });

    assert.equal(JWP.state.guestMode, true);
    assert.equal(JWP.state.guestShareItemId, mediaId);
    assert.equal(toggledClasses.get('html:jwp-party-guest'), true);
  });

  it('leaves a guest alone while the room media is in the player', () => {
    assert.equal(JWP.guestLockdown.enforce(), false);
    assert.equal(requestedMedia, '');
  });

  it('returns a guest to the room media after navigating elsewhere', () => {
    globalThis.window.location.hash = '#/home';
    JWP.utils.getCurrentItemId = () => '';

    assert.equal(JWP.guestLockdown.enforce(), true);
    assert.equal(requestedMedia, mediaId);
  });

  it('does not restrict normal Jellyfin users', () => {
    JWP.state.guestMode = false;
    globalThis.window.location.hash = '#/home';
    JWP.utils.getCurrentItemId = () => '';

    assert.equal(JWP.guestLockdown.enforce(), false);
    assert.equal(requestedMedia, '');
  });
});
