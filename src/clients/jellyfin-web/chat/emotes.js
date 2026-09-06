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
    { token: ':booba:', label: 'BOOBA', src: image('booba') },
    { token: ':dead:', label: 'Dead', src: image('dead') },
    { token: ':clown:', label: 'Clown', src: image('clown') },
    { token: ':aintnoway:', label: 'AINTNOWAY', src: image('aintnoway') },
    { token: ':eyes:', label: 'Eyes', src: image('eyes') },
    { token: ':popcorn:', label: 'Popcorn', src: image('popcorn') },
    { token: ':salute:', label: 'Salute', src: image('salute') },
    { token: ':chef:', label: 'Chef', src: image('chef') },
    { token: ':party:', label: 'Party', src: image('party') },
    { token: ':prayge:', label: 'Prayge', src: image('prayge') },
    { token: ':peepolove:', label: 'peepoLove', src: image('heart') },
    { token: ':uhh:', label: 'uhh', src: image('uhh') },
    { token: ':petpet:', label: 'PETPET', src: image('petpet') },
    { token: ':ppl:', label: 'ppL', src: image('ppl') },
    { token: ':clap:', label: 'Clap', src: image('clap') },
    { token: ':aware:', label: 'Aware', src: image('aware') },
    { token: ':peepohappy:', label: 'peepoHappy', src: image('peepohappy') },
    { token: ':peeposad:', label: 'peepoSad', src: image('peeposad') },
    { token: ':peeporun:', label: 'peepoRun', src: image('peeporun') },
    { token: ':ragey:', label: 'RAGEY', src: image('ragey') },
    { token: ':hi:', label: 'hi', src: image('hi') },
    { token: ':noooo:', label: 'NOOOO', src: image('noooo') },
    { token: ':caught:', label: 'CAUGHT', src: image('caught') },
    { token: ':catjam:', label: 'catJAM', src: image('catjam') },
    { token: ':peepopls:', label: 'peepoPls', src: image('peepopls') },
    { token: ':teatime:', label: 'TeaTime', src: image('teatime') },
    { token: ':pianotime:', label: 'PianoTime', src: image('pianotime') },
    { token: ':winetime:', label: 'WineTime', src: image('winetime') },
    { token: ':peepocomfy:', label: 'peepoComfy', src: image('peepocomfy') },
    { token: ':biblethump:', label: 'BibleThump', src: image('biblethump') },
    { token: ':glorp:', label: 'glorp', src: image('glorp') },
    { token: ':stare:', label: 'Stare', src: image('stare') },
    { token: ':troll:', label: 'TROLL', src: image('troll') },
    { token: ':ayaya:', label: 'AYAYA', src: image('ayaya') },
    { token: ':vibe:', label: 'VIBE', src: image('vibe') },
    { token: ':feelsweirdman:', label: 'FeelsWeirdMan', src: image('feelsweirdman') },
    { token: ':ez:', label: 'EZ', src: image('ez') },
    { token: ':feelsokayman:', label: 'FeelsOkayMan', src: image('feelsokayman') },
    { token: ':nerd:', label: 'Nerd', src: image('nerd') },
    { token: ':7cinema:', label: '7Cinema', src: image('7cinema') },
    { token: ':xdx:', label: 'xdx', src: image('xdx') },
    { token: ':aloo:', label: 'Aloo', src: image('aloo') }
  ]);

  // Retired picker entries remain supported in existing chat history.
  const LEGACY_EMOTES = [
    { token: ':pepepls:', label: 'PepePls', src: image('pepepls') },
    { token: ':heart:', label: 'peepoLove', src: image('heart') },
    { token: ':trolldespair:', label: 'TrollDespair', src: image('trolldespair') },
    { token: ':rareparrot:', label: 'RareParrot', src: image('rareparrot') },
    { token: ':bonk:', label: 'Bonk', src: image('bonk') },
    { token: ':raintime:', label: 'RainTime', src: image('raintime') },
    { token: ':feelsstrongman:', label: 'FeelsStrongMan', src: image('feelsstrongman') },
    { token: ':nanaayaya:', label: 'nanaAYAYA', src: image('nanaayaya') },
    { token: ':fire:', label: 'Fire', src: image('fire') },
    { token: ':waytoodank:', label: 'WAYTOODANK', src: image('waytoodank') },
    { token: ':partyparrot:', label: 'PartyParrot', src: image('partyparrot') },
    { token: ':feelsdankman:', label: 'FeelsDankMan', src: image('feelsdankman') },
    { token: ':billyapprove:', label: 'BillyApprove', src: image('billyapprove') },
    { token: ':forsenpls:', label: 'forsenPls', src: image('forsenpls') },
    { token: ':aliendance:', label: 'AlienDance', src: image('aliendance') },
    { token: ':basedgod:', label: 'BasedGod', src: image('basedgod') },
    { token: ':acestare:', label: 'aceStare', src: image('acestare') },
    { token: ':nymncorn:', label: 'nymnCorn', src: image('nymncorn') },
  ];
  const RENDERABLE_EMOTES = [...EMOTES, ...LEGACY_EMOTES];

  const emoteByToken = Object.fromEntries(RENDERABLE_EMOTES.map(emote => [emote.token, emote]));
  const escapedTokens = RENDERABLE_EMOTES.map(emote => emote.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
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

  const getEmoteCompletion = (input) => {
    const caret = input.selectionStart;
    if (!Number.isInteger(caret) || caret !== input.selectionEnd) return null;
    const value = input.value;
    // Do not treat URLs, times, or an already completed token as a query.
    const match = value.slice(0, caret).match(/(?:^|[\s([{]):([a-z0-9]+)$/i);
    if (!match) return null;
    const query = match[1].toLowerCase();
    const start = caret - query.length - 1;
    const end = caret + value.slice(caret).match(/^[a-z0-9]*:?/i)[0].length;
    const matches = EMOTES.filter(emote =>
      emote.token.includes(query) || emote.label.toLowerCase().includes(query)
    ).sort((a, b) => Number(b.token.slice(1).startsWith(query)) -
      Number(a.token.slice(1).startsWith(query))).slice(0, 8);
    return matches.length ? { start, end, matches, key: JSON.stringify([value, caret]) } : null;
  };

  const insertEmote = (input, token, replacement = null) => {
    if (!input || !emoteByToken[String(token || '').toLowerCase()]) return false;
    const value = String(input.value || '');
    const start = replacement?.start ?? (Number.isInteger(input.selectionStart) ? input.selectionStart : value.length);
    const end = replacement?.end ?? (Number.isInteger(input.selectionEnd) ? input.selectionEnd : start);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const prefix = !replacement && before && !/\s$/.test(before) ? ' ' : '';
    const suffix = replacement ? (!after || !/^[\s.,!?;:)\]}]/.test(after) ? ' ' : '') :
      (after && !/^\s/.test(after) ? ' ' : '');
    const insertion = `${prefix}${token}${suffix}`;
    const nextValue = `${before}${insertion}${after}`;
    if (input.maxLength >= 0 && nextValue.length > input.maxLength) return false;
    input.value = nextValue;
    chat.draftText = nextValue;
    const caret = start + insertion.length;
    if (typeof input.focus === 'function') input.focus({ preventScroll: true });
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(caret, caret);
    if (typeof input.dispatchEvent === 'function') input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };

  Object.assign(chat, {
    emotes: EMOTES,
    renderEmotes,
    containsOnlyEmotes,
    plainEmotes,
    getEmoteCompletion,
    insertEmote
  });
})();
