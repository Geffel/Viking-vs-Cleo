// Traffkontroll for narstrid: node test/hitreg.mjs
//
// Kor spelvarlden direkt, utan server och natverk, med en klocka vi stegar
// sjalva. Da gar det att stalla spelarna pa exakta positioner och kontrollera
// precis vem som tar skada - inklusive bakatspolningen som ska gora att det som
// syns pa angriparens skarm ar det som galler.

import { Game } from '../server/game.js';
import { PLAYER, MELEE, TICK_MS, INTERP_MS, MAP, ABILITY_TUNING } from '../shared/constants.js';

const GROUND_Y = MAP.platforms.find((pl) => pl.ground).y - PLAYER.h; // star still pa marken, ingen fysik i vagen

// Melee rullar numera slumpad skada via spelets rng. Scenariona pinnar rng:n sa
// att varje slag ger exakt MELEE_HIT - da gar siffrorna att rakna for hand igen.
// Per landad traff konsumeras tva rng-varden i ordning: forst skaderullningen,
// sedan crit-tarningen. Blockerade och bommade slag konsumerar inget.
const MELEE_ROLL_R = 0.4;
const MELEE_HIT = Math.floor(MELEE.damageMin + MELEE_ROLL_R * (MELEE.damageMax - MELEE.damageMin + 1));

let clock = 100000;

const fails = [];
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FEL '} ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) fails.push(label);
};

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

/** Angripare pa x, motstandare pa fiendeX, bada stillastaende pa marken. */
function scenario({ ax = 400, facing = 1, enemies = [], allies = [] } = {}) {
  clock = 100000;
  // Varannan rng-dragning ar en skaderullning (pinnad till MELEE_ROLL_R), varannan
  // ar crit-tarningen - har alltid 1, sa rng() < CRIT.chance aldrig slar till.
  // Siffrorna blir darmed exakta; crits och combos testas i test/combat.mjs.
  let rngCall = 0;
  const g = new Game({ clock: () => clock, rng: () => (rngCall++ % 2 === 0 ? MELEE_ROLL_R : 1) });

  const a = place(g.addPlayer('Angripare', 'cleo'), ax);
  a.facing = facing;

  const foes = enemies.map((x, i) => place(g.addPlayer(`Fiende${i}`, 'viking'), x));
  const mates = allies.map((x, i) => place(g.addPlayer(`Kompis${i}`, 'cleo'), x));

  // Nagra tick sa att alla har en historik att spola tillbaka i.
  advance(g, 200);
  return { g, a, foes, mates };
}

function place(p, x) {
  p.x = x;
  p.y = GROUND_Y;
  p.vx = 0;
  p.vy = 0;
  p.invulnUntil = 0; // spawnskyddet testas separat
  p.history.length = 0;
  return p;
}

/** Slar och later slaget ga hela vagen fram. */
function swing(g, p) {
  g.action(p, 'm1');
  advance(g, MELEE.windupMs + 40);
}

function cast(g, p, key) {
  g.action(p, key);
  advance(g, 40);
}

const fxOf = (g, kind) => g.fx.filter((f) => f.k === kind);

console.log(`narstrid: ${MELEE.damageMin}-${MELEE.damageMax} skada, rackvidd ${MELEE.reach} fran kroppens mitt\n`);

// --------------------------------------------------------------- geometrin

{
  // Kroppens mitt 415, traffytan nar till 463. Motstandaren tacker 440-470.
  const { g, a, foes } = scenario({ enemies: [440] });
  swing(g, a);
  check('traffar motstandare rakt framfor', foes[0].hp === PLAYER.maxHp - MELEE_HIT, `hp ${foes[0].hp}`);
}

{
  const { g, a, foes } = scenario({ enemies: [470] });
  swing(g, a);
  check('missar motstandare precis utanfor rackhall', foes[0].hp === PLAYER.maxHp, `hp ${foes[0].hp}`);
}

{
  const { g, a, foes } = scenario({ enemies: [350] });
  swing(g, a);
  check('missar motstandare bakom ryggen', foes[0].hp === PLAYER.maxHp, `hp ${foes[0].hp}`);
}

