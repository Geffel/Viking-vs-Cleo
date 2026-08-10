import { ABILITY_BINDS, MELEE_BINDS } from '/shared/constants.js';

// Mellanslag = hopp, pilar = ga/droppa, Q/E = melee, 1/2/3/... = formagor.
// Rorelse skickas bara nar den andras; ovriga tangenter ar engangshandelser.

const MOVE = { ArrowLeft: 'left', ArrowRight: 'right' };
const ACTIONS = {
  Space: 'jump',
  ArrowDown: 'drop',
  ...Object.fromEntries(MELEE_BINDS.map((bind) => [bind.code, bind.slot])),
  ...Object.fromEntries(ABILITY_BINDS.map((bind) => [bind.code, bind.slot])),
};

export function initInput(net, onAction) {
  const held = { left: false, right: false };
  const heldActions = new Set();
  let active = false;

  function sendMove() {
    net.send({ t: 'move', l: held.left, r: held.right });
  }

  function release() {
    if (heldActions.size) {
      if (active) {
        for (const action of heldActions) net.send({ t: 'actup', a: action });
      }
      heldActions.clear();
    }
    if (!held.left && !held.right) return;
    held.left = false;
    held.right = false;
    if (active) sendMove();
  }

  window.addEventListener('keydown', (e) => {
    if (!active || e.ctrlKey || e.altKey || e.metaKey) return;

    const dir = MOVE[e.code];
    if (dir) {
      e.preventDefault();
      if (e.repeat || held[dir]) return;
      held[dir] = true;
      sendMove();
      return;
    }

    const action = ACTIONS[e.code];
    if (action) {
      e.preventDefault();
      if (e.repeat) return;
      heldActions.add(action);
      net.send({ t: 'act', a: action });
      onAction?.(action);
    }
  });

  window.addEventListener('keyup', (e) => {
    const dir = MOVE[e.code];
    if (dir) {
      e.preventDefault();
      if (!held[dir]) return;
      held[dir] = false;
      if (active) sendMove();
      return;
    }

    const action = ACTIONS[e.code];
    if (!action) return;
    e.preventDefault();
    if (!heldActions.delete(action)) return;
    if (active) net.send({ t: 'actup', a: action });
  });

  // Tappar man fonstret ska man inte fastna i att springa.
  window.addEventListener('blur', release);

  return {
    enable() {
      active = true;
    },
    disable() {
      active = false;
      release();
    },
  };
}
