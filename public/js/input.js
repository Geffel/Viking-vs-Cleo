import { GAMEPAD_BINDS, LOCAL_SEAT_IDS, MATCH_MODES } from '/shared/constants.js';
import { codeMap, onBindingsChange, padMap } from '/js/keybinds.js';

// Keyboard and the first gamepad are merged in normal online mode. In shared
// screen mode keyboard stays P1, and every assigned gamepad drives its own seat.
const MOVE_SLOTS = new Set(['left', 'right']);
const HOST_SEAT_ID = LOCAL_SEAT_IDS[0] ?? 'P1';

const KEYBOARD = 'keyboard';
const LEGACY_GAMEPAD = 'gamepad';
const STICK_DEADZONE = 0.35;
const DROP_DEADZONE = 0.62;
const BUTTON_DEADZONE = 0.5;

export function initInput(net, onAction) {
  const legacyState = createControlState();
  const seatStates = new Map();
  let codes = codeMap();
  let pads = padMap();
  let active = false;
  let gamepadFrame = 0;

  // Rebinding while a key is held would otherwise leave the old key stuck.
  onBindingsChange((next) => {
    releaseAll();
    codes = codeMap(next);
    pads = padMap(next);
  });

  function stateForSeat(seatId) {
    const id = cleanSeatId(seatId) || HOST_SEAT_ID;
    let state = seatStates.get(id);
    if (!state) {
      state = createControlState(id);
      seatStates.set(id, state);
    }
    return state;
  }

  function sendForState(state, obj) {
    net.send(state.seatId ? { ...obj, seatId: state.seatId } : obj);
  }

  function moveState(state) {
    const out = { left: false, right: false };
    for (const source of state.moveSources.values()) {
      out.left ||= source.left;
      out.right ||= source.right;
    }
    return out;
  }

  function sourceMove(state, source) {
    let move = state.moveSources.get(source);
    if (!move) {
      move = { left: false, right: false };
      state.moveSources.set(source, move);
    }
    return move;
  }

  function sendMove(state, move = moveState(state)) {
    sendForState(state, { t: 'move', l: move.left, r: move.right });
  }

  function setDirection(state, source, dir, down) {
    const move = sourceMove(state, source);
    if (move[dir] === down) return;
    const before = moveState(state);
    move[dir] = down;
    const after = moveState(state);
    if (active && (before.left !== after.left || before.right !== after.right)) sendMove(state, after);
  }

  function pressAction(state, action, source) {
    if (!action) return;
    let sources = state.actionSources.get(action);
    if (!sources) {
      sources = new Set();
      state.actionSources.set(action, sources);
    }
    if (sources.has(source)) return;

    const firstPress = sources.size === 0;
    sources.add(source);
    if (!active || !firstPress) return;

    sendForState(state, { t: 'act', a: action });
    onAction?.(action, state.seatId || null);
  }

  function releaseAction(state, action, source, send = active) {
    const sources = state.actionSources.get(action);
    if (!sources?.delete(source)) return;
    if (sources.size) return;

    state.actionSources.delete(action);
    if (send) sendForState(state, { t: 'actup', a: action });
  }

  function syncAction(state, action, source, down) {
    if (down) pressAction(state, action, source);
    else releaseAction(state, action, source);
  }

  function releaseSource(state, source, send = active) {
    const before = moveState(state);
    for (const [action, sources] of [...state.actionSources]) {
      if (!sources.has(source)) continue;
      releaseAction(state, action, source, send);
    }

    const move = state.moveSources.get(source);
    if (!move) return;
    move.left = false;
    move.right = false;
    const after = moveState(state);
    if (send && (before.left !== after.left || before.right !== after.right)) sendMove(state, after);
  }

  function releaseState(state, send = active) {
    if (send) {
      for (const action of state.actionSources.keys()) sendForState(state, { t: 'actup', a: action });
    }
    state.actionSources.clear();

    const before = moveState(state);
    state.moveSources.clear();
    if (send && (before.left || before.right)) sendMove(state, { left: false, right: false });
  }

  function releaseAll(send = active) {
    releaseState(legacyState, send);
    for (const state of seatStates.values()) releaseState(state, send);
  }

  function syncSlotDown(slot, source, down) {
    const state = isSharedScreenMatch() ? stateForSeat(HOST_SEAT_ID) : legacyState;
    if (MOVE_SLOTS.has(slot)) setDirection(state, source, slot, down);
    else if (down) pressAction(state, slot, source);
    else releaseAction(state, slot, source);
  }

  window.addEventListener('keydown', (e) => {
    if (!active || e.ctrlKey || e.altKey || e.metaKey) return;

    const slot = codes[e.code];
    if (!slot) return;

    e.preventDefault();
    if (e.repeat) return;
    syncSlotDown(slot, KEYBOARD, true);
  });

  window.addEventListener('keyup', (e) => {
    const slot = codes[e.code];
    if (!slot) return;

    e.preventDefault();
    syncSlotDown(slot, KEYBOARD, false);
  });

  window.addEventListener('blur', () => {
    releaseAll();
    stopGamepadLoop();
  });
  window.addEventListener('focus', startGamepadLoop);

  window.addEventListener('gamepadconnected', startGamepadLoop);
  window.addEventListener('gamepaddisconnected', () => {
    releaseSource(legacyState, LEGACY_GAMEPAD);
    releaseSharedGamepads();
  });

  function startGamepadLoop() {
    if (!active || gamepadFrame || !navigator.getGamepads) return;
    gamepadFrame = requestAnimationFrame(pollGamepads);
  }

  function stopGamepadLoop() {
    if (gamepadFrame) cancelAnimationFrame(gamepadFrame);
    gamepadFrame = 0;
    releaseSource(legacyState, LEGACY_GAMEPAD, false);
    releaseSharedGamepads(false);
  }

  function pollGamepads() {
    gamepadFrame = 0;
    if (!active) return;

    if (isSharedScreenMatch()) syncSharedGamepads();
    else syncLegacyGamepad();

    startGamepadLoop();
  }

  function syncLegacyGamepad() {
    const gamepad = firstGamepad();
    if (gamepad) syncGamepadToState(legacyState, LEGACY_GAMEPAD, gamepad);
    else releaseSource(legacyState, LEGACY_GAMEPAD);
  }

  function syncSharedGamepads() {
    const activeSeatIds = new Set([HOST_SEAT_ID]);
    const usedGamepads = new Set();
    const padsByIndex = new Map(
      [...(navigator.getGamepads?.() ?? [])]
        .filter((pad) => pad?.connected)
        .map((pad, fallbackIndex) => [Number.isInteger(pad.index) ? pad.index : fallbackIndex, pad]),
    );

    for (const seat of sharedSeats()) {
      const seatId = cleanSeatId(seat.id);
      if (!seatId || !net.localPlayerForSeat(seatId)) continue;
      activeSeatIds.add(seatId);
      if (seat.inputDevice?.type !== 'gamepad') continue;

      const index = Number(seat.inputDevice.index) || 0;
      const source = gamepadSource(index);
      const state = stateForSeat(seatId);
      const gamepad = usedGamepads.has(index) ? null : padsByIndex.get(index);
      if (gamepad) {
        usedGamepads.add(index);
        syncGamepadToState(state, source, gamepad);
      } else {
        releaseSource(state, source);
      }
    }

    for (const [seatId, state] of [...seatStates]) {
      if (activeSeatIds.has(seatId)) continue;
      releaseState(state);
      seatStates.delete(seatId);
    }
  }

  function releaseSharedGamepads(send = active) {
    for (const state of seatStates.values()) {
      for (const source of [...state.moveSources.keys()]) {
        if (source.startsWith('gamepad:')) releaseSource(state, source, send);
      }
    }
  }

  function syncGamepadToState(state, source, gamepad) {
    const x = axis(gamepad, 0);
    const left = x < -STICK_DEADZONE || button(gamepad, 14);
    const right = x > STICK_DEADZONE || button(gamepad, 15);

    setDirection(state, source, 'left', left);
    setDirection(state, source, 'right', right);

    const stickDrop = axis(gamepad, GAMEPAD_BINDS.drop.axis) > DROP_DEADZONE;
    let dropHandled = false;

    for (const [index, slot] of Object.entries(pads)) {
      const down = button(gamepad, Number(index)) || (slot === 'drop' && stickDrop);
      syncAction(state, slot, source, down);
      dropHandled ||= slot === 'drop';
    }

    if (!dropHandled) syncAction(state, 'drop', source, stickDrop);
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

  function isSharedScreenMatch() {
    const match = net.match;
    return !!match?.sharedScreen || match?.mode === MATCH_MODES.sharedScreen;
  }

  function sharedSeats() {
    return net.match?.localSeats ?? net.match?.seats ?? [];
  }
}

function createControlState(seatId = '') {
  return {
    seatId,
    moveSources: new Map(),
    actionSources: new Map(),
  };
}

function firstGamepad() {
  return [...(navigator.getGamepads?.() ?? [])].find((pad) => pad?.connected) ?? null;
}

function gamepadSource(index) {
  return `gamepad:${Number(index) || 0}`;
}

function cleanSeatId(seatId) {
  const id = String(seatId ?? '').trim().toUpperCase();
  return LOCAL_SEAT_IDS.includes(id) ? id : '';
}

function button(gamepad, index) {
  const btn = gamepad?.buttons?.[index];
  return !!btn && (btn.pressed || btn.value > BUTTON_DEADZONE);
}

function axis(gamepad, index) {
  const value = Number(gamepad?.axes?.[index]);
  return Number.isFinite(value) ? value : 0;
}
