(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const ui = JWP.ui = JWP.ui || {};
  const utils = JWP.utils;

  const confirmAction = ({
    title,
    message = '',
    submitLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false
  } = {}) => new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'jwp-modal-overlay';
    overlay.innerHTML = `
      <div class="jwp-modal" role="alertdialog" aria-modal="true" aria-labelledby="jwp-confirm-title">
        <div class="jwp-modal-title" id="jwp-confirm-title">${utils.escapeHtml(title || '')}</div>
        <div class="jwp-modal-copy">${utils.escapeHtml(message)}</div>
        <div class="jwp-modal-actions">
          <button class="jwp-btn secondary jwp-modal-cancel">${utils.escapeHtml(cancelLabel)}</button>
          <button class="jwp-btn${danger ? ' danger' : ''} jwp-modal-submit">${utils.escapeHtml(submitLabel)}</button>
        </div>
      </div>
    `;

    const cleanup = (confirmed) => {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
      resolve(confirmed);
    };
    const cancel = () => cleanup(false);
    const submit = () => cleanup(true);
    const onKeydown = (event) => {
      if (event.key === 'Escape') cancel();
      else if (event.key === 'Enter') submit();
    };

    overlay.querySelector('.jwp-modal-submit').onclick = submit;
    overlay.querySelector('.jwp-modal-cancel').onclick = cancel;
    overlay.onclick = (event) => { if (event.target === overlay) cancel(); };
    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(overlay);
    overlay.querySelector('.jwp-modal-cancel').focus();
  });

  Object.assign(ui, { confirmAction });
})();
