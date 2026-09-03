(() => {
  const JWP = window.JellyWatchParty = window.JellyWatchParty || {};
  const cursor = JWP.cursor = JWP.cursor || {};
  const state = JWP.state;
  const utils = JWP.utils;

  const SEND_INTERVAL_MS = 50;
  const STALE_AFTER_MS = 1600;
  const MAX_TRAIL_POINTS = 600;
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const elements = new Map();
  const trails = new Map();
  const timers = new Map();
  let bound = false;
  let holding = false;
  let visible = false;
  let lastSentAt = 0;
  let lastPointer = null;
  let pendingPoint = null;
  let sendTimer = null;

  const nickname = () => String(state.chatNickname || '').trim();

  const isEditable = (target) => {
    if (!target) return false;
    const tag = String(target.tagName || '').toLowerCase();
    return tag === 'input'
      || tag === 'textarea'
      || tag === 'select'
      || target.isContentEditable === true
      || (typeof target.closest === 'function' && !!target.closest('[contenteditable="true"]'));
  };

  const pointFromEvent = (event, video = utils.getVideo()) => {
    if (!video || typeof video.getBoundingClientRect !== 'function') return null;
    const rect = video.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    };
  };

  const removeTrail = (clientId) => {
    const trail = trails.get(clientId);
    if (trail?.element) trail.element.remove();
    trails.delete(clientId);
  };

  const removeCursor = (clientId) => {
    const element = elements.get(clientId);
    if (element) element.remove();
    elements.delete(clientId);
    removeTrail(clientId);
    const timer = timers.get(clientId);
    if (timer) clearTimeout(timer);
    timers.delete(clientId);
  };

  const trailElement = (clientId, username) => {
    let trail = trails.get(clientId);
    if (!trail) {
      const element = document.createElementNS(SVG_NAMESPACE, 'svg');
      element.classList.add('jwp-shared-cursor-trail');
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
      element.setAttribute('preserveAspectRatio', 'none');
      const line = document.createElementNS(SVG_NAMESPACE, 'polyline');
      line.classList.add('jwp-shared-cursor-trail-line');
      element.appendChild(line);
      document.body.appendChild(element);
      trail = { element, line, points: [] };
      trails.set(clientId, trail);
    }
    trail.element.style.setProperty('--jwp-user-color', utils.userColor(username));
    return trail;
  };

  const addTrailPoint = (clientId, username, x, y) => {
    const trail = trailElement(clientId, username);
    const previous = trail.points[trail.points.length - 1];
    // Ignore sub-pixel jitter without breaking a continuous stroke.
    if (previous && Math.hypot(x - previous.x, y - previous.y) < 1) return;
    trail.points.push({ x, y });
    if (trail.points.length > MAX_TRAIL_POINTS) {
      trail.points.splice(0, trail.points.length - MAX_TRAIL_POINTS);
    }
    trail.line.setAttribute(
      'points',
      trail.points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
    );
  };

  const clearTrails = () => Array.from(trails.keys()).forEach(removeTrail);

  const cursorElement = (clientId, username) => {
    let element = elements.get(clientId);
    if (!element) {
      element = document.createElement('div');
      element.className = 'jwp-shared-cursor';
      element.setAttribute('aria-hidden', 'true');
      element.innerHTML = `
        <svg class="jwp-shared-cursor-arrow" viewBox="0 0 20 28" focusable="false" aria-hidden="true">
          <path d="M2 2v20l5.4-5 4.1 9 4-1.8-4.1-8.8H19z"></path>
        </svg>
        <span class="jwp-shared-cursor-name"></span>
      `;
      document.body.appendChild(element);
      elements.set(clientId, element);
    }
    const nameElement = element.querySelector('.jwp-shared-cursor-name');
    if (nameElement) nameElement.textContent = username;
    element.style.setProperty('--jwp-user-color', utils.userColor(username));
    return element;
  };

  const showCursor = (clientId, username, point) => {
    const video = utils.getVideo();
    if (!video || !point) {
      removeCursor(clientId);
      return;
    }
    const rect = video.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const element = cursorElement(clientId, username);
    const x = rect.left + (point.x * rect.width);
    const y = rect.top + (point.y * rect.height);
    addTrailPoint(clientId, username, x, y);
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.classList.add('visible');
    const oldTimer = timers.get(clientId);
    if (oldTimer) clearTimeout(oldTimer);
    timers.set(clientId, setTimeout(() => removeCursor(clientId), STALE_AFTER_MS));
  };

  const sendPoint = (point) => {
    if (!point || !JWP.actions?.send || !state.inRoom || !nickname()) return;
    lastSentAt = Date.now();
    JWP.actions.send('cursor_update', {
      visible: true,
      x: point.x,
      y: point.y,
      username: nickname()
    });
    showCursor(state.clientId || 'local', nickname(), point);
    visible = true;
  };

  const flushPending = () => {
    sendTimer = null;
    if (!holding || !pendingPoint) return;
    const point = pendingPoint;
    pendingPoint = null;
    sendPoint(point);
  };

  const queuePoint = (point) => {
    pendingPoint = point;
    const remaining = SEND_INTERVAL_MS - (Date.now() - lastSentAt);
    if (remaining <= 0) {
      if (sendTimer) clearTimeout(sendTimer);
      sendTimer = null;
      flushPending();
    } else if (!sendTimer) {
      sendTimer = setTimeout(flushPending, remaining);
    }
  };

  const hideOwnCursor = () => {
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = null;
    pendingPoint = null;
    removeCursor(state.clientId || 'local');
    if (visible && JWP.actions?.send && state.inRoom) {
      JWP.actions.send('cursor_update', { visible: false, username: nickname() });
    }
    visible = false;
  };

  const onKeyDown = (event) => {
    if (event.code !== 'KeyX' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditable(event.target) || !state.inRoom || !utils.getVideo()) return;
    if (!nickname()) {
      if (JWP.ui?.showToast) JWP.ui.showToast('Choose a nickname in chat settings first');
      return;
    }
    event.preventDefault();
    holding = true;
    const point = lastPointer ? pointFromEvent(lastPointer) : null;
    if (point) queuePoint(point);
  };

  const onKeyUp = (event) => {
    if (event.code !== 'KeyX' || !holding) return;
    event.preventDefault();
    holding = false;
    hideOwnCursor();
  };

  const onPointerMove = (event) => {
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
    if (!holding) return;
    const point = pointFromEvent(event);
    if (point) queuePoint(point);
    else hideOwnCursor();
  };

  const stopSharing = () => {
    if (!holding && !visible) return;
    holding = false;
    hideOwnCursor();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') stopSharing();
  };

  const receive = (message) => {
    const clientId = String(message.client || 'unknown');
    if (clientId === state.clientId) return;
    const payload = message.payload || {};
    if (payload.visible === false) {
      removeCursor(clientId);
      return;
    }
    const x = Number(payload.x);
    const y = Number(payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return;
    showCursor(clientId, String(payload.username || 'Anonymous'), { x, y });
  };

  const reset = () => {
    stopSharing();
    Array.from(elements.keys()).forEach(removeCursor);
  };

  const bind = () => {
    if (bound) return;
    bound = true;
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('mousemove', onPointerMove, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', stopSharing);
    window.addEventListener('resize', clearTrails);
  };

  const cleanup = () => {
    if (!bound) return;
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('mousemove', onPointerMove, true);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', stopSharing);
    window.removeEventListener('resize', clearTrails);
    bound = false;
    reset();
  };

  Object.assign(cursor, { bind, cleanup, receive, reset, pointFromEvent });
})();
