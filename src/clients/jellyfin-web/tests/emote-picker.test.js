const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

require('../ui/render.js');

describe('emote picker interaction', () => {
  it('stays open after inserting an emote', () => {
    const listeners = {};
    const chatInput = {
      value: '',
      addEventListener(type, handler) { listeners[type] = handler; }
    };
    const chatSend = { addEventListener() {} };
    const emoteToggle = { setAttribute() {} };
    const emotePicker = { hidden: false };
    const emoteButton = { dataset: { jwpEmote: ':pog:' }, onclick: null };
    const panel = {
      innerHTML: '',
      dataset: {},
      children: [],
      classList: { contains: () => false, toggle() {}, add() {}, remove() {} },
      querySelector(selector) {
        if (selector === '#jwp-chat-input') return chatInput;
        if (selector === '#jwp-chat-send') return chatSend;
        if (selector === '#jwp-emote-toggle') return emoteToggle;
        if (selector === '#jwp-emote-picker') return emotePicker;
        return null;
      },
      querySelectorAll(selector) {
        return selector === '.jwp-emote-option' ? [emoteButton] : [];
      }
    };

    globalThis.document = {
      documentElement: { classList: { toggle() {} } },
      getElementById: (id) => (id === JWP.constants.PANEL_ID ? panel : null),
      querySelector: () => null
    };
    Object.assign(JWP.ui, {
      updateRoomListUI() {},
      updateBridgeListUI() {},
      updateStatusIndicator() {},
      updateServerFooter() {},
      updateSyncIndicator() {},
      renderHomeWatchParties() {},
      stopPlayerCapture() {}
    });
    let inserted = '';
    JWP.chat = {
      emotes: [],
      insertEmote(_input, token) { inserted = token; return true; },
      markRead() {},
      renderAllMessages() {}
    };
    JWP.state.inRoom = true;
    JWP.state.chatNickname = 'Tester';
    JWP.state.chatSettingsOpen = false;
    JWP.state.allowSupportedReceiver = false;
    JWP.state.panelTheme = 'monochrome';

    JWP.ui.render(true);
    let wheelStopped = false;
    emotePicker.onwheel({ stopPropagation() { wheelStopped = true; } });
    emoteButton.onclick();

    assert.equal(inserted, ':pog:');
    assert.equal(emotePicker.hidden, false);
    assert.equal(wheelStopped, true);
  });
});
