import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startTestServer } from './test-server.mjs';
import { MAX_MESSAGE_BYTES } from '../server/protocol.js';
import { MAPS, MATCH_MODES, MATCH_PHASES } from '../shared/constants.js';

const server = await startTestServer({
  authenticatedProfiles: ['Protocol test'],
  env: { VVC_PERFORMANCE_ENABLED: '1' },
});
const sockets = [];
function connect(cookie = server.authCookies[0], origin = server.origin, url = server.url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } });
    sockets.push(ws);
    ws.on('error', reject);
    ws.once('open', () => resolve(ws));
  });
}
function message(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', receive); reject(new Error('Server stopped responding')); }, 4000);
    function receive(raw) {
      const value = JSON.parse(raw);
      if (predicate(value)) { clearTimeout(timer); ws.off('message', receive); resolve(value); }
    }
    ws.on('message', receive);
  });
}
try {
  const performancePage = await fetch(`${server.origin}/performance-test`);
  assert.equal(performancePage.status, 200);
  assert.match(performancePage.headers.get('cache-control') ?? '', /no-store/);
  assert.match(await performancePage.text(), /\/js\/main\.js\?v=4/);

  assert.equal(await rejectedUpgrade('', server.origin), 401, 'a handwritten anonymous WebSocket is rejected');
  assert.equal(await rejectedUpgrade(server.authCookies[0], 'https://attacker.invalid'), 403,
    'a valid cookie cannot be used from a foreign origin');

  const performance = await connect('', server.origin, `${server.url}/performance-test`);
  const performanceIdentity = message(performance, (m) => m.t === 'identified');
  performance.send(JSON.stringify({ t: 'identify', name: 'Forged observer' }));
  assert.equal((await performanceIdentity).name, 'Performance observer', 'localhost performance identity is server-owned');

  const blockedOnline = message(performance, (m) => m.t === 'appError' && m.code === 'PERFORMANCE_ONLY');
  performance.send(JSON.stringify({ t: 'createMatch', mode: MATCH_MODES.online }));
  await blockedOnline;

  const performanceCreated = message(performance, (m) => m.t === 'match' && m.match?.mode === MATCH_MODES.performance);
  performance.send(JSON.stringify({ t: 'createMatch', mode: MATCH_MODES.performance, maxBots: 4 }));
  const performanceMatch = await performanceCreated;
  assert.equal(performanceMatch.match.maxBots, 4);

  const performanceMapVote = message(performance, (m) => m.t === 'match' && m.match?.phase === MATCH_PHASES.mapVote);
  performance.send(JSON.stringify({ t: 'setCharacter', character: 'cleo' }));
  await performanceMapVote;

  const performanceReady = message(performance, (m) => m.t === 'gameReady');
  performance.send(JSON.stringify({ t: 'voteMap', mapId: MAPS[0].id }));
  await performanceReady;
  const performanceState = await message(performance, (m) => m.t === 'state' && m.players.length === 5);
  assert.equal(performanceState.players.filter((player) => player.n.startsWith('Perf Bot ')).length, 4,
    'visual performance state contains the selected bot count plus its observer');

  const ws = await connect();
  for (const raw of ['null', '[]', 'true', '42', '"text"', '{}', '{',
    '{"t":"constructor"}', '{"t":"identify","name":{}}', '{"t":"move","l":{},"r":true}',
    '{"t":"act","a":"m1","view":{"alpha":1e999}}']) ws.send(raw);
  ws.send(Buffer.from('{"t":"leave"}'));
  const pong = message(ws, (m) => m.t === 'clientPong' && m.id === 7);
  ws.send(JSON.stringify({ t: 'clientPing', id: 7 }));
  await pong;

  const identified = message(ws, (m) => m.t === 'identified');
  ws.send(JSON.stringify({ t: 'identify', name: 'Forged name', clientId: 'forged-client-id' }));
  const identity = await identified;
  assert.equal(identity.name, 'Protocol test', 'display name comes from the authenticated profile');
  assert.equal(identity.profileId, 1, 'profile ID comes from the authenticated session');

  const joined = message(ws, (m) => m.t === 'joined');
  ws.send(JSON.stringify({ t: 'join', name: 'Protocol test', team: 'cleo' }));
  const player = await joined;
  const state = await message(ws, (m) => m.t === 'state' && m.players.some((p) => p.i === player.id));
  assert.ok(Number.isFinite(state.simTime) && state.seq > 0 && state.gameId > 0);
  const swing = message(ws, (m) => m.t === 'state' && m.fx.some((fx) => fx.k === 'swing'));
  ws.send(JSON.stringify({ t: 'act', a: 'm1', view: {
    game: state.gameId, a: state.seq, b: state.seq, self: state.seq, alpha: 0, extrapMs: 0,
  } }));
  await swing;

  const oversized = await connect();
  const closed = once(oversized, 'close', { signal: AbortSignal.timeout(4000) });
  oversized.send('x'.repeat(MAX_MESSAGE_BYTES + 1));
  assert.equal((await closed)[0], 1009, 'only the oversized sender is disconnected');
  const alive = message(ws, (m) => m.t === 'clientPong' && m.id === 8);
  ws.send(JSON.stringify({ t: 'clientPing', id: 8 }));
  await alive;
  console.log('SERVER PROTOCOL TESTS OK: auth/origin gate, local performance observer, malformed frames and valid timed melee work');
} finally {
  for (const ws of sockets) ws.terminate();
  await server.stop();
}

function rejectedUpgrade(cookie, origin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(server.url, { headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } });
    ws.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
    ws.once('open', () => { ws.terminate(); reject(new Error('Rejected WebSocket upgrade unexpectedly opened')); });
    ws.once('error', (error) => {
      if (!String(error.message).includes('Unexpected server response')) reject(error);
    });
  });
}
