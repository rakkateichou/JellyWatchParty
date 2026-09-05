const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JWP = require('./setup.js');

require('../chat/emotes.js');

describe('Twitch-style chat emotes', () => {
  let input;

  beforeEach(() => {
    input = {
      value: 'well',
      selectionStart: 4,
      selectionEnd: 4,
      focusCalled: false,
      setSelectionRange(start, end) {
        this.selectionStart = start;
        this.selectionEnd = end;
      },
      focus() { this.focusCalled = true; }
    };
  });

  it('renders known tokens as safe inline emotes and preserves unknown tokens', () => {
    const html = JWP.chat.renderEmotes('<b>:pog:</b> :unknown:');

    assert.match(html, /&lt;b&gt;<img class="jwp-chat-emote"/);
    assert.match(html, /alt="Pog"/);
    assert.match(html, /\/JellyWatchParty\/Asset\/emotes\/pog\.webp/);
    assert.match(html, /:unknown:/);
    assert.doesNotMatch(html, /<b>/);
  });

  it('recognizes emote-only messages for jumbo rendering', () => {
    assert.equal(JWP.chat.containsOnlyEmotes(':kekw: :fire:'), true);
    assert.equal(JWP.chat.containsOnlyEmotes('wow :kekw:'), false);
  });

  it('inserts a selected emote at the caret with readable spacing', () => {
    assert.equal(JWP.chat.insertEmote(input, ':sus:'), true);
    assert.equal(input.value, 'well :sus:');
    assert.equal(input.selectionStart, input.value.length);
    assert.equal(input.focusCalled, true);
  });

  it('converts image emotes to readable labels for notifications', () => {
    assert.equal(JWP.chat.plainEmotes('that ending :dead:'), 'that ending [Dead]');
  });

  it('includes the current catalogue with unique tokens and bundled images', () => {
    assert.equal(JWP.chat.emotes.length, 47);
    assert.equal(new Set(JWP.chat.emotes.map(emote => emote.token)).size, 47);
    assert.equal(JWP.chat.renderEmotes(':partyparrot: :waytoodank: :winetime:').match(/jwp-chat-emote/g)?.length, 3);

    for (const emote of JWP.chat.emotes) {
      const filename = path.basename(new URL(emote.src, 'https://jellyfin.test').pathname);
      const asset = path.join(__dirname, '..', 'assets', 'emotes', filename);
      assert.equal(fs.existsSync(asset), true, `missing bundled emote: ${filename}`);
    }
  });

  it('offers the replacement emotes once and still renders retired chat tokens', () => {
    for (const name of ['hi', 'noooo', 'catjam', 'caught', 'peeporun', 'trolldespair', 'prayge']) {
      assert.equal(JWP.chat.emotes.filter(emote => emote.token === `:${name}:`).length, 1);
      assert.match(JWP.chat.renderEmotes(`:${name}:`), /<img /);
    }
    for (const name of ['billyapprove', 'forsenpls', 'basedgod', 'aliendance', 'nymncorn', 'feelsdankman', 'acestare', 'partyparrot']) {
      assert.equal(JWP.chat.emotes.some(emote => emote.token === `:${name}:`), false);
      assert.match(JWP.chat.renderEmotes(`:${name}:`), /<img /);
    }
  });
});
