const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { parseHTML } = require('linkedom');

const code = ['emotes.js', 'autocomplete.js'].map(name =>
  readFileSync(path.join(__dirname, '..', 'chat', name), 'utf8')).join('\n');

function harness() {
    const dom = parseHTML('<html><body><form><input type="text"><div id="jwp-emote-picker" hidden></div><button id="jwp-emote-toggle"></button></form></body></html>');
    const { document, Event } = dom;
    const input = document.querySelector('input');
    const form = document.querySelector('form');
    const prepareInput = field => {
        field.selectionStart = field.selectionEnd = 0;
        field.maxLength = 500;
        field.focus = () => { document.activeElement = field; };
        field.setSelectionRange = (start, end) => { field.selectionStart = start; field.selectionEnd = end; };
    };
    prepareInput(input);
    const JWP = { chat: {}, utils: { escapeHtml: value => String(value) } };
    const sandbox = vm.createContext({ document, Event, window: { JellyWatchParty: JWP } });
    vm.runInContext(code, sandbox);
    const context = JWP.chat;
    context.initEmoteAutocomplete(input, form);
    input.focus();
    const fire = (target, name, options = {}) => {
        const event = new Event(name, { bubbles: true, cancelable: true });
        Object.assign(event, options);
        target.dispatchEvent(event);
        return event;
    };
    return {
        document, input, form, context, fire, prepareInput,
        get list() { return document.getElementById('jwp-emote-autocomplete'); },
        type(value, caret = value.length, end = caret) {
            input.value = value;
            input.setSelectionRange(caret, end);
            fire(input, 'input');
        },
        key(key, options) { return fire(input, 'keydown', { key, ...options }); }
    };
}

const tokens = h => [...h.list.children].map(option => option.textContent);

test('matches names and tokens case-insensitively, with prefixes first and at most eight previews', () => {
    const h = harness();
    h.type(':PE');
    assert.equal(h.list.hidden, false);
    assert.equal(tokens(h)[0], ':peepolove:');
    assert.ok(tokens(h).includes(':peeporun:'));
    assert.ok(h.list.children.length <= 8);
    assert.equal(h.list.querySelectorAll('img').length, h.list.children.length);
    h.type(':run');
    assert.deepEqual(tokens(h), [':peeporun:']);
    assert.equal(h.input.getAttribute('aria-activedescendant'), h.list.firstElementChild.id);
});

for (const value of [':', 'plain text', 'https://pog', '12:30', 'word:pe', ':pog:', ':pog:pe', ':missing']) {
    test(`does not suggest for ${JSON.stringify(value)}`, () => {
        const h = harness();
        h.type(value);
        assert.equal(h.list.hidden, true);
        assert.equal(h.key('Enter').defaultPrevented, false);
    });
}

test('arrows cycle and Enter completes without reaching the native send handler', () => {
    const h = harness();
    let sends = 0;
    let changes = 0;
    h.input.addEventListener('keydown', event => { if (event.key === 'Enter') sends++; });
    h.input.addEventListener('input', () => changes++);
    h.type('hello :pe');
    const options = tokens(h);
    h.key('ArrowUp');
    assert.equal(h.list.lastElementChild.getAttribute('aria-selected'), 'true');
    h.key('ArrowDown');
    h.key('ArrowDown');
    assert.equal(h.key('Enter').defaultPrevented, true);
    assert.equal(h.input.value, `hello ${options[1]} `);
    assert.equal(h.input.selectionStart, h.input.value.length);
    assert.equal(changes, 2, 'one native input notification on completion');
    assert.equal(sends, 0);
    assert.equal(h.list.hidden, true);
    assert.equal(h.input.hasAttribute('aria-activedescendant'), false);
    h.key('Enter');
    assert.equal(sends, 1, 'ordinary Enter works after completion');
});

test('Tab replaces the whole token at the caret and preserves surrounding punctuation and text', () => {
    const h = harness();
    h.type('before (:peeporun:) after', 'before (:pe'.length);
    h.key('Tab');
    assert.equal(h.input.value, 'before (:peepolove:) after');
    assert.equal(h.input.selectionStart, 'before (:peepolove:'.length);
});

test('clicking a preview inserts its token without sending or losing the input focus', () => {
    const h = harness();
    h.type(':run');
    const image = h.list.querySelector('img');
    assert.equal(h.fire(image, 'mousedown').defaultPrevented, true);
    h.fire(image, 'click');
    assert.equal(h.input.value, ':peeporun: ');
    assert.equal(h.document.activeElement, h.input);
    assert.equal(h.list.hidden, true);
});

test('Escape stays dismissed through selectionchange and typing a new query opens again', () => {
    const h = harness();
    h.type(':pe');
    h.key('Escape');
    h.fire(h.document, 'selectionchange');
    assert.equal(h.list.hidden, true);
    assert.equal(h.input.value, ':pe');
    h.type(':pee');
    assert.equal(h.list.hidden, false);
});

test('selections, moving the caret away, blur and opening the picker hide suggestions', () => {
    const h = harness();
    h.type(':pe', 0, 3);
    assert.equal(h.list.hidden, true);
    h.type(':pe');
    h.input.setSelectionRange(0, 0);
    h.fire(h.document, 'selectionchange');
    assert.equal(h.list.hidden, true);
    h.type(':pee');
    h.fire(h.input, 'blur');
    assert.equal(h.list.hidden, true);
    h.document.getElementById('jwp-emote-picker').hidden = false;
    h.type(':run');
    assert.equal(h.list.hidden, true);
});

