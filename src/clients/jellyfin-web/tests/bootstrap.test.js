const { it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../invite-bootstrap.html'), 'utf8');
const script = html.match(/<script id="jwp-invite-bootstrap-script">([\s\S]*?)<\/script>/)[1];
const room = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function boot(address, hash = '#/home', closed = false) {
  const classes = new Set();
  const context = { URL, location: { origin: 'https://example.test', href: 'https://example.test/jellyfin/web/',
    pathname: '/jellyfin/web/', hash }, document: { documentElement: { classList: { add: (...values) => values.forEach(v => classes.add(v)) } }, addEventListener() {} },
    localStorage: { getItem: () => JSON.stringify({ Servers: [{ ManualAddress: address, JwpRoomId: room, UserId: 'guest', AccessToken: 'test-token' }] }) },
    sessionStorage: { getItem: () => closed ? room : null } };
  context.window = context; vm.runInNewContext(script, context); return { context, classes };
}
it('locks a redeemed guest before Jellyfin paints even after a reload without invite parameters', () => {
  const result = boot('https://example.test/jellyfin');
  assert.equal(result.context.__jwpGuestRoom, room);
  assert(result.classes.has('jwp-party-guest'));
  assert(result.classes.has('jwp-join-chat'));
});
it('does not reuse guest metadata belonging to another origin or base path', () => {
  for (const address of ['https://other.test/jellyfin', 'https://example.test/other']) {
    assert.equal(boot(address).context.__jwpGuestRoom, undefined);
  }
});
it('remembers an explicit guest departure when reloading', () => {
  assert.equal(boot('https://example.test/jellyfin', '#/home', true).context.__jwpGuestClosed, true);
});
