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
    { token: ':heart:', label: 'Heart', src: image('heart') },
    { token: ':uhh:', label: 'uhh', src: image('uhh') },
    { token: ':petpet:', label: 'PETPET', src: image('petpet') },
    { token: ':ppl:', label: 'ppL', src: image('ppl') },
    { token: ':clap:', label: 'Clap', src: image('clap') },
    { token: ':pepepls:', label: 'PepePls', src: image('pepepls') },
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
    { token: ':trolldespair:', label: 'TrollDespair', src: image('trolldespair') },
    { token: ':ayaya:', label: 'AYAYA', src: image('ayaya') },
    { token: ':rareparrot:', label: 'RareParrot', src: image('rareparrot') },
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