{
  // Star man mitt ovanpa varandra ska slaget garanterat rakna.
  const { g, a, foes } = scenario({ enemies: [400] });
  swing(g, a);
  check('traffar motstandare man star i', foes[0].hp === PLAYER.maxHp - MELEE_HIT, `hp ${foes[0].hp}`);
}

{
  const { g, a, foes } = scenario({ ax: 400, facing: -1, enemies: [360] });
  swing(g, a);
  check('traffar at vanster nar man vetter vanster', foes[0].hp === PLAYER.maxHp - Math.round(MELEE_HIT * 1.5), `hp ${foes[0].hp}`);
}

{
  const { g, a, foes } = scenario({ enemies: [440] });
  g.action(a, 'm2');
  advance(g, MELEE.windupMs + 40);
  check('andra melee-knappen traffar ocksa', foes[0].hp === PLAYER.maxHp - MELEE_HIT, `hp ${foes[0].hp}`);
}

{
  const { g, a, mates } = scenario({ allies: [440] });
  swing(g, a);
  check('skadar inte lagkamrat i rackhall', mates[0].hp === PLAYER.maxHp, `hp ${mates[0].hp}`);
}

{
  // Tva i traffytan: den narmaste tar slaget, den bortre ska inte roras.
  const { g, a, foes } = scenario({ enemies: [452, 432] });
  swing(g, a);
  check(
    'ett slag traffar bara narmaste motstandare',
    foes[1].hp === PLAYER.maxHp - MELEE_HIT && foes[0].hp === PLAYER.maxHp,
    `naramre ${foes[1].hp}, bortre ${foes[0].hp}`,
  );
}

// ------------------------------------------------------------ spawnskyddet

{
  const { g, a, foes } = scenario({ enemies: [440] });
  foes[0].invulnUntil = clock + 1000;
  swing(g, a);
  check('spawnskydd tar bort skadan', foes[0].hp === PLAYER.maxHp, `hp ${foes[0].hp}`);
  check('spawnskydd syns som "skyddad" i stallet for tyst miss', fxOf(g, 'block').length === 1);
}

// ------------------------------------------------------------- tidpunkten

{
  const { g, a, foes } = scenario({ enemies: [440] });
  g.action(a, 'm1');
  advance(g, MELEE.windupMs - 30);
  const during = foes[0].hp;
  advance(g, 60);
  check('skadan kommer nar yxan ar nere, inte vid tangenttrycket', during === PLAYER.maxHp && foes[0].hp < during);
}

{
  const { g, a, foes } = scenario({ enemies: [440] });
  swing(g, a);
  g.action(a, 'm2'); // for tidigt - delar cooldown med forsta melee-knappen
  advance(g, MELEE.windupMs + 40);
  check('cooldown blockerar andra slaget', foes[0].hp === PLAYER.maxHp - MELEE_HIT, `hp ${foes[0].hp}`);
}

// -------------------------------------------------------- bakatspolningen

{
  // Angriparens skarm ligger INTERP_MS efter. Motstandaren stod i rackhall dar,
  // men har hunnit springa ivag i nuet. Slaget ska anda rakna.
  const { g, a, foes } = scenario({ enemies: [440] });
  const b = foes[0];
  b.history = [
    { t: clock - 200, x: 440, y: GROUND_Y },
    { t: clock - INTERP_MS, x: 440, y: GROUND_Y },
    { t: clock, x: 900, y: GROUND_Y },
  ];
  b.x = 900;
  swing(g, a);
  check('traffar dar angriparen sag motstandaren, inte dar han hann ta vagen', b.hp === PLAYER.maxHp - MELEE_HIT, `hp ${b.hp}`);
}

