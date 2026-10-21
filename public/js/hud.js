import { ABILITIES, ABILITY_BINDS, COMBO, MELEE_ATTACKS, MELEE_BINDS, TEAMS } from '/shared/constants.js';
import { inputCap, keycapFor, onBindingsChange, padCap } from '/js/keybinds.js';
import { abilityForPosition, moveAbility, onAbilityOrderChange, positionForAbility } from '/js/ability-layout.js';

// Tva melee-rutor foljs av abilities. Har ett lag ingen formaga i en ruta doljs
// rutan helt.
const SLOT_KEYS = [...MELEE_BINDS.map((bind) => bind.slot), ...ABILITY_BINDS.map((bind) => bind.slot)];
const MELEE_SLOT_SET = new Set(MELEE_BINDS.map((bind) => bind.slot));

// Tva formagor visar mer an en nedrakning i rutan. Vilken tangent de sitter pa
// varierar mellan lagen, sa rutorna kanns igen pa formagans id - inte pa key.
const SHIELD = 'powerShield'; // raknar kvarvarande skoldar i stallet for sekunder
const BERSERK = 'mushrooms'; // rutan glover sa lange raseriet varar
const HOLD_TO_EDIT_MS = 2000;
const HOLD_MOVE_TOLERANCE = 10;

const KILL_ICON_IMAGES = {
  sandBlast: '/assets/cleo/sand_blast1.png',
  powerShield: '/assets/cleo_shield_icon.png',
  sunFire: '/assets/cleo/sun_fire_ball.png',
  chargedUppercut: '/assets/cleo/punch2.png',
  axeThrow: '/assets/viking/axe_throw.png',
  shieldCharge: '/assets/viking/shield_charge.png',
  lasso: '/assets/viking_harpoon_projectile.png',
  harpoon: '/assets/viking_harpoon_projectile.png',
  mushrooms: '/assets/mushroom.png',
  iceSpikes: '/assets/viking/ice_spikes/ice_spike_8.png',
};

