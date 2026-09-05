const { it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function client() {
  const timers = new Map();
  const storage = new Map();
  const sockets = [];
  let nextTimer = 0, holds = 0;
  class Socket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
    open() { this.readyState = 1; this.onopen(); }
  }
  const state = { intervals: {}, inRoom: true, roomId: 'room-1', isHost: false,
    autoReconnect: true, reconnectAttempts: 0, userId: 'user', authToken: 'old-token' };
  const joins = [];
  const jwp = { state, constants: { DEFAULT_WS_URL: 'wss://example/ws', RECONNECT_BASE_MS: 100,
    RECONNECT_MAX_MS: 1000, PING_INIT_MS: 100, PING_STABLE_MS: 1000, PING_STABLE_AFTER: 3 },
    actions: { send() {}, fetchAuthToken: async () => 'fresh-token', joinRoom: id => { joins.push(id); return true; } },
    ui: { render() {} }, utils: { nowMs: Date.now, getVideo() {} }, playback: { holdJoinPlayback() { holds++; } } };
  const context = { JellyWatchParty: jwp, WebSocket: Socket, console: { log() {}, warn() {}, error() {} },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: id => timers.delete(id),
    setInterval: () => ++nextTimer, clearInterval() {} };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../ws/connection.js'), 'utf8'), context);
  return { jwp, state, sockets, joins, timers, holds: () => holds };
}

it('reconnects with fresh authentication, rejoins the room and holds follower playback', async () => {
  const c = client();
  await c.jwp.actions.connect(); c.sockets[0].open(); c.sockets[0].close();
  assert.equal(c.holds(), 1);
  assert.equal(c.state.hasTimeSync, false);
  assert.equal(c.state.pendingJoinRoomId, 'room-1');
  const retry = [...c.timers.values()][0]; retry();
  await new Promise(setImmediate);
  c.sockets[1].open();
  assert.deepEqual(c.joins, ['room-1']);
  assert.equal(c.sockets[1].sent[0].payload.token, 'fresh-token');
});

it('cleanup cancels a queued reconnect and detaches callbacks from the old socket', async () => {
  const c = client(); await c.jwp.actions.connect(); c.sockets[0].open(); c.sockets[0].close();
  c.jwp.actions.disconnect();
  assert.equal(c.timers.size, 0);
  assert.equal(c.sockets[0].onclose, null);
  assert.equal(c.state.ws, null);
});

it('separate tabs do not share a participant ID', async () => {
  const a = client(), b = client();
  await a.jwp.actions.connect(); await b.jwp.actions.connect();
  assert.notEqual(a.sockets[0].url, b.sockets[0].url);
});
