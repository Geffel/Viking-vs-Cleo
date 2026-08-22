// Kontrollpanelen: en rad per bindning, uppdelad i samma kategorier som HUD:en
// och info-fliken anvander - rorelse, narstrid, formagor. Panelen visar bara de
// bindningar spelet faktiskt har; texten byggs ur shared/constants.js sa att den
// aldrig kan sla isar fran vad som verkligen ar bundet.
//
// Varje rad har tva rutor: tangenten till vanster, handkontrollknappen till
// hoger. Klickar man en ruta lyssnar panelen efter nasta tangenttryck respektive
// nasta knapp pa kontrollen.
//
// Panelen bor inne i installningarna (settings.js) och har darfor ingen egen
// ram: skalet ager rubriken, spara-knappen och notisrutan. Andringarna ligger i
// ett utkast tills skalet ropar save(). Forst da skrivs de till keybinds.js, som
// i sin tur talar om for input-lagret, HUD:en och info-fliken att tangenterna
// bytt plats.

import { ABILITIES, KEYBIND_CATEGORIES, MELEE_ATTACKS, TEAMS } from '/shared/constants.js';
import {
  bindings,
  canBind,
  canBindPad,
  defaultBindings,
  defaultFor,
  keyLabel,
  padCap,
  padLabel,
  saveBindings,
  slotForCode,
  slotForPad,
} from '/js/keybinds.js';

const PAD_PRESS = 0.5;

// Rorelseraderna har ingen ikon i konstantfilen - de far en pil och en mening.
const MOVE_COPY = {
  left: { name: 'Move left', desc: 'Walk toward the left edge of the arena.', glyph: '←' },
  right: { name: 'Move right', desc: 'Walk toward the right edge of the arena.', glyph: '→' },
  jump: { name: 'Jump', desc: 'Leap up onto the platforms above you.', glyph: '↑' },
  drop: { name: 'Drop', desc: 'Fall down through the platform you are standing on.', glyph: '↓' },
};

// Melee och formagor delar tangent mellan lagen men heter olika saker, sa raden
// visar bada: "Cleo Punch - Viking Axe".
const SLOT_TITLES = { m1: 'Melee 1', m2: 'Melee 2', a1: 'Ability 1', a2: 'Ability 2', a3: 'Ability 3', a4: 'Ability 4' };

// Rorelsen sitter pa vanster spak och d-paden. Den ar en riktning och inte en
// knapp, sa de raderna har ingen ombindbar kontrollruta.
const FIXED_PAD = new Set(['left', 'right']);

