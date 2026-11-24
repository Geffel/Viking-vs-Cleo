// Movement prototype: acceleration, directional inertia and jump recovery.

import { Game } from '../server/game.js';
import { MAP, PLAYER, TICK_MS } from '../shared/constants.js';

const ground = MAP.platforms.find((platform) => platform.ground);
let clock = 100000;
const fails = [];

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FEL '} ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) fails.push(label);
};

function standOn(player, platform = ground) {
  player.x = 700;
  player.y = platform.y - PLAYER.h;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.nextJumpAt = 0;
}

const game = new Game({ clock: () => clock, rng: () => 1 });
const player = game.addPlayer('Mover', 'cleo');

standOn(player);
player.input.right = true;
game.movePlayer(player, clock);
check('markfart byggs upp gradvis', player.vx === PLAYER.accel && player.vx < PLAYER.maxSpeed, `vx ${player.vx}`);

player.vx = PLAYER.maxSpeed;
player.input.right = false;
player.input.left = true;
game.movePlayer(player, clock);
check('riktningsbyte behaller momentum forsta ticken', player.vx > 0, `vx ${player.vx}`);
check(
  'riktningsbyte anvander lagre acceleration',
  player.vx === PLAYER.maxSpeed - PLAYER.accel * PLAYER.reverseAccelMul,
  `vx ${player.vx}`,
);

standOn(player);
player.onGround = false;
player.input.left = false;
player.input.right = true;
game.movePlayer(player, clock);
check('luftkontroll ar svagare an markacceleration', player.vx === PLAYER.airAccel, `vx ${player.vx}`);

standOn(player);
game.action(player, 'jump');
check('forsta hoppet fungerar direkt', player.vy === PLAYER.jumpVel && !player.onGround);

// Simulate a landing and verify that standing on the platform does not keep
// extending the recovery window every tick.
player.y = ground.y - PLAYER.h;
player.vy = 1;
player.onGround = false;
clock += TICK_MS;
game.movePlayer(player, clock);
const readyAt = player.nextJumpAt;
check('landning startar hoppaaterhamtning', player.onGround && readyAt === clock + PLAYER.jumpRecoveryMs);

game.action(player, 'jump');
check('nytt hopp blockeras direkt efter landning', player.onGround && player.vy === 0);

clock += TICK_MS;
game.movePlayer(player, clock);
check('aterhamtningen forlangs inte medan man star still', player.nextJumpAt === readyAt);

clock = readyAt;
game.action(player, 'jump');
check('hopp fungerar igen efter aterhamtningen', !player.onGround && player.vy === PLAYER.jumpVel);

console.log('');
console.log(fails.length ? `${fails.length} TEST MISSLYCKADES: ${fails.join(', ')}` : 'ALLA MOVEMENT-TESTER OK');
process.exit(fails.length ? 1 : 0);
