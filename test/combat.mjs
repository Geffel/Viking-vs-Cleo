// Crits och combos: node test/combat.mjs
//
// Samma upplagg som hitreg.mjs - spelvarlden korr direkt med en klocka vi
// stegar sjalva. Har byts dessutom slumpen ut, sa att en kritisk traff antingen
// ar garanterad eller omojlig. Da gar varje siffra att rakna ut for hand.

import { Game } from '../server/game.js';
import { PLAYER, MELEE, TICK_MS, MAP, COMBO, CRIT, ENRAGE, DAMAGE_BUFF } from '../shared/constants.js';

const GROUND_Y = MAP.platforms.find((pl) => pl.ground).y - PLAYER.h;
const CRUSHER = COMBO.list.find((c) => c.id === 'crusher');

// Melee rullar slumpad skada via rng:n. scenario() pinnar rng:n sa att varje
// slag ger exakt MELEE_HIT, och da kan combo- och crit-siffrorna raknas for
// hand. Per landad traff dras tva rng-varden: forst skadan (pinnad till
// MELEE_ROLL_R), sedan crit-tarningen.
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

/**
 * Angripare pa 400 vand at hoger, offer pa 440 vand mot honom - inom rackhall
 * och utan att ryggtraffen blandar sig i.
 *
 * crit: true tvingar fram kritisk traff pa varje slag, false stanger av dem.
 */
function scenario({ crit = false } = {}) {
  clock = 100000;
  // Varannan rng-dragning ar skaderullningen (pinnad), varannan ar crit-tarningen.
  // crit: true tvingar fram crit (0 < CRIT.chance), false stanger av den (1).
  const critVal = crit ? 0 : 1;
  let rngCall = 0;
  const g = new Game({ clock: () => clock, rng: () => (rngCall++ % 2 === 0 ? MELEE_ROLL_R : critVal) });

  const a = place(g.addPlayer('Angripare', 'cleo'), 400);
  a.facing = 1;
  const b = place(g.addPlayer('Offer', 'viking'), 440);
  b.facing = -1;

  advance(g, 200);
  return { g, a, b };
}

function place(p, x) {
  p.x = x;
  p.y = GROUND_Y;
  p.vx = 0;
  p.vy = 0;
  p.invulnUntil = 0;
  p.history.length = 0;
  return p;
}

// Matvarden fran den senaste traffen, tagna direkt nar slaget landade - efterat
// hinner gravitationen andra farten och nasta hit() stalla tillbaka offret.
const probe = { dmg: 0, vx: 0, vy: 0, healerHp: 0, cdLeft: 0 };

/**
 * Ett slag som traffar. Offret stalls tillbaka i rackhall forst - knuffen fran
 * forra slaget skulle annars ha flyttat honom - och historiken skrivs om, for
 * det ar den traffkontrollen laser.
 */
function hit(g, a, b, slot) {
  b.x = 440;
  b.y = GROUND_Y;
  b.vx = 0;
  b.vy = 0;
  b.history = [
    { t: clock - 300, x: b.x, y: b.y },
    { t: clock, x: b.x, y: b.y },
  ];
  const before = b.hp;
  g.action(a, slot);
  advance(g, MELEE.windupMs + 40);

  probe.dmg = before - b.hp;
  probe.vx = b.vx;
  probe.vy = b.vy;
  probe.healerHp = a.hp;
  probe.cdLeft = Math.max(0, a.cd.m1 - clock);

  advance(g, MELEE.cooldown); // vanta ut cooldownen sa att nasta slag gar fram
  return probe.dmg;
}

/** Ett slag rakt ut i tomma luften: offret flyttas utom rackhall. */
function whiff(g, a, b, slot) {
  b.x = 900;
  b.history = [
    { t: clock - 300, x: b.x, y: b.y },
    { t: clock, x: b.x, y: b.y },
  ];
  g.action(a, slot);
  advance(g, MELEE.windupMs + 40);
  advance(g, MELEE.cooldown);
}

const seq = CRUSHER.seq;
const finisher = Math.round(MELEE_HIT * CRUSHER.finisherMul);

console.log(`crit: ${Math.round(CRIT.chance * 100)} % chans, ${CRIT.mul}x skada`);
console.log(`combo ${CRUSHER.name}: ${seq.join(' ')}, finisher ${CRUSHER.finisherMul}x\n`);

// ------------------------------------------------------------------- crits

{
  const { g, a, b } = scenario({ crit: false });
  check('utan crit gor slaget normal skada', hit(g, a, b, 'm1') === MELEE_HIT);
}

