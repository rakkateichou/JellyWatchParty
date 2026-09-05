const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');
require('../ws/auth.js');
require('../playback/play.js');

describe('chat authentication before Jellyfin finishes loading', () => {
  beforeEach(() => {
    JWP.state.inviteJoinActive = true;
    JWP.state.pendingJoinRoomId = 'room-1';
    JWP.state.inRoom = false;
    JWP.serverAddress = 'https://localhost/jellyfin';
    window.location.origin = 'https://localhost';
    window.location.hash = '#/home?jwpRoom=room-1&serverId=server-1';
    delete window.ApiClient;
    globalThis.localStorage = { getItem: () => JSON.stringify({ Servers: [{
      Id: 'server-1', ManualAddress: 'https://localhost/jellyfin/', AccessToken: 'test-session'
    }] }) };
  });

  it('uses the redeemed session immediately without waiting for ApiClient', () => {
    assert.deepEqual(JWP.actions.getApiAccessToken(), {
      apiClient: null, accessToken: 'test-session', serverAddress: JWP.serverAddress
    });
  });

  it('rejects stored credentials for a different server', () => {
    window.location.hash += '-different';
    assert.equal(JWP.actions.getApiAccessToken(), null);
  });

  it('never sends a stored credential to another origin or base path', () => {
    JWP.serverAddress = 'https://other.example/jellyfin';
    assert.equal(JWP.actions.getApiAccessToken(), null);
    JWP.serverAddress = 'https://localhost/other';
    assert.equal(JWP.actions.getApiAccessToken(), null);
  });

  it('uses the initialized ApiClient session in preference to stored credentials', () => {
    window.ApiClient = { accessToken: () => 'current-session', serverAddress: () => JWP.serverAddress };
    assert.equal(JWP.actions.getApiAccessToken().accessToken, 'current-session');
  });
});

describe('player readiness behind the invitation cover', () => {
  let covered, display, visibility;
  beforeEach(() => {
    covered = true; display = 'block'; visibility = 'hidden';
    window.location.hash = '#/video';
    document.documentElement = { classList: { contains: () => covered } };
    JWP.utils.getVideo = () => ({ closest: () => ({ hidden: false }) });
    window.getComputedStyle = () => ({ display, visibility });
  });
  afterEach(() => { delete window.getComputedStyle; });

  it('recognizes the native player while the cover hides its contents', () => {
    assert.equal(JWP.playback.isVideoPage(), true);
  });
  it('rejects a player removed from layout even during entry', () => {
    display = 'none';
    assert.equal(JWP.playback.isVideoPage(), false);
  });
  it('recognizes an active native player hidden by the persistent guest shell after reload', () => {
    document.documentElement.classList.contains = name => name === 'jwp-party-guest';
    assert.equal(JWP.playback.isVideoPage(), true);
  });
  it('still rejects a hidden player without the invitation cover', () => {
    covered = false;
    assert.equal(JWP.playback.isVideoPage(), false);
  });

  it('recognizes and opens a prepared fullscreen player for a paused host', () => {
    JWP.state.roomJoinActive = true;
    JWP.state.roomId = 'room-1';
    JWP.state.roomMediaId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    window.location.hash = '#/details?id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const video = { readyState: 4, closest: () => ({
      hidden: false, classList: { contains: name => name === 'videoPlayerContainer-onTop' }
    }) };
    JWP.utils.getVideo = () => video;
    assert.equal(JWP.playback.isVideoPage(), true);
    JWP.playback.openReadyPlayer(video);
    assert.match(window.location.hash, /^#\/video\?jwpRoom=room-1&jwpMedia=/);
    JWP.state.roomJoinActive = false;
  });
});
