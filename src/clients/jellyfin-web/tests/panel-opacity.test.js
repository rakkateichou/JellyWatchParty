const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const stateSource = fs.readFileSync(require.resolve('../state.js'), 'utf8');

const restoredOpacity = (saved, throws = false) => {
  const window = {
    location: { protocol: 'https:', hostname: 'localhost' },
    localStorage: { getItem(key) {
      if (throws) throw new Error('Storage unavailable');
      return key === 'jwp_panel_opacity' ? saved : null;
    } }
  };
  vm.runInNewContext(stateSource, { window });
  return window.JellyWatchParty.state.panelOpacity;
};

test('panel starts at 80% when no valid opacity preference is available', () => {
  for (const saved of [null, '', '   ', 'bad', 'Infinity', '-1', '101']) {
    assert.equal(restoredOpacity(saved), 80);
  }
  assert.equal(restoredOpacity(null, true), 80);
});

test('panel restores the chosen opacity including completely transparent and opaque', () => {
  for (const saved of ['0', '35', '80', '100']) assert.equal(restoredOpacity(saved), Number(saved));
});
