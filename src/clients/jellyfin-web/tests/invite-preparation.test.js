const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

JWP.ui = {};
JWP.utils.getCurrentItemId = () => 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

require('../ui/render.js');

describe('invite pre-generation', () => {
  let fetchCalls;
  let fetchOptions;
  let getItemCalls;
  let sentMessages;

  beforeEach(() => {
    fetchCalls = 0;
    fetchOptions = null;
    getItemCalls = 0;
    sentMessages = [];
    JWP.state.inRoom = true;
    JWP.state.isHost = true;
    JWP.state.guestMode = false;
    JWP.state.roomId = 'room-1';
    JWP.state.roomMediaId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    JWP.ui.resetPreparedInvite();
    JWP.actions = {
      send(type, payload) { sentMessages.push({ type, payload }); }
    };
    globalThis.window.ApiClient = {
      serverAddress: () => 'https://jellyfin.example',
      accessToken: () => 'token',
      getCurrentUserId: () => 'user-1',
      getItem: async () => {
        getItemCalls += 1;
        return {
          Id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          Type: 'Episode',
          SeriesId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        };
      }
    };
    globalThis.fetch = async (_url, options) => {
      fetchCalls += 1;
      fetchOptions = options;
      return {
        ok: true,
        json: async () => ({ ShareUrl: 'https://jellyfin.example/j/AbCdEf0123456789ghijkl' })
      };
    };
  });

  it('creates one series-scoped link and reuses it for later clicks', async () => {
    const first = JWP.ui.prepareInviteLink();
    const second = JWP.ui.prepareInviteLink();

    assert.strictEqual(second, first);
    assert.equal(await first, 'https://jellyfin.example/j/AbCdEf0123456789ghijkl');
    assert.equal(await JWP.ui.prepareInviteLink(), 'https://jellyfin.example/j/AbCdEf0123456789ghijkl');
    assert.equal(getItemCalls, 1);
    assert.equal(fetchCalls, 1);
    assert.deepEqual(JSON.parse(fetchOptions.body), {
      itemId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      expiryHours: 6,
      oneUse: false,
      partyId: 'room-1',
      mediaId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    });
    assert.equal(JWP.state.inviteShareItemId, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    assert.deepEqual(sentMessages, [{
      type: 'invite_update',
      payload: { invite_url: 'https://jellyfin.example/j/AbCdEf0123456789ghijkl' }
    }]);
  });

  it('starts a fresh request for a different room', async () => {
    await JWP.ui.prepareInviteLink();
    JWP.state.roomId = 'room-2';
    await JWP.ui.prepareInviteLink();

    assert.equal(fetchCalls, 2);
  });

  it('prepares and reuses an invite before a title has been chosen', async () => {
    JWP.state.roomMediaId = '';
    // A details page retained by the SPA is not the room's selected title.
    const invite = await JWP.ui.prepareInviteLink();
    assert.equal(await JWP.ui.prepareInviteLink(), invite);
    assert.equal(fetchCalls, 1);
    assert.equal(getItemCalls, 0);
    assert.deepEqual(JSON.parse(fetchOptions.body), {
      itemId: null, expiryHours: 6, oneUse: false, partyId: 'room-1', mediaId: null
    });
  });

  it('updates the existing room invite when the first title is selected', async () => {
    JWP.state.roomMediaId = '';
    const invite = await JWP.ui.prepareInviteLink();
    JWP.state.roomMediaId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    assert.equal(await JWP.ui.prepareInviteLink(), invite);
    assert.equal(fetchCalls, 2);
    assert.equal(JSON.parse(fetchOptions.body).itemId, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('lets guests copy an empty room invite without Jellyfin admin access', async () => {
    JWP.state.roomMediaId = '';
    JWP.state.isHost = false;
    JWP.state.inviteRoomId = 'room-1';
    JWP.state.inviteBaseUrl = 'https://jellyfin.example/j/waiting-room';
    globalThis.window.ApiClient = null;
    assert.equal(await JWP.ui.prepareInviteLink(), JWP.state.inviteBaseUrl);
    assert.equal(fetchCalls, 0);
  });

  it('keeps copying available when a temporary guest inherits the host role', async () => {
    JWP.state.roomMediaId = '';
    JWP.state.guestMode = true;
    JWP.state.inviteRoomId = 'room-1';
    JWP.state.inviteBaseUrl = 'https://jellyfin.example/j/waiting-room';
    assert.equal(await JWP.ui.prepareInviteLink(), JWP.state.inviteBaseUrl);
    assert.equal(fetchCalls, 0);
  });

  it('lets a guest reuse the invite prepared by the host', async () => {
    JWP.state.isHost = false;
    JWP.state.inviteRoomId = 'room-1';
    JWP.state.inviteBaseUrl = 'https://jellyfin.example/share/from-host';
    globalThis.window.ApiClient = null;

    assert.equal(
      await JWP.ui.prepareInviteLink(),
      'https://jellyfin.example/share/from-host'
    );
    assert.equal(fetchCalls, 0);
  });

  it('replaces a cached legacy invite when the host is still in the room', async () => {
    JWP.state.inviteRoomId = 'room-1';
    JWP.state.inviteBaseUrl = 'https://jellyfin.example/ShareLinks/Redeem?t=old&party=room-1';

    assert.equal(
      await JWP.ui.prepareInviteLink(),
      'https://jellyfin.example/j/AbCdEf0123456789ghijkl'
    );
    assert.equal(fetchCalls, 1);
    assert.deepEqual(sentMessages, [{
      type: 'invite_update',
      payload: { invite_url: 'https://jellyfin.example/j/AbCdEf0123456789ghijkl' }
    }]);
  });
});
