// Formagor och projektiler: blink, sand, shield charge, yxa, harpun, sun fire
// och svampbuffen. Allt kors direkt mot Game med en styrd klocka.

import { Game } from '../server/game.js';
import { ABILITIES, ABILITY_TUNING, DAMAGE_BUFF, MAP, PLAYER, TICK_MS } from '../shared/constants.js';

const GROUND_Y = MAP.platforms.find((pl) => pl.ground).y - PLAYER.h;

let clock = 100000;
const fails = [];

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FEL '} ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) fails.push(label);
};

function scenario() {
  clock = 100000;
  return new Game({ clock: () => clock, rng: () => 1 }); // inga crits
}

function advance(g, ms) {
  const end = clock + ms;
  while (clock + TICK_MS <= end) {
    clock += TICK_MS;
    g.update();
  }
  if (clock < end) {
    clock = end;
    g.update();
  }
}

function until(g, pred, ms = 1500) {
  const end = clock + ms;
  while (clock < end) {
    if (pred()) return true;
    advance(g, TICK_MS);
  }
  return pred();
}

function add(g, name, team, x, facing = team === 'cleo' ? 1 : -1) {
  const p = g.addPlayer(name, team);
  place(p, x, facing);
  return p;
}

function place(p, x, facing = p.facing) {
  p.x = x;
  p.y = GROUND_Y;
  p.vx = 0;
  p.vy = 0;
  p.facing = facing;
  p.onGround = true;
  p.invulnUntil = 0;
  p.history.length = 0;
  return p;
}

const damageIn = (before, after, min, max) => before - after >= min && before - after <= max;
const hasFx = (g, kind) => g.fx.some((fx) => fx.k === kind);
const hasEvent = (g, kind, pred = () => true) => g.events.some((ev) => ev.k === kind && pred(ev));

// ---------------------------------------------------------------- sand blast

{
  const g = scenario();
  const cleo = add(g, 'Cleo', 'cleo', 400, 1);
  const near = add(g, 'Near', 'viking', 500, -1);
  const far = add(g, 'Far', 'viking', 540, -1);
  const ally = add(g, 'Ally', 'cleo', 470, 1);

  g.action(cleo, 'a1');
  check('sand blast startar cooldown', cleo.cd.a1 === clock + ABILITIES.cleo.a1.cooldown);
  check('sand blast skickar fx', hasFx(g, 'sand_blast'));
  check(
    'sand blast traffar narmaste fienden i konen',
    damageIn(PLAYER.maxHp, near.hp, ABILITY_TUNING.sandBlast.damageMin, ABILITY_TUNING.sandBlast.damageMax),
    `hp ${near.hp}`,
  );
  check('sand blast stunnar traffad fiende', near.stunnedUntil === clock + ABILITY_TUNING.sandBlast.stunMs);
  check('sand blast skadar inte andra fienden bakom forsta', far.hp === PLAYER.maxHp);
  check('sand blast skadar inte lagkamrat', ally.hp === PLAYER.maxHp);
}

// --------------------------------------------------------------------- blink

{
  const g = scenario();
  const cleo = add(g, 'Blinker', 'cleo', 400, 1);
  const blocker = add(g, 'Blocker', 'viking', 660, -1);

  g.action(cleo, 'a2');
  check('blink hoppar igenom spelare pa landningspunkten', cleo.x > blocker.x + PLAYER.w, `x ${cleo.x}`);
  check('blink rensar positionshistoriken', cleo.history.length === 0);
  check('blink rapporterar throughPlayer for statistik', hasEvent(g, 'ability_use', (ev) => ev.abilityId === 'blink' && ev.throughPlayer));
}

// --------------------------------------------------------------- shield charge

{
  const g = scenario();
  const viking = add(g, 'Charger', 'viking', 400, 1);
  const target = add(g, 'Target', 'cleo', 460, -1);
  const before = target.hp;

  g.action(viking, 'a2');
  advance(g, TICK_MS);
  check('shield charge skickar start-fx', hasFx(g, 'shield_charge'));
  check(
    'shield charge gor skada i ratt spann',
    damageIn(before, target.hp, ABILITY_TUNING.shieldCharge.damageMin, ABILITY_TUNING.shieldCharge.damageMax),
    `hp ${before} -> ${target.hp}`,
  );
  check('shield charge stunnar offret', target.stunnedUntil > clock);
  check('shield charge stannar efter traff', viking.chargeHits === null && viking.chargeType === null);
}

// ------------------------------------------------------------------- axe throw

