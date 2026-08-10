import { ABILITIES, ABILITY_BINDS, COMBO, MELEE_ATTACKS, MELEE_BINDS, TEAMS } from '/shared/constants.js';

// Vilken tangent varje melee-plats sitter pa, for combo-spuret: m1 -> Q.
const KEYCAPS = Object.fromEntries(MELEE_BINDS.map((bind) => [bind.slot, bind.keycap]));

// Tva melee-rutor foljs av abilities. Har ett lag ingen formaga i en ruta doljs
// rutan helt.
const SLOT_KEYS = [...MELEE_BINDS.map((bind) => bind.slot), ...ABILITY_BINDS.map((bind) => bind.slot)];
const MELEE_SLOT_SET = new Set(MELEE_BINDS.map((bind) => bind.slot));

// Tva formagor visar mer an en nedrakning i rutan. Vilken tangent de sitter pa
// varierar mellan lagen, sa rutorna kanns igen pa formagans id - inte pa key.
const SHIELD = 'powerShield'; // raknar kvarvarande skoldar i stallet for sekunder
const BERSERK = 'mushrooms'; // rutan glover sa lange raseriet varar

const KILL_ICON_IMAGES = {
  sandBlast: '/assets/cleo/sand_blast1.png',
  sunFire: '/assets/cleo/sun_fire_ball.png',
  axeThrow: '/assets/viking/axe_throw.png',
  shieldCharge: '/assets/viking/shield_charge.png',
  lasso: '/assets/viking_harpoon_projectile.png',
  harpoon: '/assets/viking_harpoon_projectile.png',
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
    this.root.innerHTML = `
      <div class="hud-col">
        <div class="combo-track" hidden></div>
        <div class="hud-group hud-melee">${MELEE_BINDS.map((bind) => slotMarkup(bind.slot, bind.keycap)).join('')}</div>
      </div>
      <div class="hud-group hud-abilities">${ABILITY_BINDS.map((bind) => slotMarkup(bind.slot, bind.keycap)).join('')}</div>`;

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

    this.score = {
      cleo: document.getElementById('score-cleo'),
      viking: document.getElementById('score-viking'),
    };
    this.feed = document.getElementById('killfeed');
    this.respawn = document.getElementById('respawn');
    this.respawnTimer = document.getElementById('respawn-timer');
  }

  setTeam(team) {
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
      slot.total = info.cooldown;
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
    this.showCombo(-1, 0, 0);
    this.root.hidden = false;
  }

  hide() {
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
        <div class="combo-keys">${combo.seq.map((slot) => `<span class="pip">${KEYCAPS[slot] ?? '?'}</span>`).join('')}</div>
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
    case 'axeThrow':
      return 'AX';
    case 'shieldCharge':
      return 'SC';
    case 'lasso':
    case 'harpoon':
      return 'HP';
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

function formatSeconds(ms) {
  const s = ms / 1000;
  return s >= 10 ? Math.ceil(s).toString() : s.toFixed(1);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function slotMarkup(slot, keycap) {
  return `
    <div class="ability" data-slot="${slot}">
      <div class="sweep"></div>
      <div class="icon"></div>
      <div class="key">${keycap}</div>
      <div class="timer"></div>
    </div>`;
}