{
  const { g, a, b } = scenario({ crit: true });
  const dmg = hit(g, a, b, 'm1');
  check('crit gor 50 % mer skada', dmg === Math.round(MELEE_HIT * CRIT.mul), `${dmg} skada`);
  check('crit markeras i fx sa att klienten kan visa det', g.fx.some((f) => f.k === 'hit' && f.cr === 1));
}

{
  // Slumpen ska ligga i rimlig narhet av 15 % over manga slag. Sekvensen ar
  // fast (ingen riktig slump), sa testet kan inte flaxa.
  let rolls = 0;
  const g = new Game({ clock: () => clock, rng: () => ((rolls++ * 0.07) % 1) });
  const a = place(g.addPlayer('A', 'cleo'), 400);
  const b = place(g.addPlayer('B', 'viking'), 440);
  a.facing = 1;
  b.facing = -1;
  let crits = 0;
  for (let i = 0; i < 100; i++) {
    b.hp = PLAYER.maxHp;
    g.fx.length = 0;
    g.damage(b, a, MELEE_HIT, 0, 0, clock);
    if (g.fx.some((f) => f.k === 'hit' && f.cr === 1)) crits++;
  }
  check('chansen ligger kring 15 %', crits >= 10 && crits <= 20, `${crits} crits pa 100 slag`);
}

{
  // Crit ligger sist av alla multiplikatorer: 10 -> 15 (rygg) -> 22 (crit).
  const { g, a, b } = scenario({ crit: true });
  b.facing = 1; // vand bort ryggen mot angriparen
  b.history = [
    { t: clock - 300, x: b.x, y: b.y },
    { t: clock, x: b.x, y: b.y },
  ];
  const before = b.hp;
  g.action(a, 'm1');
  advance(g, MELEE.windupMs + 40);
  const expected = Math.round(Math.round(MELEE_HIT * 1.5) * CRIT.mul);
  check('crit staplas ovanpa ryggtraffen', before - b.hp === expected, `${before - b.hp} skada, vantade ${expected}`);
}

// ------------------------------------------------------------------ combos

{
  const { g, a, b } = scenario();
  const dmg = seq.map((slot) => hit(g, a, b, slot));
  check(
    `${seq.join(' ')} ger bonus pa sista slaget`,
    dmg.slice(0, -1).every((d) => d === MELEE_HIT) && dmg.at(-1) === finisher,
    dmg.join(' + '),
  );
}

// Varje combo i listan: hela kedjan igenom, med sin egen finisher-effekt.
for (const combo of COMBO.list) {
  const { g, a, b } = scenario();
  a.hp = PLAYER.maxHp - 100; // utrymme att lakas, for combos som ger tillbaka hp
  const dmg = combo.seq.map((slot) => hit(g, a, b, slot));
  const want = Math.round(MELEE_HIT * combo.finisherMul);
  const label = combo.seq.map((slot) => (slot === 'm1' ? 'Q' : 'E')).join(' ');

  check(
    `${combo.name} (${label}) gar hela vagen`,
    dmg.slice(0, -1).every((d) => d === MELEE_HIT) && dmg.at(-1) === want,
    dmg.join(' + '),
  );
  check(`${combo.name} syns i fx`, g.fx.some((f) => f.k === 'combo' && f.name === combo.name));

  if (combo.knockback) {
    // Farten mats nagra tick efter smallen, sa gravitationen har redan hunnit
    // ata av den. Marginalen ar just de ticken.
    const slack = PLAYER.gravity * 4;
    check(
      `${combo.name} kastar offret uppat`,
      probe.vy <= combo.knockback.y + slack && probe.vy < MELEE.knockbackY,
      `vy ${probe.vy.toFixed(1)}, vantade ~${combo.knockback.y}`,
    );
  }
  if (combo.healSelf) {
    check(
      `${combo.name} lakar angriparen ${combo.healSelf}`,
      probe.healerHp === PLAYER.maxHp - 100 + combo.healSelf,
      `hp ${probe.healerHp}`,
    );
    check(`${combo.name} skickar heal-fx`, g.fx.some((f) => f.k === 'heal' && f.id === a.id));
  }
  if (combo.refundCooldown) {
    check(`${combo.name} gor melee redo direkt`, probe.cdLeft === 0, `${probe.cdLeft} ms kvar`);
  } else {
    check(`${combo.name} ger ingen gratis cooldown`, probe.cdLeft > 0, `${probe.cdLeft} ms kvar`);
  }
  if (combo.stunMs) {
    check(`${combo.name} stunnar offret`, b.stunnedUntil > clock, `${Math.round(b.stunnedUntil - clock)} ms kvar`);
  }
}

