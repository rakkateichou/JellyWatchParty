const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JWP = require('./setup.js');

require('../ui/home.js');

describe('home watch-party section', () => {
  beforeEach(() => {
    globalThis.document = { getElementById: () => null };
  });

  it('does not create a home shelf when none exists', () => {
    assert.doesNotThrow(() => JWP.ui.renderHomeWatchParties());
  });

  it('removes a shelf left behind by older cached client code', () => {
    let removed = false;
    globalThis.document = {
      getElementById: (id) => id === JWP.constants.HOME_SECTION_ID
        ? { remove: () => { removed = true; } }
        : null
    };

    JWP.ui.renderHomeWatchParties();

    assert.equal(removed, true);
  });
});
