// Spelarens bindningar. Standarden kommer ur shared/constants.js, andringarna
// sparas i localStorage. Input-lagret, HUD:en, info-fliken och kontrollsidan
// laser harifran - binder man om en tangent slar den igenom overallt pa en gang
// i stallet for att stanna kvar som gammal text i en ruta.
//
// Varje plats har tva rutor: primary ar tangenten pa tangentbordet, pad ar
// knappen pa handkontrollen (dess index i Gamepad API:t, se PAD_BUTTONS).

import { ABILITY_BINDS, BIND_SLOTS, GAMEPAD_BINDS, MELEE_BINDS, MOVE_BINDS, PAD_BUTTONS } from '/shared/constants.js';

const STORAGE_KEY = 'vvc.keybinds';

const ALL_BINDS = [...MOVE_BINDS, ...MELEE_BINDS, ...ABILITY_BINDS];
const BIND_BY_SLOT = new Map(ALL_BINDS.map((bind) => [bind.slot, bind]));

// KeyboardEvent.code ar alltid bokstaver och siffror. Allt annat i sparfilen ar
// inte skrivet av oss och slangs nar den lases.
const CODE_RE = /^[A-Za-z0-9]{1,24}$/;

// Modifierare gar inte att binda: input-lagret slapper igenom Ctrl/Alt/Meta till
// webblasaren, sa en bindning pa dem skulle anda aldrig ga igang.
const BLOCKED_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'ContextMenu',
  'Escape',
]);

// D-padens vanster och hoger ar rorelse (se input.js) och kan darfor inte
// bindas till nagot annat.
const BLOCKED_PADS = new Set([14, 15]);

// Tangenter som inte heter samma sak som de star pa.
const KEY_LABELS = {
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  Backspace: '⌫',
  CapsLock: 'Caps',
  ShiftLeft: 'L-Shift',
  ShiftRight: 'R-Shift',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  IntlBackslash: '<',
};

const listeners = new Set();
let current = load();

/** Standardbindningarna: primartangent och handkontrollknapp per plats. */
export function defaultBindings() {
  const bindings = {};
  for (const bind of ALL_BINDS) bindings[bind.slot] = defaultFor(bind.slot);
  return bindings;
}

/** Standardbindningen for en enda plats - kontrollsidans "aterstall raden". */
export function defaultFor(slot) {
  return {
    primary: BIND_BY_SLOT.get(slot)?.code ?? null,
    pad: GAMEPAD_BINDS[slot]?.button ?? null,
  };
}

/** En kopia av de sparade bindningarna - ingen kan andra dem bakvagen. */
export function bindings() {
  return clone(current);
}

/** Sparar och skickar ut de nya bindningarna till alla som lyssnar. */
export function saveBindings(next) {
  current = sanitize(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Privat lage e.d. - bindningarna galler anda sa lange fliken ar oppen.
  }
  for (const listener of listeners) listener(clone(current));
  return clone(current);
}

/** Anropas varje gang bindningarna sparas. Returnerar en avregistrering. */
export function onBindingsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tangentkod -> plats, sa att input-lagret kan sla upp ett tryck direkt. */
export function codeMap(source = current) {
  const map = {};
  for (const slot of Object.keys(source)) {
    const code = source[slot].primary;
    if (code) map[code] = slot;
  }
  return map;
}

/** Vilken plats en tangent redan sitter pa, om nagon. */
export function slotForCode(code, source = current) {
  for (const slot of Object.keys(source)) {
    if (source[slot].primary === code) return { slot, box: 'primary' };
  }
  return null;
}

/** Handkontrollknapp -> plats, for input-lagrets pollning. */
export function padMap(source = current) {
  const map = {};
  for (const slot of Object.keys(source)) {
    const button = source[slot].pad;
    if (Number.isInteger(button)) map[button] = slot;
  }
  return map;
}

/** Vilken plats en handkontrollknapp redan sitter pa, om nagon. */
export function slotForPad(button, source = current) {
  for (const slot of Object.keys(source)) {
    if (source[slot].pad === button) return { slot, box: 'pad' };
  }
  return null;
}

/** Tangenten som star pa rutan i HUD:en. */
export function keycapFor(slot, source = current) {
  return keyLabel(source[slot]?.primary) ?? '-';
}

/** Kort namn pa handkontrollknappen: "X". Tom strang om platsen saknar knapp. */
export function padCap(slot, source = current) {
  return PAD_BUTTONS[source[slot]?.pad]?.short ?? '';
}

/** Hela namnet pa knappen: "X / Square". Rorelsen sitter pa spaken. */
export function padLabel(slot, source = current) {
  if (slot === 'left' || slot === 'right') return GAMEPAD_BINDS.move.label;
  return PAD_BUTTONS[source[slot]?.pad]?.label ?? '';
}

/** Tangent och handkontrollknapp ihop, som pa HUD-rutorna: "Q/X". */
export function inputCap(slot, source = current) {
  const pad = padCap(slot, source);
  const cap = keycapFor(slot, source);
  return pad ? `${cap}/${pad}` : cap;
}

/**
 * Gar knappen att binda? Bara knappar vi har ett namn pa, och inte d-padens
 * vanster/hoger - de gar redan till rorelsen, sa en bindning dar skulle gora
 * tva saker pa en gang.
 */
export function canBindPad(button) {
  return Number.isInteger(button) && button >= 0 && button < PAD_BUTTONS.length && !BLOCKED_PADS.has(button);
}

/** Kort etikett for en tangentkod: KeyQ -> Q, Digit1 -> 1, ArrowLeft -> vanster pil. */
export function keyLabel(code) {
  if (!code) return null;
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** Gar tangenten att binda alls? Modifierare och Esc ar reserverade. */
export function canBind(code) {
  return CODE_RE.test(String(code ?? '')) && !BLOCKED_CODES.has(code);
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return saved ? sanitize(saved) : defaultBindings();
  } catch {
    return defaultBindings();
  }
}

// Sparfilen ar bara text i webblasaren och kan innehalla vad som helst: platser
// vi inte kanner igen, skrap i stallet for tangentkoder, samma tangent pa tva
// stallen. Allt sadant plockas bort har, sa att resten av spelet kan lita pa
// formen.
function sanitize(raw) {
  const clean = {};
  const taken = new Set();
  const takenPads = new Set();

  for (const slot of BIND_SLOTS) {
    const saved = raw?.[slot] ?? {};
    const entry = { primary: null, pad: null };

    const code = saved.primary;
    if (canBind(code) && !taken.has(code)) {
      entry.primary = code;
      taken.add(code);
    }

    // Rorelsen sitter pa spaken och d-paden - den har ingen egen knapp.
    const pad = saved.pad;
    if (slot !== 'left' && slot !== 'right' && canBindPad(pad) && !takenPads.has(pad)) {
      entry.pad = pad;
      takenPads.add(pad);
    }

    clean[slot] = entry;
  }

  return clean;
}

function clone(source) {
  const copy = {};
  for (const slot of Object.keys(source)) copy[slot] = { ...source[slot] };
  return copy;
}