const MELEE_KILL_ICON_IMAGES = {
  'cleo:m1': '/assets/cleo/punch1.png',
  'cleo:m2': '/assets/cleo/kick1.png',
  'viking:m1': '/assets/viking/attack1.png',
  'viking:m2': '/assets/viking_shield_icon.png',
};

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.stage = document.getElementById('stage');
    this.tooltip = document.getElementById('ability-tooltip');
    this.slots = {};
    // Traningslaget kapar langa cooldowns pa servern. Ringen maste rakna mot
    // samma tak, annars visar den fel fyllnad. 0 = inget tak.
    this.cooldownCap = 0;
    this.team = '';
    this.editingAbilities = false;
    this.pointer = null;
    this.root.innerHTML = `
      <div class="shared-hud" hidden></div>
      <div class="personal-hud">
        <div class="hud-col">
          <div class="combo-track" hidden></div>
          <div class="hud-group hud-melee">${MELEE_BINDS.map((bind) => slotMarkup(bind.slot)).join('')}</div>
        </div>
        <div class="ability-editor">
          <div class="hud-group hud-abilities">${ABILITY_BINDS.map((bind) => `<div class="ability-socket" data-position="${bind.slot}">${slotMarkup(bind.slot)}</div>`).join('')}</div>
          <div class="ability-edit-label">Drag abilities to rearrange</div>
          <button class="ability-edit-done" type="button" hidden>Done</button>
        </div>
      </div>
    `;
    this.shared = this.root.querySelector('.shared-hud');
    this.personal = this.root.querySelector('.personal-hud');
    this.abilityBar = this.root.querySelector('.hud-abilities');
    this.doneButton = this.root.querySelector('.ability-edit-done');

    // Combo-sparet visas bara medan en kedja pagar. Markupen byggs om forst nar
    // det ar en ny combo pa gang, resten ar bara klasser som slas av och pa.
    this.combo = {
      el: this.root.querySelector('.combo-track'),
      index: -1,
      steps: -1,
      pips: [],
      bar: null,
    };
    for (const key of SLOT_KEYS) {
      const el = this.root.querySelector(`.ability[data-slot="${key}"]`);
      this.slots[key] = {
        el,
        icon: el.querySelector('.icon'),
        key: el.querySelector('.key'),
        sweep: el.querySelector('.sweep'),
        timer: el.querySelector('.timer'),
        total: 1000,
        left: 0,
        charges: 0,
        active: false, // formagan ar igang just nu (t.ex. raseriet)
        has: false, // laget har formagan alls
        id: '', // formagans id ur ABILITIES, t.ex. 'mushrooms'
        name: '',
        desc: '',
      };
      el.addEventListener('pointerenter', (e) => this.showTooltip(key, e));
      el.addEventListener('pointermove', (e) => this.moveTooltip(e));
      el.addEventListener('pointerleave', () => this.hideTooltip());
      el.addEventListener('pointercancel', () => this.hideTooltip());
    }

    this.abilityBar.addEventListener('pointerdown', (e) => this.onAbilityPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onAbilityPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onAbilityPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onAbilityPointerCancel(e));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.editingAbilities) this.exitAbilityEditMode();
    });
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (this.editingAbilities && !this.root.contains(e.target)) this.exitAbilityEditMode();
      },
      true,
    );
    this.doneButton.addEventListener('click', () => this.exitAbilityEditMode());

    this.score = {
      cleo: document.getElementById('score-cleo'),
      viking: document.getElementById('score-viking'),
    };
    this.feed = document.getElementById('killfeed');
    this.respawn = document.getElementById('respawn');
    this.respawnTimer = document.getElementById('respawn-timer');

    this.showKeycaps();
    onBindingsChange(() => this.showKeycaps());
    onAbilityOrderChange((team) => {
      if (team === this.team) this.applyAbilityOrder();
    });
  }

  /** Skriver om tangenten i varje ruta - kors om nar spelaren binder om. */
  showKeycaps() {
    for (const key of SLOT_KEYS) {
      const slot = this.slots[key];
      const boundPosition = MELEE_SLOT_SET.has(key) ? key : positionForAbility(this.team, key);
      if (slot?.key) slot.key.textContent = inputCap(boundPosition);
    }
    // Combo-sparet ritas om vid nasta kedja, sa pipsen far de nya tangenterna.
    this.combo.index = -1;
  }

  setTeam(team) {
    this.exitAbilityEditMode();
    this.team = team;
    this.setSharedMode(false);
    const abilities = ABILITIES[team];
    const melee = MELEE_ATTACKS[team];
    for (const key of SLOT_KEYS) {
      const slot = this.slots[key];
      const info = melee[key] ?? abilities[key];
      slot.has = !!info;
      slot.el.hidden = !info;
      slot.left = 0;
      slot.charges = 0;
      slot.active = false;
      slot.el.classList.remove('raging');
      if (!info) {
        slot.id = '';
        slot.name = '';
        slot.desc = '';
        continue;
      }

      slot.id = info.id ?? key;
      slot.total = this.cappedCooldown(key, info.cooldown);
      slot.name = info.name;
      slot.desc = info.desc;
      // Formagor med egen bild far den som ikon, ovriga sin emoji.
      slot.icon.textContent = info.iconImage ? '' : info.icon;
      slot.icon.style.backgroundImage = info.iconImage ? `url("${info.iconImage}")` : '';
      slot.icon.classList.toggle('img', !!info.iconImage);
      slot.el.style.setProperty('--team-color', TEAMS[team].color);
      slot.el.removeAttribute('title');
      slot.el.setAttribute('aria-label', `${info.name} - ${info.desc}`);
    }
    this.combo.el.style.setProperty('--team-color', TEAMS[team].color);
    this.applyAbilityOrder();
    this.showCombo(-1, 0, 0);
    this.root.hidden = false;
  }

  /** Satt cooldown-taket och rakna om rutornas nedrakningstider. */
  setCooldownCap(ms) {
    const next = Math.max(0, Number(ms) || 0);
    if (next === this.cooldownCap) return;
    this.cooldownCap = next;
    if (this.team) this.setTeam(this.team);
  }

  /** Melee ar orort - taket galler bara formagorna. */
  cappedCooldown(key, cooldown) {
    if (!this.cooldownCap || MELEE_SLOT_SET.has(key)) return cooldown;
    return Math.min(cooldown, this.cooldownCap);
  }

  setSharedMode(on) {
    if (on) this.exitAbilityEditMode();
    if (this.shared) this.shared.hidden = !on;
    if (this.personal) this.personal.hidden = !!on;
    this.root.hidden = false;
    if (on) {
      this.hideTooltip();
      this.respawn.hidden = true;
    }
  }

  hide() {
    this.exitAbilityEditMode();
    this.root.hidden = true;
    this.hideTooltip();
    this.respawn.hidden = true;
  }

  /** Servern ar facit: sätt kvarvarande cooldown vid varje ognapsbild. */
  sync(me) {
    for (const key of SLOT_KEYS) {
      const slot = this.slots[key];
      slot.left = me?.cd?.[key] ?? 0;
      if (slot.id === SHIELD) slot.charges = me?.ps ?? 0;
      // Raseriet pagar: rutan lyser sa lange svampen sitter i.
      if (slot.id === BERSERK) slot.active = (me?.bz ?? 0) > 0;
    }
    this.showCombo(me?.cb ?? -1, me?.cs ?? 0, me?.cw ?? 0);
  }

  /**
   * Combo-sparet ovanfor melee-rutorna: hela kedjan i tangenter, med de steg
   * som redan sitter tanda och en tunn stapel som visar hur lang tid man har
   * pa sig att fortsatta.
   */
  showCombo(index, steps, msLeft) {
    const combo = index >= 0 ? COMBO.list[index] : null;
    this.combo.el.hidden = !combo;
    if (!combo) {
      this.combo.index = -1;
      this.combo.steps = -1;
      return;
    }

    if (this.combo.index !== index) {
      this.combo.index = index;
      this.combo.steps = -1;
      this.combo.el.innerHTML = `
        <div class="combo-name">${escapeHtml(combo.name)}</div>
        <div class="combo-keys">${combo.seq.map((slot) => `<span class="pip">${escapeHtml(inputCap(slot))}</span>`).join('')}</div>
        <div class="combo-window"><i></i></div>`;
      this.combo.pips = [...this.combo.el.querySelectorAll('.pip')];
      this.combo.bar = this.combo.el.querySelector('.combo-window i');
    }

    if (this.combo.steps !== steps) {
      this.combo.steps = steps;
      this.combo.pips.forEach((pip, i) => {
        pip.classList.toggle('on', i < steps);
        // Nasta tangent i kedjan pekas ut sa att man ser vad man ska trycka.
        pip.classList.toggle('next', i === steps);
      });
    }

    this.combo.bar.style.width = `${Math.min(100, (msLeft / COMBO.windowMs) * 100).toFixed(1)}%`;
  }

  flash(key) {
    const slot = this.slots[key];
    if (!slot) return;
    slot.el.classList.add('fired');
    setTimeout(() => slot.el.classList.remove('fired'), 90);
  }

  /** Rakna ned mjukt mellan ognapsbilderna. */
  update(dt) {
    for (const key of SLOT_KEYS) {
      const slot = this.slots[key];
      if (!slot.has) continue;
      slot.left = Math.max(0, slot.left - dt);
      slot.el.classList.toggle('raging', slot.id === BERSERK && slot.active);

      const cooling = slot.left > 0;
      const shielded = slot.id === SHIELD && slot.charges > 0;
      slot.el.classList.toggle('cooling', cooling);
      slot.el.classList.toggle('ready', !cooling);

      if (cooling) {
        const frac = slot.left / slot.total;
        slot.sweep.style.setProperty('--deg', `${(frac * 360).toFixed(1)}deg`);
        slot.timer.textContent = shielded ? String(slot.charges) : MELEE_SLOT_SET.has(key) ? '' : formatSeconds(slot.left);
        slot.el.classList.toggle('charged', shielded);
      } else if (shielded) {
        slot.timer.textContent = String(slot.charges);
        slot.el.classList.add('charged');
      } else {
        slot.timer.textContent = '';
        slot.el.classList.remove('charged');
      }
    }
  }

  updateScore(score) {
    this.score.cleo.textContent = score.cleo;
    this.score.viking.textContent = score.viking;
  }

  updateSelf(me) {
    const dead = !!me?.d;
    this.respawn.hidden = !dead;
    if (dead) this.respawnTimer.textContent = (me.rs / 1000).toFixed(1);
  }

  updateShared(players, seats = []) {
    this.setSharedMode(true);
    if (!this.shared) return;
    this.respawn.hidden = true;

    const byId = new Map(players.map((player) => [player.i, player]));
    this.shared.innerHTML = seats
      .map((seat) => {
        const p = byId.get(Number(seat.playerId) || 0);
        const team = p?.tm ?? seat.character ?? '';
        const dead = !!p?.d;
        const actions = sharedActionsMarkup(team, p, seat);
        const combo = sharedComboMarkup(p, seat);
        return `
          <div class="shared-seat-strip ${escapeHtml(team)} ${dead ? 'dead' : ''}">
            <span class="shared-seat-id">${escapeHtml(seat.id)}</span>
            ${actions}
            ${combo}
          </div>`;
      })
      .join('');
  }

  addKill(kill) {
    const row = document.createElement('div');
    row.className = 'row';

    const victim = `<b class="${kill.victimTeam}">${escapeHtml(kill.victim)}</b>`;
    row.innerHTML = kill.killer
      ? `<b class="${kill.killerTeam}">${escapeHtml(kill.killer)}</b>${killIconMarkup(kill)}${victim}`
      : `${victim}<span class="arrow">fell</span>`;

    this.feed.prepend(row);
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
    setTimeout(() => row.remove(), 6000);
  }

  showTooltip(key, e) {
    if (this.editingAbilities) return;
    const slot = this.slots[key];
    if (!slot?.name || !this.tooltip) return;
    this.tooltip.innerHTML = `<div class="tip-name">${escapeHtml(slot.name)}</div><div class="tip-desc">${escapeHtml(slot.desc)}</div>`;
    this.tooltip.hidden = false;
    this.moveTooltip(e);
  }

  moveTooltip(e) {
    if (!this.tooltip || this.tooltip.hidden) return;
    const rect = this.stage.getBoundingClientRect();
    const pad = 10;
    let x = e.clientX - rect.left + 16;
    let y = e.clientY - rect.top + 16;
    const w = this.tooltip.offsetWidth || 220;
    const h = this.tooltip.offsetHeight || 72;

    if (x + w + pad > rect.width) x = e.clientX - rect.left - w - 14;
    if (y + h + pad > rect.height) y = e.clientY - rect.top - h - 14;

    this.tooltip.style.left = `${Math.max(pad, x)}px`;
    this.tooltip.style.top = `${Math.max(pad, y)}px`;
  }

  hideTooltip() {
    if (this.tooltip) this.tooltip.hidden = true;
  }

  applyAbilityOrder() {
    if (!this.team || !this.abilityBar) return;
    for (const bind of ABILITY_BINDS) {
      const socket = this.abilityBar.querySelector(`.ability-socket[data-position="${bind.slot}"]`);
      const abilitySlot = abilityForPosition(this.team, bind.slot);
      const ability = this.slots[abilitySlot]?.el;
      if (!socket || !ability) continue;
      ability.dataset.position = bind.slot;
      socket.append(ability);
    }
    this.showKeycaps();
  }

  onAbilityPointerDown(e) {
    if (e.button !== 0 || !this.team || this.personal?.hidden) return;
    const ability = e.target.closest('.ability');
    if (!ability || ability.hidden) return;
    e.preventDefault();
    this.hideTooltip();

    this.cancelAbilityPointer();
    this.pointer = {
      id: e.pointerId,
      abilitySlot: ability.dataset.slot,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      dragging: false,
      target: ability.dataset.position,
      proxy: null,
      timer: 0,
    };

    if (this.editingAbilities) this.startAbilityDrag(e.clientX, e.clientY);
    else {
      ability.classList.add('holding');
      this.pointer.timer = window.setTimeout(() => {
        if (!this.pointer || this.pointer.id !== e.pointerId) return;
        this.enterAbilityEditMode();
        this.startAbilityDrag(this.pointer.lastX, this.pointer.lastY);
      }, HOLD_TO_EDIT_MS);
    }
  }

  onAbilityPointerMove(e) {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== e.pointerId) return;
    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;

    if (!pointer.dragging) {
      if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > HOLD_MOVE_TOLERANCE) this.cancelAbilityPointer();
      return;
    }

    e.preventDefault();
    this.positionDragProxy(e.clientX, e.clientY);
    const socket = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ability-socket');
    const next = socket && this.abilityBar.contains(socket) ? socket.dataset.position : pointer.target;
    pointer.target = next;
    for (const candidate of this.abilityBar.querySelectorAll('.ability-socket')) {
      candidate.classList.toggle('drop-target', candidate.dataset.position === next);
    }
  }

  onAbilityPointerUp(e) {
    if (!this.pointer || this.pointer.id !== e.pointerId) return;
    const pointer = this.pointer;
    if (pointer.dragging && pointer.target) moveAbility(this.team, pointer.abilitySlot, pointer.target);
    this.cancelAbilityPointer();
  }

  onAbilityPointerCancel(e) {
    if (this.pointer?.id === e.pointerId) this.cancelAbilityPointer();
  }

  enterAbilityEditMode() {
    this.editingAbilities = true;
    this.root.classList.add('editing-abilities');
    this.doneButton.hidden = false;
    this.hideTooltip();
  }

  exitAbilityEditMode() {
    this.cancelAbilityPointer();
    this.editingAbilities = false;
    this.root?.classList.remove('editing-abilities');
    if (this.doneButton) this.doneButton.hidden = true;
  }

  startAbilityDrag(x, y) {
    const pointer = this.pointer;
    const ability = this.slots[pointer?.abilitySlot]?.el;
    if (!pointer || !ability) return;
    if (pointer.timer) window.clearTimeout(pointer.timer);
    pointer.timer = 0;
    pointer.dragging = true;
    ability.classList.remove('holding');
    ability.classList.add('dragging');

    const rect = ability.getBoundingClientRect();
    const proxy = ability.cloneNode(true);
    proxy.classList.remove('dragging', 'holding', 'fired');
    proxy.classList.add('ability-drag-proxy');
    proxy.style.width = `${rect.width}px`;
    proxy.style.height = `${rect.height}px`;
    pointer.proxy = proxy;
    document.body.append(proxy);
    this.positionDragProxy(x, y);
  }

  positionDragProxy(x, y) {
    const proxy = this.pointer?.proxy;
    if (!proxy) return;
    proxy.style.left = `${x}px`;
    proxy.style.top = `${y}px`;
  }

  cancelAbilityPointer() {
    const pointer = this.pointer;
    if (!pointer) return;
    if (pointer.timer) window.clearTimeout(pointer.timer);
    this.slots[pointer.abilitySlot]?.el.classList.remove('holding', 'dragging');
    pointer.proxy?.remove();
    for (const socket of this.abilityBar?.querySelectorAll('.ability-socket') ?? []) socket.classList.remove('drop-target');
    this.pointer = null;
  }
}

