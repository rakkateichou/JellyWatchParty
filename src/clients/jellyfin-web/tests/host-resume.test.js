const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

require('../playback/bind.js');
JWP.ui = { updateSyncIndicator() {}, showToast() {} };
require('../ws/handlers/playback.js');

describe('coordinated host resume', () => {
  let sent;
  let video;

  beforeEach(() => {
    JWP.playback.cleanupVideoListeners();
    sent = [];
    JWP.state.isHost = true;
    JWP.state.inRoom = true;
    JWP.state.isSyncing = false;
    JWP.state.isBuffering = false;
    JWP.state.coordinatedPlayPending = false;
    JWP.state.coordinatedPlayStarting = false;
    JWP.state.coordinatedPlayRequestId = '';
    JWP.state.roomMediaId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    JWP.actions = {
      send(type, payload) { sent.push({ type, payload }); }
    };
    JWP.utils.shouldSend = () => true;
    JWP.utils.isSeeking = () => false;
    JWP.utils.isVideoReady = () => true;
    JWP.utils.getCurrentItemId = () => JWP.state.roomMediaId;
    JWP.utils.log = () => {};
    video = {
      currentTime: 42,
      paused: false,
      pauseCalls: 0,
      pause() {
        this.paused = true;
        this.pauseCalls += 1;
        JWP.playback.onHostEvent('pause', this);
      },
      play() {
        this.paused = false;
        JWP.playback.onHostEvent('play', this);
        return Promise.resolve();
      }
    };
  });
  afterEach(() => JWP.playback.cleanupVideoListeners());

  it('holds the host on the requested frame until the server schedules everyone', () => {
    JWP.playback.onHostEvent('play', video);

    assert.equal(video.paused, true);
    assert.equal(video.pauseCalls, 1);
    assert.equal(JWP.state.coordinatedPlayPending, true);
    assert.equal(sent[0].type, 'player_event');
    assert.equal(sent[0].payload.action, 'play');
    assert.equal(sent[0].payload.position, 42);
    assert.equal(sent[0].payload.request_id, JWP.state.coordinatedPlayRequestId);
    assert.equal(JWP.state.syncStatus, 'pending_play');
    assert.equal(sent.length, 1);
  });

  it('does not broadcast the synthetic pause used to hold the host', () => {
    JWP.playback.onHostEvent('play', video);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.action, 'play');
  });

  it('keeps a buffered native Play pending when its queued playing event precedes the hold Pause', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
    const listeners = {};
    const mediaTasks = [];
    video.paused = true;
    video.addEventListener = (name, listener) => { listeners[name] = listener; };
    video.removeEventListener = () => {};
    video.play = () => {
      if (!video.paused) return Promise.resolve();
      video.paused = false;
      // HTML queues both events before our Play listener can call pause().
      mediaTasks.push(() => listeners.play(), () => listeners.playing());
      return Promise.resolve();
    };
    video.pause = () => {
      if (video.paused) return;
      video.paused = true;
      video.pauseCalls += 1;
      mediaTasks.push(() => listeners.pause());
    };
    const flushMediaTasks = () => { while (mediaTasks.length) mediaTasks.shift()(); };
    JWP.utils.getVideo = () => video;
    JWP.state.bound = false;
    JWP.playback.bindVideo();

    video.play();
    flushMediaTasks();
    assert.equal(video.paused, true);
    assert.equal(JWP.state.coordinatedPlayPending, true);
    assert.deepEqual(sent.map(message => message.payload.action), ['play']);

    JWP._wsHandlers.handlePlayerEvent({ server_ts: 101000, payload: {
      action: 'play', position: 42, target_server_ts: 101000, coordinated: true,
      request_id: JWP.state.coordinatedPlayRequestId
    } }, video);
    t.mock.timers.tick(1000);
    flushMediaTasks();
    assert.equal(video.paused, false);
    assert.equal(JWP.state.coordinatedPlayPending, false);
    assert.equal(sent.filter(message => message.payload.action === 'play').length, 1);

    // Genuine Pause after the shared start must still stop everyone.
    video.pause();
    flushMediaTasks();
    assert.equal(sent.find(message => message.payload.action === 'pause').payload.coordinated_cancel, undefined);
  });

  it('cancels the shared start on a second play/pause click', () => {
    JWP.playback.onHostEvent('play', video);
    video.play();
    assert.equal(video.paused, true);
    assert.equal(JWP.state.coordinatedPlayPending, false);
    assert.equal(JWP.state.coordinatedPlayRequestId, '');
    assert.equal(JWP.state.syncStatus, 'synced');
    assert.equal(sent.at(-1).payload.action, 'pause');
    assert.equal(sent.at(-1).payload.coordinated_cancel, true);
  });

  it('ignores Waiting queued before the host is held, but reports actual playback buffering', () => {
    const listeners = {};
    video.addEventListener = (name, listener) => { listeners[name] = listener; };
    video.removeEventListener = () => {};
    JWP.utils.getVideo = () => video;
    JWP.state.bound = false;
    JWP.playback.bindVideo();
    JWP.playback.onHostEvent('play', video);

    listeners.waiting();
    assert.equal(JWP.state.isBuffering, false);
    assert.equal(JWP.state.coordinatedPlayPending, true);
    assert.deepEqual(sent.map(message => message.payload.action), ['play']);

    JWP._wsHandlers.handlePlayerEvent({ server_ts: JWP.utils.getServerNow(), payload: {
      action: 'play', position: 42, coordinated: true,
      request_id: JWP.state.coordinatedPlayRequestId
    } }, video);
    listeners.playing();
    listeners.waiting();
    assert.equal(JWP.state.isBuffering, true);
    assert.equal(sent.at(-1).payload.action, 'buffering');
  });

  it('ignores a stale scheduled reply after cancel then resume', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
    JWP.playback.onHostEvent('play', video);
    const oldRequest = sent[0].payload.request_id;
    JWP.playback.cancelCoordinatedPlay(video);
    video.play();
    const newRequest = sent.at(-1).payload.request_id;
    const reply = request_id => ({ server_ts: 101000, payload: {
      action: 'play', position: 42, target_server_ts: 101000, coordinated: true, request_id
    } });
    JWP._wsHandlers.handlePlayerEvent(reply(oldRequest), video);
    assert.equal(JWP.state.pendingActionTimer, null);
    assert.equal(video.paused, true);
    JWP._wsHandlers.handlePlayerEvent(reply(newRequest), video);
    t.mock.timers.tick(999);
    assert.equal(video.paused, true);
    t.mock.timers.tick(1);
    assert.equal(video.paused, false);
    assert.equal(JWP.state.coordinatedPlayPending, false);
  });

  it('stays paused after cancelling an already scheduled start', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
    JWP.playback.onHostEvent('play', video);
    JWP._wsHandlers.handlePlayerEvent({ server_ts: 101000, payload: {
      action: 'play', position: 42, target_server_ts: 101000, coordinated: true,
      request_id: JWP.state.coordinatedPlayRequestId
    } }, video);
    JWP.playback.cancelCoordinatedPlay(video);
    t.mock.timers.tick(2000);
    assert.equal(video.paused, true);
    assert.equal(JWP.state.pendingActionTimer, null);
  });

  it('does not hold ordinary playback after the owner leaves the room', () => {
    JWP.state.inRoom = false;
    JWP.playback.onHostEvent('play', video);
    assert.equal(video.paused, false);
    assert.deepEqual(sent, []);
  });

  it('broadcasts an ordinary pause immediately', () => {
    video.pause();
    assert.equal(sent[0].payload.action, 'pause');
    assert.equal(JWP.state.pendingActionTimer, null);
  });

  it('does not schedule a second resume when a coordinated start finishes buffering', () => {
    const listeners = {};
    video.addEventListener = (name, listener) => { listeners[name] = listener; };
    video.removeEventListener = () => {};
    JWP.utils.getVideo = () => video;
    JWP.state.bound = false;
    JWP.playback.bindVideo();
    JWP.playback.onHostEvent('play', video);
    JWP.state.isBuffering = true;
    JWP._wsHandlers.handlePlayerEvent({ server_ts: JWP.utils.getServerNow(), payload: {
      action: 'play', position: 42, coordinated: true,
      request_id: JWP.state.coordinatedPlayRequestId
    } }, video);
    listeners.playing();
    assert.equal(sent.filter(message => message.payload.action === 'play').length, 1);
    assert.equal(JWP.state.coordinatedPlayPending, false);
    assert.equal(video.paused, false);
  });

  it('does not create another request from the scheduled native Play event', () => {
    JWP.state.coordinatedPlayStarting = true;

    JWP.playback.onHostEvent('play', video);

    assert.equal(JWP.state.coordinatedPlayStarting, false);
    assert.deepEqual(sent, []);
  });
});
