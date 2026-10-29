import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startTestServer } from './test-server.mjs';

const server = await startTestServer({ authenticatedProfiles: ['Public Fighter'] });
const sockets = [];

try {
  const script = await fetch(`${server.origin}/js/leaderboard.js`).then((response) => response.text());
  assert.match(script, /\/ws\/leaderboard/,
    'the standalone leaderboard connects to the dedicated public channel');

  const leaderboard = await connect(`${server.url}/ws/leaderboard`, server.origin);
  const initial = await nextMessage(leaderboard, (message) => message.t === 'leaderboard');
  assert.deepEqual(initial.lb.map((row) => row.n), ['Public Fighter'],
    'an anonymous display receives public leaderboard rows');
  assert.equal(initial.summary.totalProfiles, 1);
  assert.ok(Array.isArray(initial.matches));

  const readOnlyClose = once(leaderboard, 'close', { signal: AbortSignal.timeout(4000) });
  leaderboard.send(JSON.stringify({ t: 'identify', name: 'Anonymous intruder' }));
  assert.equal((await readOnlyClose)[0], 1008,
    'the public leaderboard channel rejects every incoming application message');

  assert.equal(await rejectedUpgrade(server.url, server.origin), 401,
    'the normal game channel still rejects anonymous clients');
  assert.equal(await rejectedUpgrade(`${server.url}/ws/leaderboard`, 'https://attacker.invalid'), 403,
    'the public channel still enforces same-origin WebSocket upgrades');

  console.log('PUBLIC LEADERBOARD TESTS OK: anonymous read-only data works without opening the authenticated game channel');
} finally {
  for (const ws of sockets) ws.terminate();
  await server.stop();
}

function connect(url, origin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { Origin: origin } });
    sockets.push(ws);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', receive);
      reject(new Error('Public leaderboard stopped responding'));
    }, 4000);
    function receive(raw) {
      const message = JSON.parse(raw);
      if (!predicate(message)) return;
      clearTimeout(timer);
      ws.off('message', receive);
      resolve(message);
    }
    ws.on('message', receive);
  });
}

function rejectedUpgrade(url, origin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers: { Origin: origin } });
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
