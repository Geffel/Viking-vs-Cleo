import { GAMEPAD_BINDS } from '/shared/constants.js';
import { codeMap, onBindingsChange, padMap } from '/js/keybinds.js';

// Mellanslag = hopp, pilar = ga/droppa, Q/E = melee, 1/2/3/... = formagor -
// men bara som standard. Vilken tangent som gor vad kommer ur keybinds.js, sa
// att spelarens ombindningar pa kontrollsidan galler direkt.
// Rorelse skickas bara nar den andras; ovriga tangenter ar engangshandelser.

// Vanster och hoger blir ett rorelsemeddelande, resten en handelse.
const MOVE_SLOTS = new Set(['left', 'right']);

const KEYBOARD = 'keyboard';
const GAMEPAD = 'gamepad';
const STICK_DEADZONE = 0.35;
const DROP_DEADZONE = 0.62;
const BUTTON_DEADZONE = 0.5;

export function initInput(net, onAction) {
  const moveSources = {
    [KEYBOARD]: { left: false, right: false },
    [GAMEPAD]: { left: false, right: false },
  };
  const actionSources = new Map();
  let codes = codeMap();
  let pads = padMap();
  let active = false;
  let gamepadFrame = 0;

  // Binder man om en tangent mitt i allt slapper vi allt som halls nere - annars
  // skulle den gamla tangenten aldrig fa skicka sitt "slapp".
  onBindingsChange((next) => {
    releaseAll();
    codes = codeMap(next);
    pads = padMap(next);
  });

  function moveState() {
    return {
      left: Object.values(moveSources).some((state) => state.left),
      right: Object.values(moveSources).some((state) => state.right),
    };
  }

  function sendMove(state = moveState()) {
    net.send({ t: 'move', l: state.left, r: state.right });
  }

  function setDirection(source, dir, down) {
    const state = moveSources[source];
    if (!state || state[dir] === down) return;
    const before = moveState();
    state[dir] = down;
    const after = moveState();
    if (active && (before.left !== after.left || before.right !== after.right)) sendMove(after);
  }

  function pressAction(action, source) {
    if (!action) return;
    let sources = actionSources.get(action);
    if (!sources) {
      sources = new Set();
      actionSources.set(action, sources);
    }
    if (sources.has(source)) return;

    const firstPress = sources.size === 0;
    sources.add(source);
    if (!active || !firstPress) return;

    net.send({ t: 'act', a: action });
    onAction?.(action);
  }

  function releaseAction(action, source, send = active) {
    const sources = actionSources.get(action);
    if (!sources?.delete(source)) return;
    if (sources.size) return;

    actionSources.delete(action);
    if (send) net.send({ t: 'actup', a: action });
  }

  function syncAction(action, source, down) {
    if (down) pressAction(action, source);
    else releaseAction(action, source);
  }

  function releaseSource(source, send = active) {
    const before = moveState();
    for (const [action, sources] of [...actionSources]) {
      if (!sources.has(source)) continue;
      releaseAction(action, source, send);
    }

    const state = moveSources[source];
    if (!state) return;
    state.left = false;
    state.right = false;
    const after = moveState();
    if (send && (before.left !== after.left || before.right !== after.right)) sendMove(after);
  }

  function releaseAll(send = active) {
    if (send) {
      for (const action of actionSources.keys()) net.send({ t: 'actup', a: action });
    }
    actionSources.clear();

    const before = moveState();
    for (const state of Object.values(moveSources)) {
      state.left = false;
      state.right = false;
    }
    if (send && (before.left || before.right)) sendMove({ left: false, right: false });
  }

  window.addEventListener('keydown', (e) => {
    if (!active || e.ctrlKey || e.altKey || e.metaKey) return;

    const slot = codes[e.code];
    if (!slot) return;

    e.preventDefault();
    if (e.repeat) return;
    if (MOVE_SLOTS.has(slot)) setDirection(KEYBOARD, slot, true);
    else pressAction(slot, KEYBOARD);
  });

  window.addEventListener('keyup', (e) => {
    const slot = codes[e.code];
    if (!slot) return;

    e.preventDefault();
    if (MOVE_SLOTS.has(slot)) setDirection(KEYBOARD, slot, false);
    else releaseAction(slot, KEYBOARD);
  });

  // Tappar man fonstret ska man inte fastna i att springa.
  window.addEventListener('blur', () => {
    releaseAll();
    stopGamepadLoop();
  });
  window.addEventListener('focus', startGamepadLoop);

  window.addEventListener('gamepadconnected', startGamepadLoop);
  window.addEventListener('gamepaddisconnected', () => releaseSource(GAMEPAD));

  function startGamepadLoop() {
    if (!active || gamepadFrame || !navigator.getGamepads) return;
    gamepadFrame = requestAnimationFrame(pollGamepad);
  }

  function stopGamepadLoop() {
    if (gamepadFrame) cancelAnimationFrame(gamepadFrame);
    gamepadFrame = 0;
    releaseSource(GAMEPAD, false);
  }

  function pollGamepad() {
    gamepadFrame = 0;
    if (!active) return;

    const gamepad = firstGamepad();
    if (gamepad) syncGamepad(gamepad);
    else releaseSource(GAMEPAD);

    startGamepadLoop();
  }

  function syncGamepad(gamepad) {
    const x = axis(gamepad, 0);
    const left = x < -STICK_DEADZONE || button(gamepad, 14);
    const right = x > STICK_DEADZONE || button(gamepad, 15);

    setDirection(GAMEPAD, 'left', left);
    setDirection(GAMEPAD, 'right', right);

    // Spaken nedat droppar ocksa. Det hanger ihop med spaken och inte med
    // knappen, sa det galler aven om drop bundits om till en annan knapp.
    const stickDrop = axis(gamepad, GAMEPAD_BINDS.drop.axis) > DROP_DEADZONE;
    let dropHandled = false;

    for (const [index, slot] of Object.entries(pads)) {
      const down = button(gamepad, Number(index)) || (slot === 'drop' && stickDrop);
      syncAction(slot, GAMEPAD, down);
      dropHandled ||= slot === 'drop';
    }

    if (!dropHandled) syncAction('drop', GAMEPAD, stickDrop);
  }

  return {
    enable() {
      active = true;
      startGamepadLoop();
    },
    disable() {
      const wasActive = active;
      releaseAll(wasActive);
      active = false;
      stopGamepadLoop();
    },
  };
}

function firstGamepad() {
  return [...(navigator.getGamepads?.() ?? [])].find((pad) => pad?.connected) ?? null;
}

function button(gamepad, index) {
  const btn = gamepad?.buttons?.[index];
  return !!btn && (btn.pressed || btn.value > BUTTON_DEADZONE);
}

function axis(gamepad, index) {
  const value = Number(gamepad?.axes?.[index]);
  return Number.isFinite(value) ? value : 0;
}
