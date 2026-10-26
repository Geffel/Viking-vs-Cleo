import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Game } from '../server/game.js';
import * as constants from '../shared/constants.js';
import * as sampling from '../shared/netcode.js';
import { parseClientMessage, MAX_MESSAGE_BYTES } from '../server/protocol.js';

const { PLAYER, MELEE, INTERP_MS, TICK_MS, LAGCOMP } = constants;
const netSource = fs.readFileSync(new URL('../public/js/net.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export \{.*\};\r?\n/gm, '')
  .replace('export class Net', 'class Net');
function client(clock) {
  const context = vm.createContext({ ...constants, ...sampling, performance: { now: clock },
    Date, TextEncoder, WebSocket: { OPEN: 1 }, setTimeout: () => 0, clearTimeout() {} });
  return vm.runInContext(`${netSource}\nnew Net()`, context);
}

for (const value of [null, [], 1, true, 'move', {}, { t: null }, { t: 'toString' },
  { t: 'move', l: {}, r: false }, { t: 'act', a: 'missing' }, { t: 'act', a: 'm1', view: null },
  { t: 'identify', name: {} }, { t: 'setReady', ready: 'false' },
  { t: 'wakeLocalSeat', inputDevice: { type: 'gamepad', index: {} } }]) {
  assert.equal(parseClientMessage(JSON.stringify(value)), null, JSON.stringify(value));
}
assert.equal(parseClientMessage('{'), null);
assert.equal(parseClientMessage(' '.repeat(MAX_MESSAGE_BYTES + 1)), null);
assert.equal(parseClientMessage(Buffer.from('{"t":"leave"}'), true), null);
for (const value of [{ t: 'move', l: false, r: true }, { t: 'act', a: 'm1', seatId: 'P2' },
  { t: 'join', name: 'Guest', team: 'cleo' }, { t: 'setReady', ready: false }]) {
  assert.deepEqual(parseClientMessage(JSON.stringify(value)), value);
}

// Execute the real client sampler/sender and authoritative Game against a
// deterministic network timeline, including unequal snapshot arrival gaps.
for (const rtt of [0, 30, 60, 100, 150]) {
  for (const jitter of [false, true]) {
    let time = 100000;
    let clientTime = time;
    const g = new Game({ clock: () => time, rng: () => 0.5 });
    const a = g.addPlayer('A', 'cleo');
    const b = g.addPlayer('B', 'viking');
    a.invulnUntil = b.invulnUntil = 0;
    a.halfRtt = rtt / 2;
    const net = client(() => clientTime);
    net.selfId = a.id;
    let sent;
    net.ws = { readyState: 1, send: (text) => { sent = JSON.parse(text); } };
    for (let i = 0; i < 8; i++) {
      time = 100000 + i * (1000 / 30);
      g.tick += 2;
      a.x = 400 + i * 2; a.y = 300; a.vx = 1; a.vy = 0; a.facing = 1;
      b.x = 450 + i * 2; b.y = 300; b.vx = 1; b.vy = 0;
      const snap = g.snapshot();
      assert.equal(snap.simTime, time, 'snapshot needs authoritative simulation time');
      clientTime = time + rtt / 2 + (jitter && i % 2 ? 12 : 0);
      net.onState(snap);
    }
    clientTime += 10;
    const visible = net.sample();
    const visibleA = visible.find((p) => p.i === a.id);
    const visibleB = visible.find((p) => p.i === b.id);
    // The key event must reference the last DRAWN frame, even if a newer packet arrives.
    const drawnView = JSON.stringify(net.lastView);
    time += TICK_MS; g.tick++;
    net.onState(g.snapshot());
    net.send({ t: 'act', a: 'm1' });
    assert.equal(JSON.stringify(sent.view), drawnView);
    assert.ok(parseClientMessage(JSON.stringify(sent)), 'client view passes the wire validator');
    time = clientTime + rtt / 2;
    b.x = 900; a.x = 800; a.facing = -1;
    g.action(a, 'm1', sent.view);
    assert.ok(a.swing, `accepted view at RTT ${rtt}, jitter ${jitter}`);
    assert.equal(a.swing.box.x, visibleA.x, 'attack originates at rendered self');
    assert.equal(a.swing.viewPlayers.get(b.id).x, visibleB.x, 'hit test matches rendered opponent');
    time += MELEE.windupMs + 1;
    g.resolveSwing(a, time);
    assert.ok(b.hp < PLAYER.maxHp, 'visible hit lands even after opponent moves away');
    assert.ok(b.vx > 0, 'knockback follows the facing at attack time');
  }
}
function fixture() {
  let time = 200000;
  const game = new Game({ clock: () => time, rng: () => 0.5 });
  const a = game.addPlayer('A', 'cleo');
  const b = game.addPlayer('B', 'viking');
  a.x = 400; b.x = 450; a.y = b.y = 300;
  a.invulnUntil = b.invulnUntil = 0;
  const frame = game.snapshot();
  const view = { game: frame.gameId, a: frame.seq, b: frame.seq, self: frame.seq, alpha: 0, extrapMs: 0 };
  return { game, a, b, view, advance: (ms) => { time += ms; } };
}

for (const change of [
  { game: -1 }, { game: 999999 }, { a: 99999 }, { b: 99999 }, { self: 99999 },
  { alpha: -0.01 }, { alpha: 1.01 }, { alpha: NaN }, { extrapMs: 51 }, { extrapMs: -1 },
  { extrapMs: 40 }, // valid numeric range, but would project into the server's future
]) {
  const f = fixture();
  f.game.action(f.a, 'm1', { ...f.view, ...change });
  assert.equal(f.a.swing, null, 'reject forged view ' + JSON.stringify(change));
  assert.equal(f.a.cd.m1, 0, 'rejected input does not consume cooldown');
}
{
  const f = fixture();
  f.advance(LAGCOMP.maxRewindMs + 1);
  f.game.action(f.a, 'm1', f.view);
  assert.equal(f.a.swing, null, 'cannot attack against an ancient frozen screen');
  f.game.reset();
  assert.equal(f.game.viewHistory.size, 0);
  assert.notEqual(f.game.gameId, f.view.game, 'a new round has a new view identity');
}
{
  const f = fixture();
  f.game.action(f.a, 'm1', f.view);
  f.game.resetPlayerAt(f.b, { x: 450, y: 300 });
  f.b.invulnUntil = 0;
  f.advance(MELEE.windupMs + 1);
  f.game.resolveSwing(f.a, f.game.now());
  assert.equal(f.b.hp, PLAYER.maxHp, 'old-life attack cannot damage a respawn');
}
{
  const f = fixture();
  f.game.resetPlayerAt(f.a, { x: 400, y: 300 });
  f.game.action(f.a, 'm1', f.view);
  assert.equal(f.a.swing, null, 'attacker cannot use its own previous life');
}
{
  const f = fixture();
  f.b.x = 900;
  const snap = f.game.snapshot();
  const view = { ...f.view, a: snap.seq, b: snap.seq, self: snap.seq };
  f.b.x = 450;
  f.game.action(f.a, 'm1', view);
  f.advance(MELEE.windupMs + 1);
  f.game.resolveSwing(f.a, f.game.now());
  assert.equal(f.b.hp, PLAYER.maxHp, 'no hit on someone who was outside the visible box');
}
{
  const f = fixture();
  f.b.vx = 5;
  const snap = f.game.snapshot();
  const view = { ...f.view, a: snap.seq, b: snap.seq, self: snap.seq, extrapMs: 40 };
  f.advance(40);
  f.game.action(f.a, 'm1', view, [f.a.id, f.b.id]);
  assert.equal(f.a.swing.viewPlayers.get(f.b.id).x, 462, 'shared-screen opponents use local extrapolation too');
}
{
  let now = 1000;
  const net = client(() => now);
  const frame = (seq, simTime, x) => ({ t: 'state', gameId: 1, seq, simTime, tick: seq * 2,
    players: [{ i: 1, x, y: 0, f: 1, life: 1 }], pr: [], pu: [], fx: [], feed: [], score: {} });
  net.onState(frame(1, 100, 0));
  now = 1040; net.onState(frame(2, 133.333, 10));
  now = 1070; net.onState(frame(3, 166.666, 20));
  now = 1075;
  assert.ok(Math.abs(net.sample()[0].x - 7.5) < 0.01, 'interpolation uses send times, not jittered arrival gaps');
  now += 500;
  assert.equal(net.sample()[0].x, 20, 'packet stalls freeze remote players at the latest known state');
  net.clearLiveGame();
  assert.equal(net.lastView, null);
  assert.equal(net.pendingFx.length, 0);
}
{
  const f = fixture();
  for (let i = 0; i < 120; i++) { f.advance(TICK_MS); f.game.snapshot(); }
  assert.ok(f.game.viewHistory.size <= Math.ceil(LAGCOMP.historyMs / TICK_MS) + 1, 'snapshot history stays bounded');
}
console.log('NETCODE TESTS OK: 0-150 ms RTT, jitter, hit/miss geometry, stale/forged views, respawns and shared screen');