function killIconMarkup(kill) {
  const icon = killIcon(kill);
  const title = escapeHtml(icon.label);
  if (icon.src) {
    return `<span class="kill-icon img" title="${title}"><img src="${escapeHtml(icon.src)}" alt="${title}" /></span>`;
  }
  return `<span class="kill-icon text" title="${title}">${escapeHtml(icon.text)}</span>`;
}

function killIcon(kill) {
  const abilityId = kill?.abilityId || (kill?.cause === 'harpoon' ? 'harpoon' : kill?.cause);
  const ability = abilityById(kill?.killerTeam, abilityId);
  if (abilityId && abilityId !== 'melee') {
    return {
      src: KILL_ICON_IMAGES[abilityId] ?? ability?.iconImage ?? '',
      text: iconText(abilityId, ability?.icon),
      label: ability?.name ?? labelFor(abilityId),
    };
  }

  if (kill?.cause === 'melee') {
    const melee = MELEE_ATTACKS[kill?.killerTeam]?.[kill?.meleeSlot];
    const key = `${kill?.killerTeam}:${kill?.meleeSlot}`;
    return {
      src: MELEE_KILL_ICON_IMAGES[key] ?? melee?.iconImage ?? '',
      text: iconText(melee?.id, melee?.icon),
      label: melee?.name ?? 'Melee attack',
    };
  }

  return { src: '', text: 'KO', label: 'Knockout' };
}

