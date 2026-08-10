// Info-avdelningen i lobbyn. All text byggs ur shared/constants.js sa att
// siffrorna aldrig kan sla isar fran vad servern faktiskt raknar med - andrar
// man en cooldown eller en skada racker det med att andra i konstantfilen.

import {
  ABILITIES,
  ABILITY_BINDS,
  ABILITY_TUNING,
  BACKSTAB,
  COMBO,
  CRIT,
  DAMAGE_BUFF,
  MELEE,
  MELEE_ATTACKS,
  MELEE_BINDS,
  PLAYER,
  POWERUP,
  POWERUP_KINDS,
  POWERUP_SPAWNS,
  TEAMS,
} from '/shared/constants.js';

// Sekunder i klartext: "2 seconds", "1.5 seconds". Ingen spelare tanker i ms.
const sec = (ms) => {
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1)} second${s === 1 ? '' : 's'}`;
};

// Kortform dar det ar trangt, t.ex. cooldown-etiketten: "6.5s".
const secShort = (ms) => {
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1)}s`;
};

// Rackvidd i ord i stallet for pixlar. Trosklarna gor att texten fortfarande
// foljer ABILITY_TUNING - skruvar man upp en rackvidd byter frasen sig sjalv.
const reach = (px) => {
  if (px < 100) return 'right in front of you';
  if (px < 200) return 'just ahead of you';
  if (px < 350) return 'a short way forward';
  if (px < 550) return 'a good stretch forward';
  return 'clear across the arena';
};

/** Fyller info-panelerna och kopplar flikarna. Anropas en gang vid uppstart. */
export function initLobbyInfo() {
  const root = document.getElementById('lobby-info');
  if (!root) return;

  fill('info-gameplay', gameplayHtml());
  fill('info-powerups', powerupsHtml());
  fill('info-abilities', abilitiesHtml());

  const tabs = [...root.querySelectorAll('.info-tab')];
  const panes = [...root.querySelectorAll('.info-pane')];

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      for (const t of tabs) {
        const on = t === tab;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      for (const pane of panes) pane.hidden = pane.id !== `info-${tab.dataset.tab}`;
    });
  }
}

