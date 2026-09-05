const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

let panelHidden = false;
let docked = false;
let injectedStyle = null;
let reopen = null;
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
  createElement: () => ({ setAttribute() {} }),
  body: { appendChild: element => { reopen = element; } },
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
    JWP.state.inRoom = true;
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

  it('does not dock outside a room', () => {
    JWP.state.inRoom = false;
    panelHidden = true;
    docked = true;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(docked, false);
    assert.equal(reopen.hidden, false, 'the arrow can open the watch-party panel before joining a room');
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