function sharedActionsMarkup(team, player, seat) {
  const abilities = ABILITIES[team] ?? null;
  const melee = MELEE_ATTACKS[team] ?? null;
  if (!abilities && !melee) return '<span class="shared-seat-actions"></span>';

  return `
    <span class="shared-seat-actions" aria-label="${escapeHtml(`${characterName(team)} actions`)}">
      ${MELEE_BINDS.map((bind) => sharedActionMarkup(melee?.[bind.slot], bind.slot, player, seat, 'melee', team)).join('')}
      ${ABILITY_BINDS.map((bind) => {
        const abilitySlot = abilityForPosition(team, bind.slot);
        return sharedActionMarkup(abilities?.[abilitySlot], abilitySlot, player, seat, 'ability', team, bind.slot);
      }).join('')}
    </span>`;
}

function sharedActionMarkup(info, slot, player, seat, kind, team, keySlot = slot) {
  if (!info) return '<span class="shared-action empty" aria-hidden="true"></span>';

  const left = Math.max(0, Number(player?.cd?.[slot]) || 0);
  const total = Math.max(1, Number(info.cooldown) || 1);
  const frac = Math.max(0, Math.min(1, left / total));
  const charges = info.id === SHIELD ? Math.max(0, Number(player?.ps) || 0) : 0;
  const active = (info.id === BERSERK && (Number(player?.bz) || 0) > 0) || (info.id === 'sunFire' && (Number(player?.sf) || 0) > 0);
  const cooling = left > 0;
  const ready = !!player && !player.d && !cooling;
  const key = sharedInputCap(seat, keySlot);
  const status = charges > 0 ? String(charges) : cooling && kind !== 'melee' ? formatSeconds(left) : '';
  const img = sharedActionIcon(team, slot, info);
  const title = `${key} - ${info.name}${charges > 0 ? ` (${charges} shield${charges === 1 ? '' : 's'})` : cooling ? ` (${formatSeconds(left)}s)` : ready ? ' (ready)' : ''}`;
  const classes = ['shared-action', kind];
  if (cooling) classes.push('cooling');
  if (ready) classes.push('ready');
  if (charges > 0) classes.push('charged');
  if (active) classes.push('active');

  return `
    <span class="${classes.join(' ')}" style="--deg:${(frac * 360).toFixed(1)}deg" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
      <span class="shared-action-sweep"></span>
      <span class="shared-action-icon ${img ? 'img' : ''}">
        ${img ? `<img src="${escapeHtml(img)}" alt="" />` : escapeHtml(iconText(info.id, info.icon))}
      </span>
      <span class="shared-action-key">${escapeHtml(key)}</span>
      ${status ? `<span class="shared-action-timer">${escapeHtml(status)}</span>` : ''}
    </span>`;
}