{
  // Motsatsen: pa angriparens skarm var motstandaren langt bort. Da far han
  // inte ta skada bara for att han sprungit in i nuet.
  const { g, a, foes } = scenario({ enemies: [900] });
  const b = foes[0];
  b.history = [
    { t: clock - 200, x: 900, y: GROUND_Y },
    { t: clock - INTERP_MS, x: 900, y: GROUND_Y },
    { t: clock, x: 440, y: GROUND_Y },
  ];
  b.x = 440;
  swing(g, a);
  check('ingen skada pa den som inte syntes i traffytan', b.hp === PLAYER.maxHp, `hp ${b.hp}`);
}

{
  // Efter respawn nollstalls historiken - annars skulle traffkontrollen kunna
  // interpolera langs strackan mellan dodsplatsen och spawnpunkten.
  const { g, foes } = scenario({ enemies: [440] });
  const b = foes[0];
  g.kill(b, 0);
  advance(g, PLAYER.respawnMs + 60);
  const early = g.positionAt(b, clock - 400);
  check('respawn nollstaller positionshistoriken', b.history.length > 0 && early.x === b.history[0].x, `x ${early.x}`);
}

// ------------------------------------------------------------- power shield

{
  const { g, a, foes } = scenario({ enemies: [440] });
  const b = foes[0];
  cast(g, a, 'a3');
  const hpBefore = a.hp;
  const charges = ABILITY_TUNING.powerShield.charges;
  for (let n = charges; n >= 1; n--) {
    b.facing = -1;
    b.x = 432;
    b.history = [
      { t: clock - 200, x: b.x, y: b.y },
      { t: clock, x: b.x, y: b.y },
    ];
    swing(g, b);
    check(`power shield blockerar slag ${charges - n + 1}`, a.hp === hpBefore, `hp ${a.hp}`);
    check(`power shield tappar till ${n - 1} charges`, a.shieldCharges === n - 1, `charges ${a.shieldCharges}`);
    advance(g, MELEE.cooldown + 30);
  }
  b.facing = -1;
  b.x = 432;
  b.history = [
    { t: clock - 200, x: b.x, y: b.y },
    { t: clock, x: b.x, y: b.y },
  ];
  swing(g, b);
  check('traffen efter sista shield gar igenom nar skoldarna ar slut', a.hp === hpBefore - MELEE_HIT, `hp ${a.hp}`);
}

{
  const { g, a, foes } = scenario({ enemies: [470] });
  const b = foes[0];
  b.facing = -1;
  cast(g, a, 'a3');
  advance(g, 12000);
  check('power shield ligger kvar utan timeout', a.shieldCharges === ABILITY_TUNING.powerShield.charges, `charges ${a.shieldCharges}`);
  g.action(b, 'a1');
  advance(g, 220);
  check('power shield blockerar inkommande ability', a.hp === PLAYER.maxHp, `hp ${a.hp}`);
  check('ability forbrukar exakt en shield', a.shieldCharges === ABILITY_TUNING.powerShield.charges - 1, `charges ${a.shieldCharges}`);
}

// ------------------------------------------------------------------ dodsfall

{
  const { g, a, foes } = scenario({ enemies: [440] });
  const b = foes[0];
  let swings = 0;
  while (!b.dead && swings < 40) {
    // Stall tillbaka honom i rackhall efter knuffen. Historiken maste skrivas
    // om ocksa - det ar den bakatspolningen laser, inte b.x.
    b.x = 440;
    b.y = GROUND_Y;
    b.vx = 0;
    b.vy = 0;
    b.history = [
      { t: clock - 300, x: b.x, y: b.y },
      { t: clock, x: b.x, y: b.y },
    ];
    g.action(a, 'm1');
    advance(g, MELEE.cooldown + 20);
    swings++;
  }
  const expected = Math.ceil(PLAYER.maxHp / MELEE_HIT);
  check(`${expected} traffar dodar`, b.dead && swings === expected, `${swings} slag`);
  check('poang till angriparens lag', g.score.cleo === 1, JSON.stringify(g.score));
  check('killfeed far med bade offer och drapare', g.feed.at(-1)?.victim === 'Fiende0' && g.feed.at(-1)?.killer === 'Angripare');
}

console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA TESTER OK');
process.exit(fails.length ? 1 : 0);
