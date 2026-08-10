// Plattformar: drop-through pa one-way-plattformar.

import { Game } from '../server/game.js';
import { MAP, PLAYER, TICK_MS } from '../shared/constants.js';

const top = MAP.platforms.find((pl) => pl.x === 0 && pl.y === 383);
const mid = MAP.platforms.find((pl) => pl.x === 676 && pl.y === 607);
const ground = MAP.platforms.find((pl) => pl.ground);

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

function until(g, pred, ms = 3000) {
  const end = clock + ms;
  while (clock < end) {
    if (pred()) return true;
    advance(g, TICK_MS);
  }
  return pred();
}

function standOn(p, pl, x = 700) {
  p.x = x;
  p.y = pl.y - PLAYER.h;
  p.vx = 0;
  p.vy = 0;
  p.onGround = true;
  p.invulnUntil = 0;
  p.history.length = 0;
}

function isOn(p, pl) {
  return p.onGround && Math.abs(p.y - (pl.y - PLAYER.h)) < 0.001;
}

const game = new Game({ clock: () => clock, rng: () => 1 });
const player = game.addPlayer('Dropper', 'cleo');

standOn(player, top);
game.action(player, 'drop');
check('pil ned slapper plattformen', !player.onGround && player.vy > 0);
check('landar pa nasta plattformen', until(game, () => isOn(player, mid)), `y ${player.y}`);

game.action(player, 'drop');
check('andra trycket slapper nasta plattform', !player.onGround && player.vy > 0);
check('landar pa marken efter sista droppet', until(game, () => isOn(player, ground)), `y ${player.y}`);

const groundY = player.y;
game.action(player, 'drop');
advance(game, 250);
check('marken gar inte att droppa igenom', isOn(player, ground) && player.y === groundY, `y ${player.y}`);

console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA PLATTFORMS-TESTER OK');
process.exit(fails.length ? 1 : 0);