{
  // Lakningen far inte ta angriparen over max.
  const healer = COMBO.list.find((c) => c.healSelf);
  if (healer) {
    const { g, a, b } = scenario();
    a.hp = PLAYER.maxHp;
    healer.seq.forEach((slot) => hit(g, a, b, slot));
    check(`${healer.name} lakar inte over max`, a.hp === PLAYER.maxHp, `hp ${a.hp}`);
  }
}

{
  // Invarianten som halier hela listan spelbar: ligger en combo mitt i borjan
  // pa en annan gar den korta av forst och nollstaller kedjan - da gar den
  // langa aldrig att fa till.
  const shadowed = [];
  for (const a of COMBO.list) {
    for (const b of COMBO.list) {
      if (a === b) continue;
      for (let k = a.seq.length; k < b.seq.length; k++) {
        if (b.seq.slice(k - a.seq.length, k).join(' ') === a.seq.join(' ')) shadowed.push(`${a.name} skuggar ${b.name}`);
      }
    }
  }
  check('ingen combo gor en annan omojlig att na', shadowed.length === 0, shadowed.join('; '));

  const seqs = COMBO.list.map((c) => c.seq.join(' '));
  check('inga tva combos har samma sekvens', new Set(seqs).size === seqs.length);
  check('alla combos anvander bada melee-knapparna', COMBO.list.every((c) => new Set(c.seq).size === 2));
}

{
  const { g, a, b } = scenario();
  seq.forEach((slot) => hit(g, a, b, slot));
  check('combon syns som traff i fx', g.fx.some((f) => f.k === 'combo' && f.name === CRUSHER.name));
}

{
  // Fel ordning: m2 forst i stallet for m1.
  const { g, a, b } = scenario();
  const wrong = ['m2', 'm1', 'm2', 'm1'];
  const dmg = wrong.map((slot) => hit(g, a, b, slot));
  check('fel ordning ger ingen bonus', dmg.every((d) => d === MELEE_HIT), dmg.join(' + '));
}

{
  // Ett bommat slag mitt i kedjan bryter den.
  const { g, a, b } = scenario();
  hit(g, a, b, 'm1');
  hit(g, a, b, 'm1');
  whiff(g, a, b, 'm2');
  const last = hit(g, a, b, 'm1');
  check('bommat slag bryter kedjan', last === MELEE_HIT, `${last} skada`);
}

{
  // For lang paus mellan tva traffar: kedjan hinner rinna ut.
  const { g, a, b } = scenario();
  hit(g, a, b, 'm1');
  hit(g, a, b, 'm1');
  hit(g, a, b, 'm2');
  advance(g, COMBO.windowMs + 100);
  const last = hit(g, a, b, 'm1');
  check('for lang paus bryter kedjan', last === MELEE_HIT, `${last} skada`);
}

{
  // Inom fonstret ska pausen daremot inte gora nagot.
  const { g, a, b } = scenario();
  hit(g, a, b, 'm1');
  hit(g, a, b, 'm1');
  hit(g, a, b, 'm2');
  // Pausen mats fran traffen, och bade cooldownen efter forra slaget och
  // uppdraget pa nasta ater av fonstret - darav marginalen.
  advance(g, COMBO.windowMs - 600);
  const last = hit(g, a, b, 'm1');
  check('paus inom fonstret bryter inte kedjan', last === finisher, `${last} skada`);
}

{
  // Tva combos i rad: kedjan nollstalls efter finishern, sa nasta varv maste
  // koras hela vagen igen.
  const { g, a, b } = scenario();
  seq.forEach((slot) => hit(g, a, b, slot));
  const second = seq.map((slot) => hit(g, a, b, slot));
  check(
    'ny kedja borjar om efter finishern',
    second.slice(0, -1).every((d) => d === MELEE_HIT) && second.at(-1) === finisher,
    second.join(' + '),
  );
}

{
  const { g, a, b } = scenario({ crit: true });
  const dmg = seq.map((slot) => hit(g, a, b, slot));
  const expected = Math.round(finisher * CRIT.mul);
  check('crit pa finishern staplas', dmg.at(-1) === expected, `${dmg.at(-1)} skada, vantade ${expected}`);
}

{
  // Doden nollstaller kedjan - man far inte spara halva combon over en respawn.
  const { g, a, b } = scenario();
  hit(g, a, b, 'm1');
  hit(g, a, b, 'm1');
  hit(g, a, b, 'm2');
  g.kill(a, b.id);
  advance(g, PLAYER.respawnMs + 60);
  // Tillbaka pa plats efter respawnen: historiken maste nollstallas ocksa,
  // annars slar han fran spawnpunkten dar han just stod.
  place(a, 400);
  a.facing = 1;
  const last = hit(g, a, b, 'm1');
  check('kedjan overlever inte doden', last === MELEE_HIT, `${last} skada`);
}