function fill(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// -------------------------------------------------------- spelupplagg

// Kontrolschemat bodde tidigare som en egen rad langst ner i lobbyn. Nu ligger
// det forst i gameplay-fliken sa att tangenter och regler hanger ihop.
function controlsHtml() {
  const keys = [
    [['←', '→'], 'Move'],
    [['Space'], 'Jump'],
    [['Down'], 'Drop'],
    [MELEE_BINDS.map((bind) => bind.keycap), 'Melee'],
    [ABILITY_BINDS.map((bind) => bind.keycap), 'Abilities'],
  ];

  return `<div class="key-map">${keys
    .map(
      ([kbds, label]) => `
        <div class="key-row">
          <span class="key-keys">${kbds.map((k) => `<kbd>${k}</kbd>`).join('')}</span>
          <span class="key-label">${label}</span>
        </div>`,
    )
    .join('')}</div>`;
}

// Combons tangenter som kbd-rutor: Q Q E Q.
const comboKeys = (combo) =>
  combo.seq.map((slot) => `<kbd>${MELEE_BINDS.find((bind) => bind.slot === slot)?.keycap ?? '?'}</kbd>`).join('');

// Vad finishern gor, hopplockat ur combons falt - lagger man till en combo i
// konstantfilen beskriver den sig sjalv har.
function comboEffect(combo) {
  const parts = [`<b>+${Math.round((combo.finisherMul - 1) * 100)} % damage</b>`];
  if (combo.knockback && combo.knockback.y < MELEE.knockbackY) parts.push('launches them into the air');
  if (combo.stunMs) parts.push(`freezes them for ${sec(combo.stunMs)}`);
  if (combo.healSelf) parts.push(`heals you ${combo.healSelf}`);
  if (combo.refundCooldown) parts.push('melee ready again instantly');
  return parts.join(' &middot; ');
}

function combosHtml() {
  return `
    <div class="combo-cards">${COMBO.list
      .map(
        (combo) => `
          <div class="combo-card">
            <div class="cc-head">
              <span class="cc-name">${combo.name}</span>
              <span class="cc-keys">${comboKeys(combo)}</span>
            </div>
            <span class="cc-effect">${comboEffect(combo)}</span>
          </div>`,
      )
      .join('')}</div>`;
}

function gameplayHtml() {
  const rows = [
    [
      '💥',
      'Critical hits',
      `Every single hit rolls for a crit: a ${Math.round(CRIT.chance * 100)} % chance to land ${Math.round(
        (CRIT.mul - 1) * 100,
      )} % harder. It counts for everything - your swings, your abilities and your thrown weapons - and it stacks on top of every other bonus.`,
    ],
    [
      '🥊',
      'Combos',
      `Land your two melee attacks in one of the orders below and the last hit does something extra. Only landed hits count - swing and miss, or let more than ${sec(
        COMBO.windowMs,
      )} pass between hits, and the chain starts over. The HUD tracks how far along you are and what to press next.`,
    ],
    [
      '🔪',
      'Backstab',
      `Catch someone facing the other way and you hit ${Math.round(
        (BACKSTAB.mul - 1) * 100,
      )} % harder. Works with everything - your swing and both abilities.`,
    ],
    [
      '⏱️',
      'Respawn',
      `Go down and you're back in ${sec(PLAYER.respawnMs)}. Nothing can touch you for the first ${sec(
        PLAYER.spawnProtectionMs,
      )}, so you get a moment to find your feet.`,
    ],
  ];

  return `
    ${controlsHtml()}
    <ul class="info-list">${rows
      .map(
        ([icon, title, text]) => `
        <li>
          <span class="ii">${icon}</span>
          <div><b>${title}</b><span>${text}</span></div>
        </li>`,
      )
      .join('')}</ul>
    ${combosHtml()}`;
}

// ----------------------------------------------------------------- powerups

function powerupsHtml() {
  const items = [
    {
      kind: 'pizza',
      name: 'Pizza',
      effect: `Heals ${POWERUP.heal} health`,
      text: `Tops you up to a maximum of ${PLAYER.maxHp}. Only picked up if you're below ${PLAYER.maxHp} - at full health you run straight past it.`,
    },
    {
      kind: 'kebab',
      name: 'Kebab',
      effect: `Hit ${Math.round((DAMAGE_BUFF.mul - 1) * 100)} % harder for ${sec(DAMAGE_BUFF.durationMs)}`,
      text: `Counts for your swing and both abilities. Grab another one to start the timer over. You lose it if you die.`,
    },
  ];

  const cards = items
    .map(
      (it) => `
        <div class="pu-card ${it.kind}">
          <img src="${POWERUP_KINDS[it.kind].sprite}" alt="${it.name}" />
          <div class="pu-text">
            <b>${it.name}</b>
            <span class="pu-effect">${it.effect}</span>
            <span>${it.text}</span>
          </div>
        </div>`,
    )
    .join('');

  return `
    <div class="pu-list">${cards}</div>
    <p class="info-note">
      A fresh one drops every ${sec(POWERUP.spawnIntervalMs)}, never more than ${POWERUP.maxActive}
      out at once, at ${POWERUP_SPAWNS.length} fixed spots around the arena.
    </p>`;
}

// ---------------------------------------------------------------- formagor

// Langre beskrivningar med siffrorna hamtade ur ABILITY_TUNING. desc-falten i
// konstantfilen ar kortare och anvands av HUD-tooltipen - har har vi plats for
// hela bilden.
function abilityText(id) {
  const t = ABILITY_TUNING;
  switch (id) {
    case 'sandBlast':
      return `Blasts a spray of sand ${reach(t.sandBlast.range)}. Everyone caught in it takes ${t.sandBlast.damageMin}-${t.sandBlast.damageMax} damage and is frozen in place for ${sec(
        t.sandBlast.stunMs,
      )} - plenty of time to move in for the kill.`;
    case 'blink':
      return `Vanish and reappear ${reach(t.blink.distance)}, straight through walls and enemies. Does no damage - it's your escape hatch and your shortcut.`;
    case 'powerShield':
      return `Summons ${t.powerShield.charges} orbiting shields around you. Each one blocks one incoming melee hit or enemy ability, and the set stays up until all ${t.powerShield.charges} are gone.`;
    case 'sunFire':
      return `Hold the key to channel a rotating sunfire ball for up to ${sec(t.sunFire.channelMaxMs)}. Release to launch it: longer channels make the projectile larger, faster and stronger, up to ${t.sunFire.damageMax} damage before bonuses.`;
    case 'axeThrow':
      return `Sends your axe flying ${reach(t.axeThrow.maxRange)}. The first enemy it hits takes ${t.axeThrow.damageMin}-${t.axeThrow.damageMax} damage and gets knocked back hard - your heaviest hit by far.`;
    case 'shieldCharge':
      return `Barrel forward behind your shield. Whoever you crash into takes ${t.shieldCharge.damageMin}-${t.shieldCharge.damageMax} damage and is left standing helpless for ${sec(
        t.shieldCharge.stunMs,
      )}.`;
    case 'mushrooms':
      return `Wolf down a fly agaric and go berserk for ${sec(t.mushrooms.durationMs)}: you swell up, turn red with rage and deal ${Math.round(
        (t.mushrooms.dealtMul - 1) * 100,
      )} % more damage - but everything hitting you lands ${Math.round(
        (t.mushrooms.takenMul - 1) * 100,
      )} % harder too. It ends early if you die.`;
    case 'lasso':
      return `Hurls a harpoon ${reach(t.lasso.maxRange)}. It flies slower than the axe, so a sharp enemy can sidestep or jump it - but spear someone and they take ${t.lasso.damageMin}-${t.lasso.damageMax} damage and get reeled all the way back to you. Line them up for your team, or yank them clean off a ledge into the pit below.`;
    default:
      return '';
  }
}

function abilitiesHtml() {
  return ['cleo', 'viking']
    .map((team) => {
      const ab = ABILITIES[team];
      const melee = MELEE_ATTACKS[team];
      const rows = [
      ];
      for (const bind of MELEE_BINDS) {
        const info = melee[bind.slot];
        rows.push({
          key: bind.keycap,
          info,
          text: `${info.name} hits whatever is ${reach(MELEE.reach)}, for ${MELEE.damageMin}-${MELEE.damageMax} damage. It shares melee timing with your other close-range move, so you choose the attack without doubling the speed.`,
          name: info.name,
        });
      }
      for (const bind of ABILITY_BINDS) {
        const info = ab[bind.slot];
        if (!info) continue;
        rows.push({ key: bind.keycap, info, text: abilityText(info.id), name: info.name });
      }

      return `
        <div class="ab-team ${team}">
          <h3><img src="/assets/${team}/idle.png" alt="" />${TEAMS[team].name}</h3>
          <ul class="ab-list">
            ${rows
              .map(
                (r) => `
                  <li>
                    <kbd>${r.key}</kbd>
                    <span class="ab-icon">${
                      r.info.iconImage ? `<img src="${r.info.iconImage}" alt="" />` : r.info.icon
                    }</span>
                    <div>
                      <b>${r.name}</b><span class="ab-cd">${secShort(r.info.cooldown)} cooldown</span>
                      <span>${r.text}</span>
                    </div>
                  </li>`,
              )
              .join('')}
          </ul>
        </div>`;
    })
    .join('');
}
