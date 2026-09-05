const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

class FakeChannel {
  constructor() {
    this.readyState = 'open';
    this.sent = [];
  }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 'closed'; }
}

class FakePeerConnection {
  static instances = [];
  constructor() {
    this.connectionState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
    this.channel = null;
    FakePeerConnection.instances.push(this);
  }
  createDataChannel() {
    this.channel = new FakeChannel();
    return this.channel;
  }
  async createOffer() { return { type: 'offer', sdp: 'v=0' }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0' }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  async addIceCandidate() {}
  close() { this.connectionState = 'closed'; }
}

window.RTCPeerConnection = FakePeerConnection;
JWP.actions = {};
require('../ws/send.js');
require('../transport/p2p.js');

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('WebRTC fast path with WebSocket fallback', () => {
  beforeEach(async () => {
    JWP.p2p.reset();
    FakePeerConnection.instances = [];
    JWP.state.inRoom = true;
    JWP.state.roomId = 'room-1';
    JWP.state.clientId = 'host';
    JWP.state.roomHostId = 'host';
    JWP.state.isHost = true;
    JWP.state.ws = { readyState: 1, sent: [], send(value) { this.sent.push(JSON.parse(value)); } };
    JWP.p2p.syncPeers(['host', 'guest']);
    await tick();
  });

  afterEach(() => JWP.p2p.reset());

  it('sends pause directly and still sends the authoritative WebSocket copy', () => {
    const pc = FakePeerConnection.instances[0];
    const websocketCount = JWP.state.ws.sent.length;

    JWP.actions.send('player_event', { action: 'pause', position: 12 });

    assert.equal(pc.channel.sent.length, 1);
    assert.equal(JWP.state.ws.sent.length, websocketCount + 1);
    assert.equal(pc.channel.sent[0].payload._jwp_message_id,
      JWP.state.ws.sent.at(-1).payload._jwp_message_id);
  });

  it('keeps coordinated play and state snapshots on the server path', () => {
    const pc = FakePeerConnection.instances[0];

    JWP.actions.send('player_event', { action: 'play', position: 12 });
    JWP.actions.send('state_update', { position: 12, play_state: 'playing' });

    assert.equal(pc.channel.sent.length, 0);
    assert.equal(JWP.state.ws.sent.at(-2).type, 'player_event');
    assert.equal(JWP.state.ws.sent.at(-1).type, 'state_update');
  });

  it('keeps cancellation ordered behind Play on the server connection', () => {
    const pc = FakePeerConnection.instances[0];
    JWP.actions.send('player_event', { action: 'pause', position: 12, coordinated_cancel: true });
    assert.equal(pc.channel.sent.length, 0);
    assert.equal(JWP.state.ws.sent.at(-1).payload.coordinated_cancel, true);
  });

  it('routes replies through the server to resolve the quote before display', () => {
    const pc = FakePeerConnection.instances[0];
    JWP.actions.send('chat_message', { text: 'Agreed', reply_to_id: 'parent' });
    assert.equal(pc.channel.sent.length, 0);
    assert.equal(JWP.state.ws.sent.at(-1).payload.reply_to_id, 'parent');
    assert.ok(JWP.state.ws.sent.at(-1).payload._jwp_message_id);
    assert.equal(JWP.p2p.broadcast({ type: 'chat_message', payload: {
      text: 'Hi', reply_to: { text: 'Unverified' }
    } }), false);
  });
});