function sharedActionIcon(team, slot, info) {
  if (MELEE_SLOT_SET.has(slot)) return MELEE_KILL_ICON_IMAGES[`${team}:${slot}`] ?? info.iconImage ?? '';
  return KILL_ICON_IMAGES[info.id] ?? info.iconImage ?? '';
}

function sharedComboMarkup(player, seat) {
  const index = Number(player?.cb);
  const combo = index >= 0 && !player?.d ? COMBO.list[index] : null;
  if (!combo) return '<span class="shared-seat-combo idle"></span>';

  const steps = Math.max(0, Number(player?.cs) || 0);
  const msLeft = Math.max(0, Number(player?.cw) || 0);
  const pct = Math.min(100, (msLeft / COMBO.windowMs) * 100);
  return `
    <span class="shared-seat-combo active" style="--combo-pct:${pct.toFixed(1)}%" title="${escapeHtml(combo.name)}">
      <span class="shared-combo-name">${escapeHtml(combo.name)}</span>
      <span class="shared-combo-keys">
        ${combo.seq
          .map(
            (slot, i) =>
              `<span class="shared-combo-key ${i < steps ? 'on' : ''} ${i === steps ? 'next' : ''}">${escapeHtml(sharedInputCap(seat, slot))}</span>`,
          )
          .join('')}
      </span>
      <span class="shared-combo-window"><i></i></span>
    </span>`;
}

