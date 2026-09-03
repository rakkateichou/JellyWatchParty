const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

let panelHidden = false;
let docked = false;
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
  getElementById: (id) => id === JWP.constants.PANEL_ID ? panel : null
};
globalThis.window.matchMedia = () => ({ matches: true });

require('../ui/render.js');

describe('docked player layout', () => {
  beforeEach(() => {
    panelHidden = false;
    docked = false;
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
  });

  it('does not dock outside a room', () => {
    JWP.state.inRoom = false;
    docked = true;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(docked, false);
  });

  it('does not dock a retained video element on an episode details page', () => {
    globalThis.window.location.hash = '#/details?id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    docked = true;
    JWP.ui.updateDockedPlayerLayout();
    assert.equal(docked, false);
  });
});
