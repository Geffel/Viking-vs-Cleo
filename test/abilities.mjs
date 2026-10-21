// Formagor och projektiler: blink, sand, shield charge, yxa, harpun, isspikar,
// sun fire och svampbuffen. Allt kors direkt mot Game med en styrd klocka.

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

// ----------------------------------------------------------------- ice spikes

{
  clock = 100000;
  let rngCall = 0;
  const g = new Game({ clock: () => clock, rng: () => (rngCall++ % 2 === 0 ? 0.5 : 1) });
  const viking = add(g, 'Ice', 'viking', 400, 1);
  const near = add(g, 'Near', 'cleo', 500, -1);
  const far = add(g, 'Far', 'cleo', 830, -1);
  const outside = add(g, 'Outside', 'cleo', 980, -1);
  const ally = add(g, 'Ally', 'viking', 620, 1);

  g.action(viking, 'a5');
  check('ice spikes startar test-cooldown', viking.cd.a5 === clock + ABILITIES.viking.a5.cooldown);
  check(
    'ice spikes skickar en tat spikrad',
    hasFx(g, 'ice_spikes') && g.fx.find((fx) => fx.k === 'ice_spikes').n === ABILITY_TUNING.iceSpikes.count,
  );
  check('ice spikes gor inte skada direkt vid knapptrycket', near.hp === PLAYER.maxHp && far.hp === PLAYER.maxHp);

  advance(g, ABILITY_TUNING.iceSpikes.stepMs + TICK_MS);
  check('nara fienden traffas nar dess spik skjuter upp', near.hp < PLAYER.maxHp);
  check('fienden vid max range har annu inte traffats', far.hp === PLAYER.maxHp);
  const nearWasPushed = near.vy < 0;

  check('spikvagen nar fienden vid max range senare', until(g, () => far.hp < PLAYER.maxHp, 1000));
  const farWasPushed = far.vy < 0;
  check('ice spikes traffar alla fiender inom range', near.hp < PLAYER.maxHp && far.hp < PLAYER.maxHp);
  check(
    'ice spikes gor skada i ratt spann',
    damageIn(PLAYER.maxHp, near.hp, ABILITY_TUNING.iceSpikes.damageMin, ABILITY_TUNING.iceSpikes.damageMax) &&
      damageIn(PLAYER.maxHp, far.hp, ABILITY_TUNING.iceSpikes.damageMin, ABILITY_TUNING.iceSpikes.damageMax),
  );
  check('ice spikes ger en latt push uppat vid respektive traff', nearWasPushed && farWasPushed);
  check('ice spikes skadar inte fiender utanfor range', outside.hp === PLAYER.maxHp);
  check('ice spikes skadar inte lagkamrater', ally.hp === PLAYER.maxHp);
  check('ice spikes markeras som ability-hit', hasEvent(g, 'hit', (ev) => ev.abilityId === 'iceSpikes'));
  check('ice spikes slow varar i 7 sekunder fran traffen', near.iceSlowUntil > clock && near.iceSlowUntil <= clock + ABILITY_TUNING.iceSpikes.slowMs);
  check('ice spikes slow syns i snapshot', g.snapshot().players.find((p) => p.i === near.id).is > 0);

  near.vx = 0;
  near.vy = 0;
  near.onGround = true;
  g.setMove(near, false, true);
  advance(g, 600);
  const slowedMax = PLAYER.maxSpeed * ABILITY_TUNING.iceSpikes.slowMul;
  check('ice spikes minskar movement speed med 25 procent', near.vx > 0 && near.vx <= slowedMax, `vx ${near.vx}`);

  clock = near.iceSlowUntil;
  g.update();
  near.vx = 0;
  advance(g, 600);
  check('normal movement speed aterkommer efter 7 sekunder', near.vx > slowedMax, `vx ${near.vx}`);
  check('ice spikes slow forsvinner ur snapshot', g.snapshot().players.find((p) => p.i === near.id).is === 0);
}

{
  clock = 100000;
  const edgeX = 580;
  const layout = {
    ...MAP,
    platforms: [{ x: 300, y: MAP.platforms.find((pl) => pl.ground).y, w: edgeX - 300, h: 18 }],
  };
  const g = new Game({ clock: () => clock, rng: () => 1, layout });
  const viking = add(g, 'Edge Ice', 'viking', 400, 1);
  const onEdge = add(g, 'On edge', 'cleo', 540, -1);
  const pastEdge = add(g, 'Past edge', 'cleo', 620, -1);

  g.action(viking, 'a5');
  const fx = g.fx.find((effect) => effect.k === 'ice_spikes');
  check('ice spikes inkluderar spiken som bara delvis overlappar plattformskanten', fx?.n === 3, `antal ${fx?.n}`);
  advance(g, 250);
  check('ice spikes traffar fienden vid den sista understodda spiken', onEdge.hp < PLAYER.maxHp);
  check(
    'ice spikes slutar vid plattformskanten och skadar inte bortom den',
    !hasEvent(g, 'hit', (ev) => ev.abilityId === 'iceSpikes' && ev.target?.playerId === pastEdge.id),
  );
}

// ----------------------------------------------------------- charged uppercut

{
  const g = scenario();
  const cleo = add(g, 'Uppercut Cleo', 'cleo', 400, 1);
  const target = add(g, 'Uppercut Target', 'viking', 450, -1);
  const before = target.hp;

  // En lag plattform precis over offrets huvud gor undersidestraffen enkel att
  // prova utan att bero pa den ordinarie kartans utseende.
  g.layout.platforms.push({ x: 420, y: 710, w: 100, h: 18 });

  g.action(cleo, 'a5');
  check('charged uppercut startar 50 sekunders cooldown', cleo.cd.a5 === clock + ABILITIES.cleo.a5.cooldown);
  check('charged uppercut skickar punch- och swoosh-fx', hasFx(g, 'charged_uppercut'));
  check(
    'charged uppercut gor skada i ratt spann',
    damageIn(before, target.hp, ABILITY_TUNING.chargedUppercut.damageMin, ABILITY_TUNING.chargedUppercut.damageMax),
    `hp ${before} -> ${target.hp}`,
  );
  check('charged uppercut kastar offret rakt upp', target.vx === 0 && target.vy === ABILITY_TUNING.chargedUppercut.launchVelocity);
  g.action(target, 'a3');
  check('charged uppercut laser offrets actions i luften', target.berserkUntil === 0 && target.cd.a3 === 0);
  check('charged uppercut markeras som ability-hit', hasEvent(g, 'hit', (ev) => ev.abilityId === 'chargedUppercut'));

  check('plattformstraffen stunnar offret i 4 sekunder', until(g, () => target.stunnedUntil > clock, 500), `stun till ${target.stunnedUntil}`);
  check('plattformstraffen anvander vanliga stun-fx', hasFx(g, 'stun'));
  check('uppercut-offret stoppas vid plattformens undersida', target.y === 728 && target.vy === 0, `y ${target.y}, vy ${target.vy}`);
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