function sharedInputCap(seat, slot) {
  if (seat?.inputDevice?.type === 'keyboard') return keycapFor(slot);
  if (seat?.inputDevice?.type === 'gamepad') return padCap(slot) || inputCap(slot);
  return inputCap(slot);
}

function abilityById(team, id) {
  for (const info of Object.values(ABILITIES[team] ?? {})) {
    if (info.id === id) return info;
  }
  for (const group of Object.values(ABILITIES)) {
    for (const info of Object.values(group)) {
      if (info.id === id) return info;
    }
  }
  return null;
}

function iconText(id, icon) {
  if (icon && icon.length <= 3) return icon;
  switch (id) {
    case 'sandBlast':
      return 'SB';
    case 'sunFire':
      return 'SF';
    case 'chargedUppercut':
      return 'CU';
    case 'blink':
      return 'BL';
    case 'powerShield':
      return 'PS';
    case 'axeThrow':
      return 'AX';
    case 'shieldCharge':
      return 'SC';
    case 'lasso':
    case 'harpoon':
      return 'HP';
    case 'mushrooms':
      return 'MS';
    case 'iceSpikes':
      return 'IS';
    case 'punch':
      return 'P';
    case 'kick':
      return 'K';
    case 'axe':
      return 'AX';
    case 'shield':
      return 'SH';
    default:
      return 'KO';
  }
}

function labelFor(id) {
  return String(id || 'Knockout')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (ch) => ch.toUpperCase());
}

function characterName(team) {
  if (team === 'cleo') return 'Cleo';
  if (team === 'viking') return 'Viking';
  return 'Local';
}

function formatSeconds(ms) {
  const s = ms / 1000;
  return s >= 10 ? Math.ceil(s).toString() : s.toFixed(1);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Tangenten fylls i av showKeycaps, sa att en ombindning slar igenom direkt.
function slotMarkup(slot) {
  return `
    <div class="ability" data-slot="${slot}">
      <div class="sweep"></div>
      <div class="icon"></div>
      <div class="key"></div>
      <div class="timer"></div>
    </div>`;
}