export class ControlsUi {
  constructor({ onChange = () => {}, onNote = () => {} } = {}) {
    this.onChange = onChange;
    this.onNote = onNote;
    this.cat = KEYBIND_CATEGORIES[0].id;
    this.draft = bindings();
    this.listening = null;
    this.padFrame = 0;
    this.padIgnore = new Set();

    this.page = document.getElementById('controls-view');
    this.title = document.getElementById('controls-title');
    this.cats = document.getElementById('controls-cats');
    this.rows = document.getElementById('controls-rows');
    if (!this.page) return;

    this.cats?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-kb-cat]');
      if (!btn) return;
      this.cat = btn.dataset.kbCat;
      this.stopListening();
      this.render();
    });

    this.rows?.addEventListener('click', (e) => {
      const reset = e.target.closest('[data-kb-reset]');
      if (reset) {
        this.resetRow(reset.dataset.kbReset);
        return;
      }
      const slot = e.target.closest('[data-kb-slot]');
      if (slot) this.startListen(slot.dataset.kbSlot, slot.dataset.kbBox);
    });

    // Hogerklick tommer rutan - samma gest som i de flesta spel.
    this.rows?.addEventListener('contextmenu', (e) => {
      const slot = e.target.closest('[data-kb-slot]');
      if (!slot) return;
      e.preventDefault();
      this.clearSlot(slot.dataset.kbSlot, slot.dataset.kbBox);
    });

    // Ligger i capture-fasen sa att tangenten fangas innan nagon annan hinner
    // reagera pa den medan vi lyssnar efter en ny bindning.
    window.addEventListener('keydown', (e) => this.onKeyDown(e), true);

    this.render();
  }

  /** Oppnar panelen: utkastet borjar alltid fran det som faktiskt ar sparat. */
  open() {
    this.draft = bindings();
    this.stopListening();
    this.render();
  }

  /** Stanger panelen - slutar lyssna sa att en tangent inte fastnar i luften. */
  close() {
    this.stopListening();
    this.render();
  }

  onKeyDown(e) {
    if (!this.listening || this.page?.hidden) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.code === 'Escape') {
      this.stopListening();
      this.render();
      return;
    }
    // Vantar vi pa en kontrollknapp ar tangentbordet bara vagen ut.
    if (this.listening.box === 'pad') return;

    if (!canBind(e.code)) {
      this.showNote('That key is reserved');
      return;
    }
    this.assign(this.listening.slot, e.code);
  }

  startListen(slot, box) {
    const same = this.listening?.slot === slot && this.listening?.box === box;
    this.stopListening();
    if (same) {
      this.render();
      return;
    }

    if (box === 'pad' && !firstPad()) {
      this.showNote('No controller connected');
      this.render();
      return;
    }

    this.padIgnore = box === 'pad' ? pressedPadButtons(firstPad()) : new Set();
    this.listening = { slot, box };
    this.render();
    if (box === 'pad') this.pollPad();
  }

  // Handkontrollen skickar inga handelser nar en knapp trycks ned - man far
  // titta efter sjalv, en bildruta i taget.
  pollPad() {
    this.padFrame = requestAnimationFrame(() => {
      this.padFrame = 0;
      if (this.listening?.box !== 'pad' || this.page?.hidden) return;

      const pad = firstPad();
      const buttons = pressedPadButtons(pad);
      for (const ignored of [...this.padIgnore]) {
        if (!buttons.has(ignored)) this.padIgnore.delete(ignored);
      }

      const button = [...buttons].find((index) => !this.padIgnore.has(index)) ?? -1;
      if (button >= 0) {
        this.assignPad(this.listening.slot, button);
        return;
      }
      this.pollPad();
    });
  }

  stopListening() {
    this.listening = null;
    this.padIgnore.clear();
    if (this.padFrame) cancelAnimationFrame(this.padFrame);
    this.padFrame = 0;
  }

  assign(slot, code) {
    const draft = clone(this.draft);
    const previous = draft[slot].primary;
    const taken = slotForCode(code, draft);

    // Sitter tangenten redan nagon annanstans byter de tva raderna, sa att man
    // aldrig kan hamna med tva handlingar pa samma tangent.
    if (taken && taken.slot !== slot) {
      draft[taken.slot].primary = previous;
      this.showNote(`Swapped with ${rowTitle(taken.slot)}`);
    }

    draft[slot].primary = code;
    this.commit(draft);
  }

  assignPad(slot, button) {
    if (!canBindPad(button)) {
      this.showNote('That button cannot be bound');
      return;
    }

    const draft = clone(this.draft);
    const previous = draft[slot].pad;
    const taken = slotForPad(button, draft);

    if (taken && taken.slot !== slot) {
      draft[taken.slot].pad = previous;
      this.showNote(`Swapped with ${rowTitle(taken.slot)}`);
    }

    draft[slot].pad = button;
    this.commit(draft);
  }

  clearSlot(slot, box) {
    const draft = clone(this.draft);
    draft[slot][box === 'pad' ? 'pad' : 'primary'] = null;
    this.commit(draft);
  }

  resetRow(slot) {
    const draft = clone(this.draft);
    const fallback = defaultFor(slot);

    // Standardbindningen kan ha vandrat till en annan rad. Da tar vi tillbaka
    // den och lamnar den andra raden tom i stallet for att dubbelboka den.
    const takenKey = slotForCode(fallback.primary, draft);
    if (takenKey && takenKey.slot !== slot) draft[takenKey.slot].primary = null;
    const takenPad = slotForPad(fallback.pad, draft);
    if (takenPad && takenPad.slot !== slot) draft[takenPad.slot].pad = null;

    draft[slot] = fallback;
    this.commit(draft);
  }

  resetAll() {
    this.commit(defaultBindings());
    this.showNote('All controls restored to defaults');
  }

  /** Skriver utkastet till keybinds.js. Skalets spara-knapp ager den har. */
  save() {
    if (!this.isDirty()) return false;
    this.draft = saveBindings(this.draft);
    this.render();
    return true;
  }

  commit(draft) {
    this.draft = draft;
    this.stopListening();
    this.render();
  }

  isDirty() {
    return JSON.stringify(this.draft) !== JSON.stringify(bindings());
  }

  render() {
    if (!this.page) return;
    const category = KEYBIND_CATEGORIES.find((c) => c.id === this.cat) ?? KEYBIND_CATEGORIES[0];

    if (this.title) this.title.textContent = category.name;
    this.renderCats();
    this.renderRows(category);
    this.onChange();
  }

  renderCats() {
    if (!this.cats) return;
    this.cats.innerHTML = KEYBIND_CATEGORIES.map(
      (cat) => `
        <button class="kb-cat ${cat.id === this.cat ? 'on' : ''}" type="button" data-kb-cat="${escapeAttr(cat.id)}"
          style="--kb-tone:${escapeAttr(cat.color)}">
          <i></i><span>${escapeHtml(cat.name)}</span><b>${cat.binds.length}</b>
        </button>`,
    ).join('');
  }

  renderRows(category) {
    if (!this.rows) return;
    this.rows.innerHTML = category.binds
      .map((bind, index) => this.rowMarkup(bind.slot, category.color, index))
      .join('');
  }

  rowMarkup(slot, tone, index) {
    return `
      <div class="kb-row" style="--kb-tone:${escapeAttr(tone)};--kb-delay:${(index * 0.04).toFixed(2)}s">
        <span class="kb-icon">${iconMarkup(slot)}</span>
        <div class="kb-copy">
          <b>${escapeHtml(rowTitle(slot))}</b>
          <span>${rowDesc(slot)}</span>
        </div>
        ${this.keySlotMarkup(slot)}
        ${this.padSlotMarkup(slot)}
        <button class="kb-row-reset" type="button" title="Reset to default" data-kb-reset="${escapeAttr(slot)}">↺</button>
      </div>`;
  }

  keySlotMarkup(slot) {
    const listening = this.isListening(slot, 'primary');
    const code = this.draft[slot]?.primary ?? null;
    const label = listening ? 'Press a key…' : (keyLabel(code) ?? '—');
    return `
      <button class="${slotClasses(listening, !code)}" type="button"
        data-kb-slot="${escapeAttr(slot)}" data-kb-box="primary">${escapeHtml(label)}</button>`;
  }

  padSlotMarkup(slot) {
    // Rorelsen ar spaken - den star som en etikett, inte som en knapp.
    if (FIXED_PAD.has(slot)) return `<span class="kb-slot kb-fixed">${escapeHtml(padLabel(slot, this.draft))}</span>`;

    const listening = this.isListening(slot, 'pad');
    const bound = Number.isInteger(this.draft[slot]?.pad);
    const label = listening ? 'Press a button…' : bound ? padCap(slot, this.draft) : '+ Add';
    const title = bound ? padLabel(slot, this.draft) : 'Bind a controller button';
    return `
      <button class="${slotClasses(listening, !bound)}" type="button" title="${escapeAttr(title)}"
        data-kb-slot="${escapeAttr(slot)}" data-kb-box="pad">${escapeHtml(label)}</button>`;
  }

  isListening(slot, box) {
    return this.listening?.slot === slot && this.listening?.box === box;
  }

  showNote(text) {
    this.onNote(text, '⇄');
  }
}

