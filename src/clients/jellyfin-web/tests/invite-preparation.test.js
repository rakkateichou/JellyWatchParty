const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

JWP.ui = {};
JWP.utils.getCurrentItemId = () => 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

require('../ui/render.js');

describe('invite pre-generation', () => {
  let fetchCalls;
  let getItemCalls;

  beforeEach(() => {
    fetchCalls = 0;
    getItemCalls = 0;
    JWP.state.inRoom = true;
    JWP.state.isHost = true;
    JWP.state.roomId = 'room-1';
    JWP.state.roomMediaId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    JWP.ui.resetPreparedInvite();
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
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: true,
        json: async () => ({ ShareUrl: 'https://jellyfin.example/share/ready' })
      };
    };
  });

  it('creates one series-scoped link and reuses it for later clicks', async () => {
    const first = JWP.ui.prepareInviteLink();
    const second = JWP.ui.prepareInviteLink();

    assert.strictEqual(second, first);
    assert.equal(await first, 'https://jellyfin.example/share/ready');
    assert.equal(await JWP.ui.prepareInviteLink(), 'https://jellyfin.example/share/ready');
    assert.equal(getItemCalls, 1);
    assert.equal(fetchCalls, 1);
    assert.equal(JWP.state.inviteShareItemId, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('starts a fresh request for a different room', async () => {
    await JWP.ui.prepareInviteLink();
    JWP.state.roomId = 'room-2';
    await JWP.ui.prepareInviteLink();

    assert.equal(fetchCalls, 2);
  });
});
