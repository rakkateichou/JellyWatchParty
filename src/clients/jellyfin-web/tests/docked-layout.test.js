const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

let panelHidden = false;
let docked = false;
let injectedStyle = null;
let reopen = null;
let nativeHeader = null;
const playerHeader = { appendChild(element) { reopen = element; element.parentElement = this; } };
const panel = {
  classList: {
    contains: (name) => name === 'hide' && panelHidden
  }
};

globalThis.document = {
  documentElement: {
    classList: {
      toggle: (name, enabled) => {
        if (name === 'jwp-player-docked') docked = enabled;
      }
    }
  },
  getElementById: (id) => id === JWP.constants.PANEL_ID ? panel : id === 'jwp-chat-reopen' ? reopen : null,
  querySelector: () => nativeHeader,
  createElement: () => ({ setAttribute() {} }),
  body: { appendChild(element) { reopen = element; element.parentElement = this; } },
  head: {
    appendChild: (element) => { injectedStyle = element; }
  }
};
globalThis.window.matchMedia = () => ({ matches: true });
JWP.ui = { stopPlayerCapture() {} };

require('../ui/render.js');
require('../ui/styles.js');

describe('docked player layout', () => {
  beforeEach(() => {
    panelHidden = false;
    docked = false;
    reopen = null;
    nativeHeader = null;
    JWP.state.inRoom = true;
    JWP.state.waitingForTitle = false;
    JWP.state.roomJoinActive = false;
    JWP.state.inviteJoinActive = false;
    JWP.state.guestClosedMessage = '';
    JWP.utils.getVideo = () => ({});
    globalThis.window.location.hash = '#/video';
  });

  it('docks an open in-room panel beside an active desktop video', () => {
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(docked, true);
  });

  it('restores the full player when the panel is hidden', () => {
    panelHidden = true;
    docked = true;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(docked, false);
    assert.equal(reopen.hidden, false);
    assert.match(reopen.innerHTML, /<svg/);
    assert.doesNotMatch(reopen.innerHTML, /<span>Chat/);
    panelHidden = false;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(reopen.hidden, true);
  });

  it('does not dock or create a chat arrow outside a room', () => {
    JWP.state.inRoom = false;
    panelHidden = true;
    docked = true;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(docked, false);
    assert.equal(reopen, null);
  });

  it('hides an existing arrow as soon as the user leaves the room', () => {
    panelHidden = true;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(reopen.hidden, false);
    JWP.state.inRoom = false;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(reopen.hidden, true);
  });

  it('places the arrow in the native player header instead of overlaying it', () => {
    panelHidden = true;
    nativeHeader = playerHeader;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(reopen.parentElement, playerHeader);
    assert.equal(reopen.hidden, false);
  });

  it('keeps the waiting-room arrow outside the native header and moves it when playback opens', () => {
    panelHidden = true;
    nativeHeader = playerHeader;
    JWP.state.waitingForTitle = true;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(reopen.parentElement, document.body);
    JWP.state.waitingForTitle = false;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(reopen.parentElement, playerHeader);
    JWP.state.roomJoinActive = true;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(reopen.parentElement, document.body);
  });

  it('does not dock a retained video element on an episode details page', () => {
    globalThis.window.location.hash = '#/details?id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    docked = true;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(docked, false);
  });

  it('keeps all native media-segment skip prompts on the video side', () => {
    JWP.ui.injectStyles();

    assert.match(injectedStyle.textContent, /html\.jwp-player-docked \.skip-button-container\s*\{/);
    assert.match(injectedStyle.textContent, /\.skip-button-container\s*\{[\s\S]*?right:\s*var\(--jwp-dock-width\)\s*!important/);
  });
});