// -------------------------------------------------------------- combo-ursinne

{
  // Landar man dodsstoten med en combo-finisher gar man in i ursinne (ENRAGED):
  // en global buff pa +50 % utdelad skada i 5 sekunder.
  const { g, a, b } = scenario();
  b.hp = 3 * MELEE_HIT + 1; // overlever de tre forsta slagen, dor pa finishern
  g.fx.length = 0;
  seq.forEach((slot) => hit(g, a, b, slot));
  check('combo-finishern tar dodsstoten', b.dead);
  check('combo-dodsstoten gor angriparen enraged', a.rageUntil > clock, `${Math.round(a.rageUntil - clock)} ms kvar`);
  check('ursinnet varar som mest ENRAGE.durationMs', a.rageUntil <= clock + ENRAGE.durationMs);
  check('ursinnet syns i fx', g.fx.some((f) => f.k === 'enrage' && f.id === a.id));
}

{
  // En vanlig dodsstot UTAN combo ger inget ursinne - bonusen ska kosta en hel
  // kedja.
  const { g, a, b } = scenario();
  b.hp = MELEE_HIT; // dor pa ett enda slag
  g.fx.length = 0;
  hit(g, a, b, 'm1');
  check('vanlig dodsstot ger inget ursinne', b.dead && a.rageUntil === 0);
  check('ingen enrage-fx utan combo', !g.fx.some((f) => f.k === 'enrage'));
}

{
  // Sjalva multiplikatorn: samma slag med ursinnet pa gor 50 % mer, och det
  // staplas ovanpa kebaben precis som berserken. Egen klocka och rng utan crit,
  // sa att siffran gar att rakna for hand.
  let clk = 100000;
  const g = new Game({ clock: () => clk, rng: () => 1 });
  const a = place(g.addPlayer('A', 'cleo'), 400);
  a.facing = 1;
  const b = place(g.addPlayer('B', 'viking'), 440);
  b.facing = -1; // vand mot angriparen, sa ryggtraffen inte blandar sig i

  b.hp = PLAYER.maxHp;
  a.rageUntil = clk + ENRAGE.durationMs;
  g.damage(b, a, 10, 0, 0, clk);
  check('ursinnet ger 50 % mer skada', b.hp === PLAYER.maxHp - 15, `${PLAYER.maxHp - b.hp} skada`);

  b.hp = PLAYER.maxHp;
  a.dmgBuffUntil = clk + DAMAGE_BUFF.durationMs; // 10 -> 12 (kebab) -> 18 (ursinne)
  g.damage(b, a, 10, 0, 0, clk);
  check('ursinnet staplas ovanpa kebaben', b.hp === PLAYER.maxHp - 18, `${PLAYER.maxHp - b.hp} skada`);
}

{
  // Buffen foljer med i ognapsbilden sa att klienten kan rita blinket och auran.
  const { g, a } = scenario();
  a.rageUntil = clock + ENRAGE.durationMs;
  const me = g.snapshot().players.find((p) => p.i === a.id);
  check('ursinnet syns i ognapsbilden', me.rg > 0 && me.rg <= ENRAGE.durationMs, `rg ${me.rg}`);
}

{
  // Doden tar med sig ursinnet - man vaknar lugn.
  const { g, a, b } = scenario();
  a.rageUntil = clock + ENRAGE.durationMs;
  g.kill(a, b.id);
  g.spawn(a);
  check('ursinnet forsvinner vid respawn', a.rageUntil === 0);
}

// --------------------------------------------------------------- ognapsbild

{
  const { g, a, b } = scenario();
  hit(g, a, b, 'm1');
  hit(g, a, b, 'm1');
  const me = g.snapshot().players.find((p) => p.i === a.id);
  check('ognapsbilden bar med sig combons steg', me.cb === COMBO.list.indexOf(CRUSHER) && me.cs === 2, `cb ${me.cb}, cs ${me.cs}`);
  check('ognapsbilden bar med sig tiden som ar kvar', me.cw > 0 && me.cw <= COMBO.windowMs, `cw ${me.cw}`);
}

{
  const { g, a, b } = scenario();
  hit(g, a, b, 'm1');
  advance(g, COMBO.windowMs + 100);
  const me = g.snapshot().players.find((p) => p.i === a.id);
  check('utrunnen kedja visas inte langre', me.cb === -1 && me.cs === 0, `cb ${me.cb}, cs ${me.cs}`);
}

console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA TESTER OK');
process.exit(fails.length ? 1 : 0);
