const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

JWP.actions = {};
JWP.ui = JWP.ui || {};
JWP.playback = JWP.playback || {};
require('../ws/send.js');
require('../ui/render.js');

const { PANEL_ID } = JWP.constants;

const makePanel = () => ({
  innerHTML: '',
  dataset: {},
  classList: { contains: () => false, toggle() {}, add() {}, remove() {} },
  querySelector: () => null
});

describe('owner room deletion', () => {
  let panel;

  beforeEach(() => {
    panel = makePanel();
    globalThis.document = {
      getElementById: (id) => (id === PANEL_ID ? panel : null),
      createElement: () => ({
        style: {},
        classList: { add() {}, remove() {} },
        querySelector: () => null,
        appendChild() {},
        insertAdjacentElement() {},
        setAttribute() {},
        prepend() {}
      }),
      querySelector: () => null
    };
    Object.assign(JWP.ui, {
      updateRoomListUI() {},
      updateBridgeListUI() {},
      buildSyncStatusIndicator: () => '',
      updateStatusIndicator() {},
      updateServerFooter() {},
      updateSyncIndicator() {},
      renderHomeWatchParties() {},
      stopPlayerCapture() {},
      showToast() {}
    });
    JWP.state.inRoom = true;
    JWP.state.roomId = 'room-1';
    JWP.state.chatNickname = 'Tester';
    JWP.state.chatSettingsOpen = true;
    JWP.state.isRoomOwner = false;
    JWP.state.allowSupportedReceiver = false;
    JWP.state.panelTheme = 'monochrome';
    JWP.state.ws = {
      readyState: 1,
      sent: [],
      send(value) { this.sent.push(JSON.parse(value)); }
    };
  });

  it('hides the delete action from guests', () => {
    JWP.ui.render(true);
    assert.doesNotMatch(panel.innerHTML, /jwp-settings-delete/);
  });

  it('shows the delete action to the original owner', () => {
    JWP.state.isRoomOwner = true;
    JWP.ui.render(true);
    assert.match(panel.innerHTML, /id="jwp-settings-delete"/);
    assert.match(panel.innerHTML, /Delete room for everyone/);
  });

  it('only lets the owner send delete_room', () => {
    assert.equal(JWP.actions.deleteRoom(), false);
    assert.equal(JWP.state.ws.sent.length, 0);

    JWP.state.isRoomOwner = true;
    assert.equal(JWP.actions.deleteRoom(), true);
    assert.equal(JWP.state.ws.sent.length, 1);
    assert.equal(JWP.state.ws.sent[0].type, 'delete_room');
    assert.equal(JWP.state.ws.sent[0].room, 'room-1');
  });
});
