// Powerups: servern ager spawn, maxgrans, lakning (pizza) och skadebuff (kebab).

import { Game } from '../server/game.js';
import { PLAYER, POWERUP, DAMAGE_BUFF } from '../shared/constants.js';

let clock = 100000;
const game = new Game({ clock: () => clock, rng: () => 1 }); // rng: aldrig crit, sa att skadan blir exakt

const fails = [];
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FEL '} ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) fails.push(label);
};

function stepTo(t) {
  clock = t;
  game.update();
}

/** Stallar spelaren mitt i powerupen sa att nasta tick plockar upp den. */
function standOn(player, pu) {
  player.x = pu.x - PLAYER.w / 2;
  player.y = pu.y - PLAYER.h / 2;
  player.vx = 0;
  player.vy = 0;
}

stepTo(100000 + POWERUP.firstSpawnMs - 1);
check('ingen powerup innan forsta spawn-tiden', game.powerups.length === 0);

stepTo(100000 + POWERUP.firstSpawnMs);
check('forsta powerupen spawnar', game.powerups.length === 1);
check('powerupen har en sort', ['pizza', 'kebab'].includes(game.powerups[0].kind), game.powerups[0].kind);

for (let i = 0; i < POWERUP.maxActive + 2; i++) {
  stepTo(clock + POWERUP.spawnIntervalMs);
}

check('aldrig fler an tre powerups ute samtidigt', game.powerups.length === POWERUP.maxActive, `${game.powerups.length} aktiva`);
check('powerups delar inte spawnpunkt', new Set(game.powerups.map((p) => p.spawn)).size === game.powerups.length);

// ------------------------------------------------------------------- pizza

const player = game.addPlayer('Hungrig', 'cleo');
const pizza = game.powerups[0];
pizza.kind = 'pizza';
standOn(player, pizza);
player.hp = 30;
game.fx.length = 0;

stepTo(clock + 16);
check('skadad spelare plockar pizza', game.powerups.length === POWERUP.maxActive - 1);
check('pizza ger 45 hp', player.hp === 75, `hp ${player.hp}`);
check('pizza skickar visuell effekt', game.fx.some((fx) => fx.k === 'pizza' && fx.id === player.id));

stepTo(clock + POWERUP.spawnIntervalMs - 32);
check('ny powerup kommer inte direkt efter upplock', game.powerups.length === POWERUP.maxActive - 1);

const stillThere = game.powerups[0];
stillThere.kind = 'pizza';
standOn(player, stillThere);
player.hp = PLAYER.maxHp;
game.fx.length = 0;

stepTo(clock + 16);
check('full hp plockar inte upp pizza', game.powerups.some((p) => p.id === stillThere.id));
check('ingen pizza-effekt vid full hp', !game.fx.some((fx) => fx.k === 'pizza'));

// ------------------------------------------------------------------- kebab

const kebab = game.powerups[0];
kebab.kind = 'kebab';
standOn(player, kebab);
player.hp = PLAYER.maxHp;
game.fx.length = 0;

stepTo(clock + 16);
check('full hp plockar upp kebab', !game.powerups.some((p) => p.id === kebab.id));
check('kebab skickar visuell effekt', game.fx.some((fx) => fx.k === 'kebab' && fx.id === player.id));
check('kebab satter buff i 15 s', player.dmgBuffUntil === clock + DAMAGE_BUFF.durationMs, `${player.dmgBuffUntil - clock} ms`);
check('buffen syns i ognapsbilden', game.snapshot().players.find((p) => p.i === player.id).db === DAMAGE_BUFF.durationMs);

// Skadan: samma slag med och utan buff. Angriparen star framfor sitt offer sa
// att ryggtraffens 50 %-bonus inte blandar sig i.
const victim = game.addPlayer('Offer', 'viking');
victim.facing = 1;
victim.x = 400;
victim.y = 400;
player.x = victim.x + 40;
player.y = victim.y;
player.invulnUntil = 0;
victim.invulnUntil = 0;
victim.hp = PLAYER.maxHp;

game.damage(victim, player, 10, 0, 0, clock);
check('kebab ger 15% mer skada', victim.hp === PLAYER.maxHp - 12, `${PLAYER.maxHp - victim.hp} skada`);

// Efter 15 sekunder ar buffen slut och skadan tillbaka pa normal niva.
clock += DAMAGE_BUFF.durationMs;
victim.hp = PLAYER.maxHp;
game.damage(victim, player, 10, 0, 0, clock);
check('buffen tar slut efter 15 s', victim.hp === PLAYER.maxHp - 10, `${PLAYER.maxHp - victim.hp} skada`);

// Doden tar med sig buffen.
player.dmgBuffUntil = clock + DAMAGE_BUFF.durationMs;
game.kill(player, victim.id);
game.spawn(player);
check('buffen forsvinner vid respawn', player.dmgBuffUntil === 0);

console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA POWERUP-TESTER OK');
process.exit(fails.length ? 1 : 0);
