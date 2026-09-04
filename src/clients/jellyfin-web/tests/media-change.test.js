const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

JWP.ui = {
  render: () => {},
  showToast: () => {}
};
JWP.playback = {
  ensurePlayback: () => {},
  watchReady: () => {}
};
JWP._wsHandlers = {};

require('../ws/handlers/sync.js');

describe('room episode transitions', () => {
  const oldMediaId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const newMediaId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  beforeEach(() => {
    JWP.state.inRoom = true;
    JWP.state.isHost = false;
    JWP.state.roomMediaId = oldMediaId;
    JWP.state.roomJoinPending = false;
    JWP.state.roomJoinActive = false;
    JWP.state.readyRoomId = 'room-1';
    JWP.state.mediaChangeToken = 0;
    JWP.utils.getCurrentItemId = () => oldMediaId;
    JWP.utils.getVideo = () => null;
    JWP.utils.isVideoReady = () => true;
    JWP.utils.startSyncing = () => {};
    JWP.utils.log = () => {};
    JWP.playback.isVideoPage = () => true;
    JWP.playback.holdJoinPlayback = () => {};
    JWP.playback.releaseJoinPlayback = () => {};
    JWP.app = {};
    globalThis.document.getElementById = () => null;
    JWP.ui.prepareInviteLink = undefined;
    JWP.ui.resetPreparedInvite = undefined;
  });

  afterEach(() => {
    // Cancels the short settle loop scheduled by a media transition.
    JWP.state.inRoom = false;
    JWP.state.mediaChangeToken += 1;
  });

  it('opens the host episode for a follower and requires fresh readiness', () => {
    let openedMediaId = '';
    JWP.playback.ensurePlayback = (mediaId) => {
      openedMediaId = mediaId;
    };

    JWP._wsHandlers.handleStateUpdate({
      server_ts: JWP.utils.getServerNow(),
      payload: {
        media_id: newMediaId,
        position: 12.5,
        play_state: 'playing'
      }
    }, null);

    assert.equal(openedMediaId, newMediaId);
    assert.equal(JWP.state.roomMediaId, newMediaId);
    assert.equal(JWP.state.readyRoomId, '');
    assert.equal(JWP.state.lastSyncPosition, 12.5);
    assert.equal(JWP.state.lastSyncPlayState, 'playing');
  });

  it('moves a signed-in follower join into the host playback flow', () => {
    let launchScreen = false;
    let panelShown = false;
    let openedMediaId = '';
    JWP.state.clientId = 'guest-client';
    JWP.state.roomJoinPending = true;
    JWP.state.inRoom = false;
    JWP.utils.getCurrentItemId = () => '';
    JWP.playback.isVideoPage = () => false;
    JWP.playback.ensurePlayback = (mediaId) => { openedMediaId = mediaId; };
    JWP.app = { setJoinLaunchScreen: (visible) => { launchScreen = visible; } };
    globalThis.document.getElementById = () => ({
      classList: { remove: () => { panelShown = true; } }
    });

    JWP._wsHandlers.handleRoomState({
      room: 'room-1',
      client: 'guest-client',
      server_ts: JWP.utils.getServerNow(),
      payload: {
        name: "Host's room",
        host_id: 'host-client',
        media_id: newMediaId,
        participant_count: 2,
        state: { position: 15, play_state: 'paused' },
        chat_history: []
      }
    }, null);

    assert.equal(JWP.state.isHost, false);
    assert.equal(JWP.state.roomJoinPending, false);
    assert.equal(JWP.state.roomJoinActive, true);
    assert.equal(launchScreen, true);
    assert.equal(panelShown, true);
    assert.equal(openedMediaId, newMediaId);
  });

  it('keeps a room host in the normal view when joining their room', () => {
    let launchScreen = null;
    let opened = false;
    JWP.state.clientId = 'host-client';
    JWP.state.roomJoinPending = true;
    JWP.state.inRoom = false;
    JWP.playback.ensurePlayback = () => { opened = true; };
    JWP.app = { setJoinLaunchScreen: (visible) => { launchScreen = visible; } };

    JWP._wsHandlers.handleRoomState({
      room: 'room-1',
      client: 'host-client',
      server_ts: JWP.utils.getServerNow(),
      payload: {
        name: "Host's room",
        host_id: 'host-client',
        media_id: oldMediaId,
        participant_count: 1,
        state: { position: 15, play_state: 'paused' },
        chat_history: []
      }
    }, null);

    assert.equal(JWP.state.isHost, true);
    assert.equal(JWP.state.roomJoinActive, false);
    assert.equal(launchScreen, false);
    assert.equal(opened, false);
  });

  it('starts the room episode when that item is only open on its details page', () => {
    let openedMediaId = '';
    JWP.state.roomMediaId = oldMediaId;
    JWP.utils.getCurrentItemId = () => oldMediaId;
    globalThis.window.location.hash = '#/details?id=' + oldMediaId;
    JWP.playback.isVideoPage = () => false;
    JWP.playback.ensurePlayback = (mediaId) => {
      openedMediaId = mediaId;
    };

    JWP._wsHandlers.handleStateUpdate({
      server_ts: JWP.utils.getServerNow(),
      payload: {
        media_id: oldMediaId,
        position: 42,
        play_state: 'paused'
      }
    }, null);

    assert.equal(openedMediaId, oldMediaId);
  });

  it('does not redirect the room host', () => {
    let opened = false;
    JWP.state.isHost = true;
    JWP.playback.ensurePlayback = () => {
      opened = true;
    };

    JWP._wsHandlers.handleStateUpdate({
      payload: { media_id: newMediaId, position: 0, play_state: 'paused' }
    }, null);

    assert.equal(opened, false);
    assert.equal(JWP.state.roomMediaId, oldMediaId);
  });

  it('uses the host sample timestamp for steady-state position tracking', () => {
    const sampleTs = JWP.utils.getServerNow() - 120;
    const video = {
      currentTime: 12.1,
      paused: false,
      readyState: 4,
      networkState: 1,
      play: () => Promise.resolve(),
      pause() { this.paused = true; }
    };

    JWP._wsHandlers.handleStateUpdate({
      server_ts: sampleTs + 120,
      payload: {
        media_id: oldMediaId,
        position: 12,
        play_state: 'playing',
        sample_server_ts: sampleTs
      }
    }, video);

    assert.equal(JWP.state.lastSyncServerTs, sampleTs);
    assert.equal(JWP.state.lastSyncPosition, 12);
  });

  it('starts preparing the invite as soon as the host receives room state', async () => {
    let prepares = 0;
    JWP.state.clientId = 'host-client';
    JWP.state.roomId = '';
    JWP.ui.prepareInviteLink = () => {
      prepares += 1;
      return Promise.resolve('ready');
    };
    JWP.ui.resetPreparedInvite = () => {};

    JWP._wsHandlers.handleRoomState({
      room: 'room-1',
      client: 'host-client',
      server_ts: JWP.utils.getServerNow(),
      payload: {
        name: "Host's room",
        host_id: 'host-client',
        media_id: oldMediaId,
        participant_count: 1,
        state: { position: 10, play_state: 'paused' },
        chat_history: []
      }
    }, null);
    await Promise.resolve();

    assert.equal(prepares, 1);
  });

  it('accepts the host-prepared invite from room state for a guest', () => {
    JWP.state.clientId = 'guest-client';
    JWP.state.roomId = '';
    JWP.ui.resetPreparedInvite = () => {
      JWP.state.inviteRoomId = '';
      JWP.state.inviteBaseUrl = '';
    };

    JWP._wsHandlers.handleRoomState({
      room: 'room-1',
      client: 'guest-client',
      server_ts: JWP.utils.getServerNow(),
      payload: {
        name: "Host's room",
        host_id: 'host-client',
        media_id: oldMediaId,
        participant_count: 2,
        invite_url: 'https://jellyfin.example/share/prepared',
        state: { position: 0, play_state: 'paused' },
        chat_history: []
      }
    }, null);

    assert.equal(JWP.state.inviteRoomId, 'room-1');
    assert.equal(JWP.state.inviteBaseUrl, 'https://jellyfin.example/share/prepared');
  });

  it('does not advance the saved position of a paused room', () => {
    JWP.state.clientId = 'guest-client';
    JWP.state.roomId = 'room-1';
    const video = {
      currentTime: 8,
      paused: false,
      readyState: 4,
      networkState: 1,
      play: () => Promise.resolve(),
      pause() { this.paused = true; }
    };

    JWP._wsHandlers.handleRoomState({
      room: 'room-1',
      client: 'guest-client',
      server_ts: JWP.utils.getServerNow(),
      payload: {
        name: "Host's room",
        host_id: 'host-client',
        media_id: oldMediaId,
        participant_count: 2,
        state: { position: 10, play_state: 'paused' },
        state_server_ts: JWP.utils.getServerNow() - 2000,
        chat_history: []
      }
    }, video);

    assert.equal(video.currentTime, 10);
    assert.equal(video.paused, true);
  });

  it('holds invite playback at startup, then applies the paused host frame before revealing it', () => {
    let held = 0;
    let released = 0;
    let launchScreen = true;
    JWP.state.clientId = 'guest-client';
    JWP.state.inRoom = false;
    JWP.state.inviteJoinActive = true;
    JWP.state.roomJoinActive = true;
    JWP.utils.getCurrentItemId = () => oldMediaId;
    JWP.playback.holdJoinPlayback = () => { held += 1; };
    JWP.playback.releaseJoinPlayback = () => { released += 1; };
    JWP.app = { setJoinLaunchScreen: (visible) => { launchScreen = visible; } };
    const video = {
      currentTime: 0,
      paused: false,
      readyState: 4,
      networkState: 1,
      play: () => Promise.resolve(),
      pause() { this.paused = true; }
    };
    JWP.utils.getVideo = () => video;

    JWP._wsHandlers.handleRoomState({
      room: 'room-1',
      client: 'guest-client',
      server_ts: JWP.utils.getServerNow(),
      payload: {
        name: "Host's room",
        host_id: 'host-client',
        media_id: oldMediaId,
        participant_count: 2,
        state: { position: 47.25, play_state: 'paused' },
        chat_history: []
      }
    }, video);

    assert.equal(video.paused, true);
    assert.equal(video.currentTime, 47.25);
    assert.equal(JWP.state.roomJoinActive, false);
    assert.equal(launchScreen, false);
    assert.equal(held, 1);
    assert.equal(released, 1);
  });

  it('seeks a held invite to a playing host before resuming it', () => {
    let playCalls = 0;
    let released = 0;
    JWP.state.clientId = 'guest-client';
    JWP.state.inRoom = false;
    JWP.state.inviteJoinActive = true;
    JWP.state.roomJoinActive = true;
    JWP.utils.getCurrentItemId = () => oldMediaId;
    JWP.playback.releaseJoinPlayback = () => { released += 1; };
    JWP.app = { setJoinLaunchScreen: () => {} };
    const video = {
      currentTime: 0,
      paused: true,
      readyState: 4,
      networkState: 1,
      play() { playCalls += 1; this.paused = false; return Promise.resolve(); },
      pause() { this.paused = true; }
    };
    JWP.utils.getVideo = () => video;

    JWP._wsHandlers.handleRoomState({
      room: 'room-1',
      client: 'guest-client',
      server_ts: JWP.utils.getServerNow(),
      payload: {
        name: "Host's room",
        host_id: 'host-client',
        media_id: oldMediaId,
        participant_count: 2,
        state: { position: 31, play_state: 'playing' },
        chat_history: []
      }
    }, video);

    assert.ok(video.currentTime >= 31 && video.currentTime < 31.1);
    assert.equal(video.paused, false);
    assert.equal(playCalls, 1);
    assert.equal(released, 1);
  });
});