{
  const g = scenario();
  const viking = add(g, 'Thrower', 'viking', 400, 1);
  const ally = add(g, 'Ally', 'viking', 500, 1);
  const target = add(g, 'Enemy', 'cleo', 540, -1);
  const before = target.hp;

  g.action(viking, 'a1');
  check('axe throw skapar projektil', g.projectiles.length === 1 && hasFx(g, 'axe_throw'));
  check('axe throw traffar forsta fienden och ignorerar lagkamrat', until(g, () => target.hp < before), `hp ${target.hp}`);
  check('axe throw skadar inte lagkamrat', ally.hp === PLAYER.maxHp);
  check(
    'axe throw gor skada i ratt spann',
    damageIn(before, target.hp, ABILITY_TUNING.axeThrow.damageMin, ABILITY_TUNING.axeThrow.damageMax),
    `hp ${before} -> ${target.hp}`,
  );
  check('axe throw tas bort vid traff', g.projectiles.length === 0);
  check('axe throw markeras som ability-hit', hasEvent(g, 'hit', (ev) => ev.abilityId === 'axeThrow'));
}

// --------------------------------------------------------------------- harpoon

{
  const g = scenario();
  const viking = add(g, 'Hooker', 'viking', 400, 1);
  const target = add(g, 'Pulled', 'cleo', 540, -1);
  const before = target.hp;

  g.action(viking, 'a4');
  check('harpoon skapar projektil', g.projectiles.length === 1 && hasFx(g, 'lasso_throw'));
  check('harpoon fastnar i fienden', until(g, () => target.pulledBy === viking.id), `pulledBy ${target.pulledBy}`);
  check(
    'harpoon gor skada i ratt spann',
    damageIn(before, target.hp, ABILITY_TUNING.lasso.damageMin, ABILITY_TUNING.lasso.damageMax),
    `hp ${before} -> ${target.hp}`,
  );
  check('harpoon rapporterar pull-statistik', hasEvent(g, 'harpoon_pull', (ev) => ev.player.playerId === viking.id));
  const xAfterHook = target.x;
  advance(g, 160);
  check('harpoon drar offret mot vikingen', target.x < xAfterHook, `x ${xAfterHook} -> ${target.x}`);
  check('harpoon slapper nar offret ar nara', until(g, () => target.pulledUntil === 0, 1500));
}

// ------------------------------------------------------------------- sun fire

{
  const g = scenario();
  const cleo = add(g, 'Sun', 'cleo', 400, 1);
  const target = add(g, 'Target', 'viking', 640, -1);

  g.action(cleo, 'a4');
  check('sun fire startar kanal', cleo.channel?.id === 'sunFire' && hasFx(g, 'sun_fire_channel'));
  advance(g, ABILITY_TUNING.sunFire.channelMaxMs);
  check('sun fire syns i snapshot under kanal', g.snapshot().players.find((p) => p.i === cleo.id).sf > 0);

  g.releaseAction(cleo, 'a4');
  check('sun fire release skapar projektil', g.projectiles.length === 1 && hasFx(g, 'sun_fire_release'));
  check('sun fire cooldown satts vid release', cleo.cd.a4 === clock + ABILITIES.cleo.a4.cooldown);
  check('full channel rapporteras som release-statistik', hasEvent(g, 'ability_release', (ev) => ev.abilityId === 'sunFire' && ev.fullCharge));

  const before = target.hp;
  check('sun fire traffar fienden', until(g, () => target.hp < before), `hp ${target.hp}`);
  check('fulladdad sun fire gor maxskada', target.hp === before - ABILITY_TUNING.sunFire.damageMax, `hp ${before} -> ${target.hp}`);
  check('sun fire markeras som fulladdad hit', hasEvent(g, 'hit', (ev) => ev.abilityId === 'sunFire' && ev.fullCharge));
}

// ------------------------------------------------------------------ mushrooms

{
  const g = scenario();
  const viking = add(g, 'Berserk', 'viking', 400, 1);
  const cleo = add(g, 'Cleo', 'cleo', 440, -1);

  g.action(viking, 'a3');
  check('mushrooms startar berserk', viking.berserkUntil === clock + ABILITY_TUNING.mushrooms.durationMs);
  check('mushrooms syns i snapshot', g.snapshot().players.find((p) => p.i === viking.id).bz === ABILITY_TUNING.mushrooms.durationMs);

  cleo.hp = PLAYER.maxHp;
  g.damage(cleo, viking, 10, 0, 0, clock);
  check('berserk okar utdelad skada', cleo.hp === PLAYER.maxHp - Math.round(10 * ABILITY_TUNING.mushrooms.dealtMul));

  viking.hp = PLAYER.maxHp;
  g.damage(viking, cleo, 10, 0, 0, clock);
  check('berserk okar mottagen skada', viking.hp === PLAYER.maxHp - Math.round(10 * ABILITY_TUNING.mushrooms.takenMul));

  viking.dmgBuffUntil = clock + DAMAGE_BUFF.durationMs;
  cleo.hp = PLAYER.maxHp;
  g.damage(cleo, viking, 10, 0, 0, clock);
  check('mushrooms kan staplas med kebab', cleo.hp === PLAYER.maxHp - Math.round(Math.round(10 * DAMAGE_BUFF.mul) * ABILITY_TUNING.mushrooms.dealtMul));
}

console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA FORMAGE-TESTER OK');
process.exit(fails.length ? 1 : 0);
