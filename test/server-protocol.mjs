import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startTestServer } from './test-server.mjs';
import { MAX_MESSAGE_BYTES } from '../server/protocol.js';

const server = await startTestServer();
const sockets = [];
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(server.url);
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
  const ws = await connect();
  for (const raw of ['null', '[]', 'true', '42', '"text"', '{}', '{',
    '{"t":"constructor"}', '{"t":"identify","name":{}}', '{"t":"move","l":{},"r":true}',
    '{"t":"act","a":"m1","view":{"alpha":1e999}}']) ws.send(raw);
  ws.send(Buffer.from('{"t":"leave"}'));
  const pong = message(ws, (m) => m.t === 'clientPong' && m.id === 7);
  ws.send(JSON.stringify({ t: 'clientPing', id: 7 }));
  await pong;

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
  console.log('SERVER PROTOCOL TESTS OK: malformed JSON/fields, binary/oversized frames, valid timed melee, server survives');
} finally {
  for (const ws of sockets) ws.terminate();
  await server.stop();
}
