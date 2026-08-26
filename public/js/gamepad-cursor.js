const CLICK_BUTTON = 2; // X / Square in the standard Gamepad mapping.
const BUTTON_DEADZONE = 0.5;
const STICK_DEADZONE = 0.18;
const STICK_CURVE = 1.45;
const MAX_SPEED = 980;
const DPAD_SPEED = 660;
const CLICK_SLOP = 10;

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="tab"]',
  '[role="slider"]',
  '[tabindex]:not([tabindex="-1"])',
  '.lb-row',
].join(',');

const DISABLED_SELECTOR = [
  'button:disabled',
  'input:disabled',
  'select:disabled',
  'textarea:disabled',
  '[aria-disabled="true"]',
].join(',');

export function initGamepadCursor({ clickButton = CLICK_BUTTON } = {}) {
  let enabled = false;
  let frame = 0;
  let cursor = null;
  let visible = false;
  let x = Math.round(window.innerWidth / 2);
  let y = Math.round(window.innerHeight / 2);
  let lastFrame = 0;
  let lastClickDown = false;
  let downTarget = null;
  let downPoint = null;
  let hoverTarget = null;
  let syntheticEvent = false;

  window.addEventListener('gamepadconnected', () => {
    if (enabled) startLoop();
  });
  window.addEventListener('gamepaddisconnected', () => {
    if (!firstGamepad()) {
      releasePress(false);
      hideCursor();
    }
  });
  window.addEventListener('resize', () => {
    clampPosition();
    paintCursor(lastClickDown);
    updateHover();
  });
  window.addEventListener('blur', () => {
    releasePress(false);
    lastClickDown = false;
  });
  window.addEventListener('focus', () => {
    if (enabled) startLoop();
  });

  window.addEventListener('pointermove', markRealPointerActivity, true);
  window.addEventListener('pointerdown', markRealPointerActivity, true);

  function setEnabled(next) {
    enabled = !!next && !!navigator.getGamepads;
    if (!enabled) {
      stopLoop();
      releasePress(false);
      lastClickDown = false;
      hideCursor();
      return;
    }

    ensureCursor();
    clampPosition();
    startLoop();
  }

  function startLoop() {
    if (!enabled || frame || !navigator.getGamepads) return;
    frame = requestAnimationFrame(poll);
  }

  function stopLoop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
  }

  function poll(now) {
    frame = 0;
    if (!enabled) return;

    const pad = firstGamepad();
    if (!pad) {
      releasePress(false);
      lastClickDown = false;
      hideCursor();
      startLoop();
      return;
    }

    const dt = lastFrame ? Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)) : 1 / 60;
    lastFrame = now;

    const stick = stickVector(pad);
    const dpad = dpadVector(pad);
    const clickDown = padButton(pad, clickButton);
    const moving = Math.abs(stick.x) > 0 || Math.abs(stick.y) > 0 || dpad.x || dpad.y;

    if (moving || clickDown) showCursor();

    if (visible && moving) {
      x += stick.x * MAX_SPEED * dt + dpad.x * DPAD_SPEED * dt;
      y += stick.y * MAX_SPEED * dt + dpad.y * DPAD_SPEED * dt;
      clampPosition();
      paintCursor(clickDown);
      dispatchMove(clickDown);
      updateHover();
    } else if (visible) {
      paintCursor(clickDown);
      updateHover();
    }

    if (clickDown && !lastClickDown) press();
    if (!clickDown && lastClickDown) releasePress(true);
    lastClickDown = clickDown;

    startLoop();
  }

  function press() {
    showCursor();
    cursor?.classList.add('clicking');
    const target = targetAtCursor();
    if (!target || disabledByTarget(target)) return;

    downTarget = target;
    downPoint = { x, y };
    focusTarget(target);
    dispatchPointerLike(target, 'pointerdown', { button: 0, buttons: 1 });
    dispatchMouseLike(target, 'mousedown', { button: 0, buttons: 1 });
  }

  function releasePress(sendClick) {
    cursor?.classList.remove('clicking');

    const upTarget = targetAtCursor();
    if (upTarget && !disabledByTarget(upTarget)) {
      dispatchPointerLike(upTarget, 'pointerup', { button: 0, buttons: 0 });
      dispatchMouseLike(upTarget, 'mouseup', { button: 0, buttons: 0 });
    }

    if (sendClick && downTarget && upTarget && clickTargetMatches(downTarget, upTarget) && clickStayedPut()) {
      const clickTarget = interactiveFor(upTarget) ?? upTarget;
      if (!disabledByTarget(clickTarget)) {
        focusTarget(clickTarget);
        dispatchMouseLike(clickTarget, 'click', { button: 0, buttons: 0, detail: 1 });
      }
    }

    downTarget = null;
    downPoint = null;
  }

  function dispatchMove(clickDown) {
    const target = targetAtCursor();
    if (!target) return;
    dispatchPointerLike(target, 'pointermove', { button: -1, buttons: clickDown ? 1 : 0 });
    dispatchMouseLike(target, 'mousemove', { button: -1, buttons: clickDown ? 1 : 0 });
  }

  function updateHover() {
    const next = interactiveFor(targetAtCursor());
    if (next === hoverTarget) return;

    const previous = hoverTarget;
    clearHover(next);

    hoverTarget = next && !disabledByTarget(next) ? next : null;
    if (hoverTarget) {
      hoverTarget.classList.add('gamepad-hover');
      dispatchPointerLike(hoverTarget, 'pointerover', { relatedTarget: previous });
      dispatchMouseLike(hoverTarget, 'mouseover', { relatedTarget: previous });
    }
  }

  function clearHover(relatedTarget = null) {
    if (!hoverTarget) return;
    const previous = hoverTarget;
    hoverTarget = null;
    previous.classList.remove('gamepad-hover');
    dispatchPointerLike(previous, 'pointerout', { relatedTarget });
    dispatchMouseLike(previous, 'mouseout', { relatedTarget });
  }

  function targetAtCursor() {
    const target = document.elementFromPoint(x, y);
    return target ? (interactiveFor(target) ?? target) : null;
  }

  function interactiveFor(target) {
    if (!target?.closest) return null;
    return target.closest(INTERACTIVE_SELECTOR);
  }

  function clickTargetMatches(start, end) {
    const a = interactiveFor(start) ?? start;
    const b = interactiveFor(end) ?? end;
    return a === b || a.contains?.(b) || b.contains?.(a);
  }

  function clickStayedPut() {
    if (!downPoint) return true;
    return Math.hypot(x - downPoint.x, y - downPoint.y) <= CLICK_SLOP;
  }

  function disabledByTarget(target) {
    return !!target?.closest?.(DISABLED_SELECTOR);
  }

  function focusTarget(target) {
    const focusable = interactiveFor(target);
    if (!focusable?.focus || disabledByTarget(focusable)) return;
    try {
      focusable.focus({ preventScroll: true });
    } catch {
      focusable.focus();
    }
  }

  function ensureCursor() {
    if (cursor) return;
    cursor = document.createElement('div');
    cursor.className = 'gamepad-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursor);
    paintCursor(false);
  }

  function showCursor() {
    ensureCursor();
    if (visible) return;
    visible = true;
    cursor.classList.add('visible');
    paintCursor(lastClickDown);
    updateHover();
  }

  function hideCursor() {
    visible = false;
    if (cursor) {
      cursor.classList.remove('visible', 'clicking');
    }
    clearHover();
  }

  function paintCursor(clicking) {
    if (!cursor) return;
    cursor.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) scale(${clicking ? 0.9 : 1})`;
  }

  function clampPosition() {
    x = clamp(x, 0, Math.max(0, window.innerWidth - 1));
    y = clamp(y, 0, Math.max(0, window.innerHeight - 1));
  }

  function dispatchPointerLike(target, type, options = {}) {
    dispatchWithGuard(target, pointerEvent(type, options));
  }

  function dispatchMouseLike(target, type, options = {}) {
    dispatchWithGuard(target, mouseEvent(type, options));
  }

  function dispatchWithGuard(target, event) {
    if (!target || !event) return;
    syntheticEvent = true;
    try {
      target.dispatchEvent(event);
    } finally {
      syntheticEvent = false;
    }
  }

  function pointerEvent(type, options) {
    const init = eventInit(options);
    if (typeof PointerEvent === 'function') {
      return new PointerEvent(type, {
        ...init,
        pointerId: 41,
        pointerType: 'mouse',
        isPrimary: true,
        width: 1,
        height: 1,
        pressure: init.buttons ? 0.5 : 0,
      });
    }
    return mouseEvent(type.replace('pointer', 'mouse'), options);
  }

  function mouseEvent(type, options) {
    return new MouseEvent(type, eventInit(options));
  }

  function eventInit(options) {
    return {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: Math.round(x),
      clientY: Math.round(y),
      screenX: Math.round(window.screenX + x),
      screenY: Math.round(window.screenY + y),
      button: options.button ?? 0,
      buttons: options.buttons ?? 0,
      detail: options.detail ?? 0,
      relatedTarget: options.relatedTarget ?? null,
    };
  }

  function markRealPointerActivity(e) {
    if (syntheticEvent || !visible || e.pointerType === 'touch') return;
    releasePress(false);
    lastClickDown = false;
    hideCursor();
  }

  return { setEnabled };
}

function firstGamepad() {
  return [...(navigator.getGamepads?.() ?? [])].find((pad) => pad?.connected) ?? null;
}

function stickVector(gamepad) {
  const rawX = axis(gamepad, 0);
  const rawY = axis(gamepad, 1);
  const len = Math.hypot(rawX, rawY);
  if (len <= STICK_DEADZONE) return { x: 0, y: 0 };

  const normalized = Math.min(1, (len - STICK_DEADZONE) / (1 - STICK_DEADZONE));
  const curved = Math.pow(normalized, STICK_CURVE);
  return {
    x: (rawX / len) * curved,
    y: (rawY / len) * curved,
  };
}

function dpadVector(gamepad) {
  const x = (padButton(gamepad, 15) ? 1 : 0) - (padButton(gamepad, 14) ? 1 : 0);
  const y = (padButton(gamepad, 13) ? 1 : 0) - (padButton(gamepad, 12) ? 1 : 0);
  if (!x && !y) return { x: 0, y: 0 };
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function padButton(gamepad, index) {
  const btn = gamepad?.buttons?.[index];
  return !!btn && (btn.pressed || btn.value > BUTTON_DEADZONE);
}

function axis(gamepad, index) {
  const value = Number(gamepad?.axes?.[index]);
  return Number.isFinite(value) ? value : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
