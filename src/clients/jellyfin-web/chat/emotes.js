(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const chat = JWP.chat = JWP.chat || { messages: [], unreadCount: 0 };
  const utils = JWP.utils;

  // Named, dependency-free emotes: the token is sent as ordinary chat text,
  // so history, reconnects and accountless guests all render it identically.
  const EMOTES = Object.freeze([
    { token: ':pog:', label: 'Pog', glyph: '😲' },
    { token: ':kekw:', label: 'KEKW', glyph: '🤣' },
    { token: ':sus:', label: 'Sus', glyph: '🤨' },
    { token: ':copium:', label: 'Copium', glyph: '😮‍💨' },
    { token: ':cry:', label: 'Cry', glyph: '😭' },
    { token: ':hype:', label: 'Hype', glyph: '🤩' },
    { token: ':bonk:', label: 'Bonk', glyph: '🔨' },
    { token: ':dead:', label: 'Dead', glyph: '💀' },
    { token: ':clown:', label: 'Clown', glyph: '🤡' },
    { token: ':fire:', label: 'Fire', glyph: '🔥' },
    { token: ':eyes:', label: 'Eyes', glyph: '👀' },
    { token: ':popcorn:', label: 'Popcorn', glyph: '🍿' },
    { token: ':salute:', label: 'Salute', glyph: '🫡' },
    { token: ':chef:', label: 'Chef', glyph: '🧑‍🍳' },
    { token: ':party:', label: 'Party', glyph: '🥳' },
    { token: ':heart:', label: 'Heart', glyph: '❤️' }
  ]);

  const emoteByToken = Object.fromEntries(EMOTES.map(emote => [emote.token, emote]));
  const escapedTokens = EMOTES.map(emote => emote.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const tokenPattern = () => new RegExp(`(${escapedTokens.join('|')})`, 'gi');

  const renderEmotes = (text) => utils.escapeHtml(String(text || '')).replace(tokenPattern(), match => {
    const emote = emoteByToken[match.toLowerCase()];
    if (!emote) return match;
    return `<span class="jwp-chat-emote" role="img" aria-label="${emote.label}" title="${emote.token}">${emote.glyph}</span>`;
  });

  const containsOnlyEmotes = (text) => {
    const value = String(text || '').trim();
    return !!value && value.replace(tokenPattern(), '').trim() === '';
  };

  const plainEmotes = (text) => String(text || '').replace(tokenPattern(), match => {
    return emoteByToken[match.toLowerCase()]?.glyph || match;
  });

  const insertEmote = (input, token) => {
    if (!input || !emoteByToken[String(token || '').toLowerCase()]) return false;
    const value = String(input.value || '');
    const start = Number.isInteger(input.selectionStart) ? input.selectionStart : value.length;
    const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = before && !/\s$/.test(before) ? ' ' : '';
    const suffix = after && !/^\s/.test(after) ? ' ' : '';
    const insertion = `${prefix}${token}${suffix}`;
    input.value = `${before}${insertion}${after}`;
    const caret = start + insertion.length;
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(caret, caret);
    if (typeof input.focus === 'function') input.focus();
    return true;
  };

  Object.assign(chat, {
    emotes: EMOTES,
    renderEmotes,
    containsOnlyEmotes,
    plainEmotes,
    insertEmote
  });
})();
