const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

const toggledClasses = new Map();
const makeClassList = (key) => ({
  toggle(name, enabled) { toggledClasses.set(`${key}:${name}`, enabled); }
});

globalThis.document = {
  documentElement: { classList: makeClassList('html') },
  body: { classList: makeClassList('body'), appendChild() {} },
  getElementById() { return null; },
  createElement() { return { setAttribute() {}, remove() {} }; },
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
    JWP.state.panelCollapsed = false;
    JWP.state.guestRoomId = '';
    JWP.state.guestClosedMessage = '';
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

  it('blocks Jellyfin 10.11 player favourite controls for guests', () => {
    const target = {
      closest(selector) {
        return selector.includes('.btnUserRating') ? {} : null;
      }
    };

    assert.equal(JWP.guestLockdown.isAllowedControl(target), false);
  });

  it('allows the standalone chat reopen button while keeping library navigation blocked', () => {
    const reopen = { closest: selector => selector.includes('#jwp-chat-reopen') ? {} : null };
    const library = { closest: selector => selector.includes('[data-itemid]') ? {} : null };
    assert.equal(JWP.guestLockdown.isAllowedControl(reopen), true);
    assert.equal(JWP.guestLockdown.isAllowedControl(library), false);
  });

  it('does not force collapsed guest chat open during repeated view updates', () => {
    const originalGet = document.getElementById;
    let reveals = 0;
    document.getElementById = id => id === JWP.constants.PANEL_ID
      ? { classList: { remove() { reveals += 1; } } } : null;
    JWP.playback.isVideoPage = () => true;
    JWP.state.panelCollapsed = true;
    try {
      JWP.guestLockdown.updateGuestView();
      JWP.guestLockdown.updateGuestView();
      assert.equal(reveals, 0);
      JWP.state.guestClosedMessage = 'This room is closed.';
      JWP.guestLockdown.updateGuestView();
      assert.equal(reveals, 1);
    } finally {
      document.getElementById = originalGet;
    }
  });

  it('waits for the owner to grant access to the exact live title', async () => {
    JWP.state.roomId = 'room-1';
    globalThis.window.ApiClient = { serverAddress: () => 'https://jellyfin.example', accessToken: () => 'guest-token' };
    let grantedMedia = null;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      IsGuest: true, WatchPartyRoomId: 'room-1', WatchPartyMediaId: grantedMedia
    }) });
    assert.equal(await JWP.guestLockdown.hasMediaAccess(mediaId), false);
    grantedMedia = 'b'.repeat(32);
    assert.equal(await JWP.guestLockdown.hasMediaAccess(mediaId), false);
    grantedMedia = mediaId;
    assert.equal(await JWP.guestLockdown.hasMediaAccess(mediaId), true);
    JWP.state.roomId = 'another-room';
    assert.equal(await JWP.guestLockdown.hasMediaAccess(mediaId), false);
  });
});

it('keeps a departed guest isolated and prevents navigation relaunch', () => {
  JWP.state.guestMode = true;
  JWP.state.roomId = 'room-closed';
  let paused = false;
  JWP.utils.getVideo = () => ({ paused: false, pause() { paused = true; } });
  JWP.guestLockdown.endGuestSession('This room is closed.');
  JWP.state.inRoom = false;
  JWP.state.roomId = JWP.state.pendingJoinRoomId = '';
  JWP.state.inviteJoinActive = false;
  assert.equal(JWP.guestLockdown.isRestricted(), true);
  assert.equal(JWP.guestLockdown.enforce(), false);
  assert.equal(JWP.state.guestRoomId, 'room-closed');
  assert.equal(paused, true);
});

it('retains the guest restriction when GuestState is temporarily unavailable', () => {
  JWP.state.guestMode = true;
  JWP.state.guestRoomId = 'room-1';
  JWP.guestLockdown.setGuestState(null);
  assert.equal(JWP.guestLockdown.isRestricted(), true);
});