test('IME composition and modified keys retain native behavior', () => {
    const h = harness();
    h.type(':pe');
    for (const options of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }]) {
        assert.equal(h.key('Enter', options).defaultPrevented, false);
        assert.equal(h.input.value, ':pe');
    }
    h.fire(h.input, 'compositionstart');
    h.type(':run');
    assert.equal(h.list.hidden, true);
    assert.equal(h.key('Enter').defaultPrevented, false);
    h.fire(h.input, 'compositionend');
    assert.equal(h.list.hidden, false);
});

test('maxlength refuses completion safely instead of sending a partial query', () => {
    const h = harness();
    h.input.maxLength = 5;
    h.type(':run');
    assert.equal(h.key('Enter').defaultPrevented, true);
    assert.equal(h.input.value, ':run');
    assert.equal(h.input.selectionStart, 4);
    assert.equal(h.list.hidden, true);
});

test('stale suggestions never replace text after the caret has moved', () => {
    const h = harness();
    h.type(':run');
    h.input.setSelectionRange(0, 0);
    h.key('Tab');
    assert.equal(h.input.value, ':run');
    assert.equal(h.list.hidden, true);
});

test('repeated setup is idempotent and replacing the input removes old handlers', () => {
    const h = harness();
    const original = h.list;
    h.context.initEmoteAutocomplete(h.input, h.form);
    assert.equal(h.list, original);
    const replacement = h.document.createElement('input');
    h.prepareInput(replacement);
    replacement.setAttribute('aria-controls', 'native-help');
    h.input.replaceWith(replacement);
    h.context.initEmoteAutocomplete(replacement, h.form);
    h.type(':run');
    assert.equal(h.list.hidden, true, 'old input no longer controls the list');
    replacement.focus();
    replacement.value = ':run';
    replacement.setSelectionRange(4, 4);
    h.fire(replacement, 'input');
    assert.equal(h.list.hidden, false);
    assert.equal(replacement.getAttribute('aria-controls'), 'native-help jwp-emote-autocomplete');
    assert.equal(h.document.querySelectorAll('#jwp-emote-autocomplete').length, 1);
});

for (const isHost of [true, false]) {
  test(`production ${isHost ? 'owner' : 'guest'} chat completes before sending and survives panel rebuilds`, () => {
    const { document, Event } = parseHTML('<html><head></head><body><div id="fixture-panel"></div></body></html>');
    const window = { document, location: new URL('https://preview.test'), innerWidth: 1200 };
    const sandbox = vm.createContext({ window, document, Event, URL, console: { log() {} } });
    for (const name of ['state.js', 'utils/misc.js', 'ui/indicators.js', 'ui/render.js',
      'chat/emotes.js', 'chat/autocomplete.js', 'chat/messages.js', 'chat/input.js']) {
      vm.runInContext(readFileSync(path.join(__dirname, '..', name), 'utf8'), sandbox);
    }
    const JWP = window.JellyWatchParty;
    document.getElementById('fixture-panel').id = JWP.constants.PANEL_ID;
    Object.assign(JWP.state, {
      inRoom: true, isHost, roomId: 'fixture', chatNickname: 'Tester',
      participantCount: 2, panelTheme: 'monochrome', panelBrightness: 80,
      ws: { readyState: 1 }
    });
    JWP.utils.getVideo = () => null;
    for (const name of ['updateRoomListUI', 'updateBridgeListUI', 'updateStatusIndicator',
      'updateServerFooter', 'updateSyncIndicator', 'renderHomeWatchParties']) JWP.ui[name] = () => {};
    const sent = [];
    JWP.actions = { send(type, payload) { sent.push({ type, ...payload }); return true; } };
    const fire = (target, name, options = {}) => {
      const event = new Event(name, { bubbles: true, cancelable: true });
      Object.assign(event, options);
      target.dispatchEvent(event);
      return event;
    };
    const prepare = () => {
      const input = document.getElementById('jwp-chat-input');
      input.maxLength = 500;
      input.focus = () => { document.activeElement = input; };
      input.setSelectionRange = (start, end) => { input.selectionStart = start; input.selectionEnd = end; };
      input.setSelectionRange(input.value.length, input.value.length);
      input.focus();
      return input;
    };
    const type = (input, value) => {
      input.value = value;
      input.setSelectionRange(value.length, value.length);
      fire(input, 'input');
    };
    JWP.ui.render(true);
    const input = prepare();
    type(input, ':run');
    fire(input, 'keydown', { key: 'Enter' });
    assert.equal(input.value, ':peeporun: ');
    assert.equal(JWP.chat.draftText, input.value);
    assert.equal(sent.length, 0);
    fire(input, 'keydown', { key: 'Enter' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].text, ':peeporun:');
    assert.equal(input.value, '');
    type(input, ':pe');
    fire(document.getElementById('jwp-chat-send'), 'click');
    assert.equal(sent[1].text, ':pe');
    assert.equal(document.getElementById('jwp-emote-autocomplete').hidden, true);
    type(input, ':run');
    fire(input, 'keydown', { key: 'Tab' });
    JWP.ui.render(true);
    const replacement = prepare();
    assert.equal(replacement.value, ':peeporun: ');
    type(input, ':pe');
    assert.equal(document.getElementById('jwp-emote-autocomplete').hidden, true);
    type(replacement, ':run');
    assert.equal(document.getElementById('jwp-emote-autocomplete').hidden, false);
    assert.equal(document.querySelectorAll('#jwp-emote-autocomplete').length, 1);
    JWP.state.chatSettingsOpen = true;
    JWP.ui.render(true);
    assert.equal(document.getElementById('jwp-emote-autocomplete'), null);
  });
}


