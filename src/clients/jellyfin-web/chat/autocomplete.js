(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const chat = JWP.chat = JWP.chat || {};
  let emoteAutocomplete = null;

  function initEmoteAutocomplete(input, form) {
    if (!input || !form) return;
    if (emoteAutocomplete?.input === input && emoteAutocomplete.list.isConnected) return;
    emoteAutocomplete?.destroy();
    const list = document.createElement('div');
    list.id = 'jwp-emote-autocomplete';
    list.hidden = true;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Emote suggestions');
    form.append(list);
    const previousAutocomplete = input.getAttribute('aria-autocomplete');
    const previousControls = input.getAttribute('aria-controls');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', [previousControls, list.id].filter(Boolean).join(' '));
    let current = null;
    let selected = 0;
    let dismissed = '';
    let composing = false;
    let accepting = false;
    const listeners = [];
    const listen = (target, name, fn, capture = false) => {
      target.addEventListener(name, fn, capture);
      listeners.push(() => target.removeEventListener(name, fn, capture));
    };
    const close = (dismiss = false) => {
      if (dismiss) dismissed = JSON.stringify([input.value, input.selectionStart]);
      current = null;
      list.hidden = true;
      input.removeAttribute('aria-activedescendant');
    };
    const highlight = () => {
      [...list.children].forEach((option, index) => {
        option.setAttribute('aria-selected', String(index === selected));
      });
      const option = list.children[selected];
      input.setAttribute('aria-activedescendant', option.id);
      // Scroll only the suggestion list, never the room or video pane.
      if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
      }
    };
    const update = () => {
      if (accepting) return;
      if (composing || input.disabled || input.readOnly || document.activeElement !== input || !input.isConnected ||
        !document.getElementById('jwp-emote-picker')?.hidden) return close();
      const next = chat.getEmoteCompletion(input);
      if (!next || next.key === dismissed) return close();
      if (next.key === current?.key) return;
      current = next;
      selected = 0;
      list.replaceChildren(...next.matches.map((emote, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.tabIndex = -1;
        option.id = `${list.id}-${index}`;
        option.dataset.index = String(index);
        option.setAttribute('role', 'option');
        option.setAttribute('aria-label', `${emote.label} ${emote.token}`);
        option.title = emote.token;
        const image = document.createElement('img');
        image.src = emote.src;
        image.alt = '';
        image.decoding = 'async';
        image.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = emote.token;
        option.append(image, label);
        return option;
      }));
      list.hidden = false;
      highlight();
    };
    const accept = index => {
      if (!current || chat.getEmoteCompletion(input)?.key !== current.key) return close();
      const emote = current.matches[index];
      if (!emote) return;
      accepting = true;
      try { chat.insertEmote(input, emote.token, current); }
      finally { accepting = false; close(true); }
    };
    listen(input, 'input', update);
    listen(input, 'click', update);
    listen(input, 'focus', update);
    listen(input, 'compositionstart', () => { composing = true; close(); });
    listen(input, 'compositionend', () => { composing = false; update(); });
    listen(input, 'blur', event => { if (!list.contains(event.relatedTarget)) close(true); });
    listen(document, 'selectionchange', () => { if (document.activeElement === input) update(); });
    listen(document, 'click', event => {
      if (event.target !== input && !list.contains(event.target)) close(true);
    });
    listen(input, 'keydown', event => {
      if (composing || event.isComposing || event.keyCode === 229 || event.ctrlKey ||
        event.metaKey || event.altKey || event.shiftKey) return;
      if (!current || list.hidden) return;
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return;
      // Capture before Jellyfin's chat handler so completing never sends a message.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') close(true);
      else if (event.key === 'Enter' || event.key === 'Tab') accept(selected);
      else {
        selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) +
          current.matches.length) % current.matches.length;
        highlight();
      }
    }, true);
    listen(list, 'wheel', event => event.stopPropagation());
    listen(list, 'mousewheel', event => event.stopPropagation());
    listen(list, 'mousedown', event => event.preventDefault());
    listen(list, 'click', event => {
      const option = event.target.closest('button[data-index]');
      if (option && list.contains(option)) accept(Number(option.dataset.index));
    });
    emoteAutocomplete = { input, list, update, close, destroy() {
      close();
      listeners.forEach(remove => remove());
      list.remove();
      for (const [name, value] of [['aria-autocomplete', previousAutocomplete], ['aria-controls', previousControls]]) {
        if (value === null) input.removeAttribute(name);
        else input.setAttribute(name, value);
      }
    } };
  }

  const destroyEmoteAutocomplete = () => {
    emoteAutocomplete?.destroy();
    emoteAutocomplete = null;
  };
  const closeEmoteAutocomplete = (dismiss = false) => emoteAutocomplete?.close(dismiss);
  Object.assign(chat, { initEmoteAutocomplete, destroyEmoteAutocomplete, closeEmoteAutocomplete });
})();
