(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const chat = JWP.chat = JWP.chat || { messages: [], unreadCount: 0 };
  const utils = JWP.utils;

  const assetBase = JWP.assetBase || '/JellyWatchParty/Asset';
  const image = (name) => `${assetBase}/emotes/${name}.webp`;

  // The token is sent as ordinary chat text, while the actual image is bundled
  // with JellyWatchParty. History, reconnects and accountless guests therefore
  // render the same custom emote without needing 7TV or a browser extension.
  const EMOTES = Object.freeze([
    { token: ':pog:', label: 'Pog', src: image('pog') },
    { token: ':kekw:', label: 'KEKW', src: image('kekw') },
    { token: ':sus:', label: 'Sus', src: image('sus') },
    { token: ':copium:', label: 'Copium', src: image('copium') },
    { token: ':cry:', label: 'Cry', src: image('cry') },
    { token: ':hype:', label: 'Hype', src: image('hype') },
    { token: ':bonk:', label: 'Bonk', src: image('bonk') },
    { token: ':dead:', label: 'Dead', src: image('dead') },
    { token: ':clown:', label: 'Clown', src: image('clown') },
    { token: ':fire:', label: 'Fire', src: image('fire') },
    { token: ':eyes:', label: 'Eyes', src: image('eyes') },
    { token: ':popcorn:', label: 'Popcorn', src: image('popcorn') },
    { token: ':salute:', label: 'Salute', src: image('salute') },
    { token: ':chef:', label: 'Chef', src: image('chef') },
    { token: ':party:', label: 'Party', src: image('party') },
    { token: ':heart:', label: 'Heart', src: image('heart') }
  ]);

  const emoteByToken = Object.fromEntries(EMOTES.map(emote => [emote.token, emote]));
  const escapedTokens = EMOTES.map(emote => emote.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const tokenPattern = () => new RegExp(`(${escapedTokens.join('|')})`, 'gi');

  const renderEmotes = (text) => utils.escapeHtml(String(text || '')).replace(tokenPattern(), match => {
    const emote = emoteByToken[match.toLowerCase()];
    if (!emote) return match;
    return `<img class="jwp-chat-emote" src="${utils.escapeHtml(emote.src)}" alt="${emote.label}" title="${emote.token}" loading="lazy" decoding="async">`;
  });

  const containsOnlyEmotes = (text) => {
    const value = String(text || '').trim();
    return !!value && value.replace(tokenPattern(), '').trim() === '';
  };

  const plainEmotes = (text) => String(text || '').replace(tokenPattern(), match => {
    const emote = emoteByToken[match.toLowerCase()];
    return emote ? `[${emote.label}]` : match;
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