function slotClasses(listening, empty) {
  return ['kb-slot', listening ? 'listening' : '', empty && !listening ? 'empty' : ''].filter(Boolean).join(' ');
}

function firstPad() {
  return [...(navigator.getGamepads?.() ?? [])].find((pad) => pad?.connected) ?? null;
}

function pressedPadButtons(gamepad) {
  const buttons = new Set();
  for (let i = 0; i < (gamepad?.buttons?.length ?? 0); i++) {
    const btn = gamepad.buttons[i];
    if (btn?.pressed || btn?.value > PAD_PRESS) buttons.add(i);
  }
  return buttons;
}

function rowTitle(slot) {
  return MOVE_COPY[slot]?.name ?? SLOT_TITLES[slot] ?? slot;
}

// Rorelsen beskriver sig sjalv, melee och formagor lanar lagens egna namn.
function rowDesc(slot) {
  const move = MOVE_COPY[slot];
  if (move) return escapeHtml(move.desc);

  return ['cleo', 'viking']
    .map((team) => {
      const info = infoFor(team, slot);
      if (!info) return '';
      return `<b class="kb-team ${team}">${escapeHtml(TEAMS[team].name)}</b> ${escapeHtml(info.name)}`;
    })
    .filter(Boolean)
    .join('<em>·</em>');
}

function iconMarkup(slot) {
  const move = MOVE_COPY[slot];
  if (move) return `<span class="kb-glyph">${move.glyph}</span>`;

  return ['cleo', 'viking']
    .map((team) => {
      const info = infoFor(team, slot);
      if (!info) return '';
      const art = info.iconImage
        ? `<img src="${escapeAttr(info.iconImage)}" alt="" />`
        : escapeHtml(info.icon ?? '');
      return `<i class="kb-icon-${team}" title="${escapeAttr(`${TEAMS[team].name}: ${info.name}`)}">${art}</i>`;
    })
    .join('');
}

function infoFor(team, slot) {
  return MELEE_ATTACKS[team]?.[slot] ?? ABILITIES[team]?.[slot] ?? null;
}

function clone(source) {
  const copy = {};
  for (const slot of Object.keys(source)) copy[slot] = { ...source[slot] };
  return copy;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(text) {
  return escapeHtml(text).replaceAll('`', '&#96;');
}
