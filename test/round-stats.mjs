import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { MAPS, MATCH_PHASES } from '../shared/constants.js';
import { claimRoundRegistration, clearRoundRegistration } from '../server/round-registration.js';
import { startTestServer } from './test-server.mjs';

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

function nextMessage(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', receive);
      reject(new Error('Server stopped responding'));
    }, 4000);

    function receive(raw) {
      const value = JSON.parse(raw);
      if (!predicate(value)) return;
      clearTimeout(timer);
      ws.off('message', receive);
      resolve(value);
    }

    ws.on('message', receive);
  });
}

async function sendAndWait(ws, payload, predicate) {
  const response = nextMessage(ws, predicate);
  ws.send(JSON.stringify(payload));
  return response;
}

async function identify(ws, name, clientId) {
  return sendAndWait(ws, { t: 'identify', name, clientId }, (message) => message.t === 'identified');
}

async function playRound(host, guest, mapId, expectedRoundId) {
  await sendAndWait(
    host,
    { t: 'setCharacter', character: 'cleo' },
    (message) => message.t === 'match' && message.match.players.some((player) => player.character === 'cleo'),
  );
  await sendAndWait(
    guest,
    { t: 'setCharacter', character: 'viking' },
    (message) => message.t === 'match' && message.match.players.every((player) => player.character),
  );
  const started = await sendAndWait(
    host,
    { t: 'startMatch' },
    (message) => message.t === 'match' && message.match.phase === MATCH_PHASES.mapVote,
  );
  assert.equal(started.match.roundId, expectedRoundId);

  await sendAndWait(
    host,
    { t: 'voteMap', mapId },
    (message) => message.t === 'match' && message.match.mapVotes.some((map) => map.id === mapId && map.count === 1),
  );
  await sendAndWait(
    guest,
    { t: 'voteMap', mapId },
    (message) => message.t === 'gameReady' && message.match.phase === MATCH_PHASES.countdown,
  );
  await sendAndWait(
    host,
    { t: 'finishMatch' },
    (message) => message.t === 'match' && message.match.phase === MATCH_PHASES.results,
  );
}

try {
  const registrations = new Set();
  const sampleRound = { id: 'sample', roundId: 1 };
  assert.equal(claimRoundRegistration(registrations, sampleRound), true);
  assert.equal(claimRoundRegistration(registrations, sampleRound), false, 'the same round can only be claimed once');
  clearRoundRegistration(registrations, sampleRound);
  assert.equal(registrations.size, 0, 'consumed round markers can be cleared');

  const host = await connect();
  const guest = await connect();
  await identify(host, 'Round host', 'round-host-client');
  await identify(guest, 'Round guest', 'round-guest-client');

  const created = await sendAndWait(
    host,
    { t: 'createMatch' },
    (message) => message.t === 'match' && message.match.playerCount === 1,
  );
  const matchId = created.match.id;
  await sendAndWait(
    guest,
    { t: 'joinMatch', id: matchId },
    (message) => message.t === 'match' && message.match.id === matchId && message.match.playerCount === 2,
  );

  const firstMapId = MAPS[0].id;
  const secondMapId = MAPS[1]?.id ?? firstMapId;
  await playRound(host, guest, firstMapId, 1);
  await sendAndWait(
    host,
    { t: 'resetMatch' },
    (message) => message.t === 'match' && message.match.phase === MATCH_PHASES.matchLobby,
  );
  await playRound(host, guest, secondMapId, 2);
  await sendAndWait(
    host,
    { t: 'resetMatch' },
    (message) => message.t === 'match' && message.match.phase === MATCH_PHASES.matchLobby,
  );
  await playRound(host, guest, firstMapId, 3);

  const hostProfile = (await identify(host, 'Round host', 'round-host-client')).profile;
  const guestProfile = (await identify(guest, 'Round guest', 'round-guest-client')).profile;
  for (const profile of [hostProfile, guestProfile]) {
    assert.equal(profile.stats.matches.played, 3, 'all three rounds are registered');
    assert.equal(profile.stats.matches.draws, 3, 'all three round results are registered');
    assert.equal(profile.stats.matches.mapVotes[firstMapId], firstMapId === secondMapId ? 3 : 2, 'repeated map votes are registered per round');
    assert.equal(profile.stats.matches.mapVotes[secondMapId], firstMapId === secondMapId ? 3 : 1, 'the second map vote is registered');
  }

  console.log('ROUND STATS TESTS OK: three rounds register results and map votes exactly once in the same lobby');
} finally {
  for (const ws of sockets) ws.terminate();
  await server.stop();
}
