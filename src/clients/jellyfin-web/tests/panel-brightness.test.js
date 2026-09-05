const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const stateSource = fs.readFileSync(require.resolve('../state.js'), 'utf8');

const restoredBrightness = (saved, throws = false, legacy = null) => {
  const window = {
    location: { protocol: 'https:', hostname: 'localhost' },
    localStorage: { getItem(key) {
      if (throws) throw new Error('Storage unavailable');
      return key === 'jwp_panel_brightness' ? saved : key === 'jwp_panel_opacity' ? legacy : null;
    } }
  };
  vm.runInNewContext(stateSource, { window });
  return window.JellyWatchParty.state.panelBrightness;
};

test('panel starts at 80% when no valid brightness preference is available', () => {
  for (const saved of [null, '', '   ', 'bad', 'Infinity', '-1', '101']) {
    assert.equal(restoredBrightness(saved), 80);
  }
  assert.equal(restoredBrightness(null, true), 80);
});

test('panel restores brightness from near-black to normal and carries over earlier opacity percentages', () => {
  for (const saved of ['0', '35', '80', '100']) {
    assert.equal(restoredBrightness(saved), Number(saved));
    assert.equal(restoredBrightness(null, false, saved), Number(saved));
    assert.equal(restoredBrightness(saved, false, '50'), Number(saved));
  }
});
