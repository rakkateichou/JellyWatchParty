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

  it('suggests up to eight current emotes with case-insensitive prefixes first', () => {
    input.value = ':PE';
    input.selectionStart = input.selectionEnd = 3;
    const result = JWP.chat.getEmoteCompletion(input);
    assert.equal(result.matches[0].token, ':peepolove:');
    assert.ok(result.matches.length <= 8);
    assert.ok(result.matches.some(emote => emote.token === ':peeporun:'));
    input.value = ':run';
    input.selectionStart = input.selectionEnd = 4;
    assert.deepEqual(JWP.chat.getEmoteCompletion(input).matches.map(emote => emote.token), [':peeporun:']);
  });

  it('avoids suggestions inside URLs, times, completed tokens and selected text', () => {
    for (const value of [':', 'https://pog', '12:30', 'word:pe', ':pog:', ':pog:pe', ':unknown', ':trolldespair']) {
      input.value = value;
      input.selectionStart = input.selectionEnd = value.length;
      assert.equal(JWP.chat.getEmoteCompletion(input), null, value);
    }
    input.value = ':pe';
    input.selectionStart = 0;
    input.selectionEnd = 3;
    assert.equal(JWP.chat.getEmoteCompletion(input), null);
  });

  it('completes the whole token at the caret without disturbing surrounding text', () => {
    input.value = 'before (:peeporun:) after';
    input.selectionStart = input.selectionEnd = 'before (:pe'.length;
    const result = JWP.chat.getEmoteCompletion(input);
    assert.equal(JWP.chat.insertEmote(input, ':peepolove:', result), true);
    assert.equal(input.value, 'before (:peepolove:) after');
    assert.equal(input.selectionStart, 'before (:peepolove:'.length);
    assert.equal(JWP.chat.draftText, input.value);
  });

  it('adds a space after completion and refuses to exceed the chat length limit', () => {
    input.value = ':run';
    input.selectionStart = input.selectionEnd = 4;
    input.maxLength = 5;
    const result = JWP.chat.getEmoteCompletion(input);
    assert.equal(JWP.chat.insertEmote(input, ':peeporun:', result), false);
    assert.equal(input.value, ':run');
    assert.equal(input.selectionStart, 4);
    input.maxLength = 500;
    assert.equal(JWP.chat.insertEmote(input, ':peeporun:', result), true);
    assert.equal(input.value, ':peeporun: ');
    assert.equal(input.selectionStart, 11);
  });

  it('includes the current catalogue with unique tokens and bundled images', () => {
    assert.equal(JWP.chat.emotes.length, 48);
    assert.equal(new Set(JWP.chat.emotes.map(emote => emote.token)).size, 48);
    assert.equal(JWP.chat.renderEmotes(':partyparrot: :waytoodank: :winetime: :aloo:').match(/jwp-chat-emote/g)?.length, 4);

    for (const emote of JWP.chat.emotes) {
      const filename = path.basename(new URL(emote.src, 'https://jellyfin.test').pathname);
      const asset = path.join(__dirname, '..', 'assets', 'emotes', filename);
      assert.equal(fs.existsSync(asset), true, `missing bundled emote: ${filename}`);
    }
  });

  it('offers the replacement emotes once and still renders retired chat tokens', () => {
    for (const name of ['hi', 'noooo', 'catjam', 'caught', 'peeporun', 'peepolove', 'troll', 'aware', 'prayge', 'ragey', 'booba', 'uhh', 'nerd', 'peepocomfy', 'aintnoway', 'vibe']) {
      assert.equal(JWP.chat.emotes.filter(emote => emote.token === `:${name}:`).length, 1);
      assert.match(JWP.chat.renderEmotes(`:${name}:`), /<img /);
    }
    for (const name of ['billyapprove', 'forsenpls', 'basedgod', 'aliendance', 'nymncorn', 'feelsdankman', 'acestare', 'partyparrot', 'waytoodank', 'bonk', 'raintime', 'feelsstrongman', 'nanaayaya', 'fire', 'rareparrot', 'heart', 'trolldespair', 'pepepls']) {
      assert.equal(JWP.chat.emotes.some(emote => emote.token === `:${name}:`), false);
      assert.match(JWP.chat.renderEmotes(`:${name}:`), /<img /);
    }
  });
});
