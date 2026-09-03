const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
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
});
