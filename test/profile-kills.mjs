import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, unlink, rmdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { ACHIEVEMENTS, achievementProgress } from '../shared/achievements.js';
import { startTestServer } from './test-server.mjs';

const TIME_SCALE = 10;
const AUTOSAVE_MS = 10000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const scaled = (ms, floor = 20) => Math.max(floor, Math.ceil(ms / TIME_SCALE));

async function until(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await wait(20);
  }
  return false;
}

function connect(url, { name, team = '', clientId, join = false }) {
  const ws = new WebSocket(url);
  const client = { ws, name, clientId, id: 0, me: null, state: null, feed: [] };
  ws.on('message', (raw) => {
    const message = JSON.parse(raw);
    if (message.t === 'joined') client.id = message.id;
    if (message.t === 'state') {
      client.state = message;
      client.me = message.players.find((player) => player.i === client.id) ?? null;
      if (message.feed?.length) client.feed.push(...message.feed);
    }
  });
  client.ready = once(ws, 'open').then(() => {
    if (join) ws.send(JSON.stringify({ t: 'join', name, team, clientId }));
  });
  client.send = (message) => ws.send(JSON.stringify(message));
  return client;
}

function nextMessage(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', receive);
      reject(new Error('Server stopped responding'));
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

async function profileSnapshot(client) {
  const identified = nextMessage(client.ws, (message) => message.t === 'identified');
  const lobby = nextMessage(client.ws, (message) => message.t === 'lobby');
  client.send({ t: 'identify', name: client.name, clientId: client.clientId });
  const [identity, lobbyState] = await Promise.all([identified, lobby]);
  return {
    profile: identity.profile,
    leaderboard: lobbyState.lb.find((row) => row.id === identity.profileId),
  };
}

function assertKillTotals(snapshot, expectedKills, stage, expectedDeaths = 0) {
  assert.equal(snapshot.profile.kills, expectedKills, `${stage}: profile preserves kills`);
  assert.equal(snapshot.profile.deaths, expectedDeaths, `${stage}: profile preserves deaths`);
  assert.equal(snapshot.leaderboard?.kills, expectedKills, `${stage}: leaderboard preserves kills`);
  assert.equal(snapshot.leaderboard?.deaths, expectedDeaths, `${stage}: leaderboard preserves deaths`);
  const noMercy = ACHIEVEMENTS.find((achievement) => achievement.id === 'no_mercy');
  assert.equal(achievementProgress(noMercy, snapshot.profile).cur, expectedKills, `${stage}: achievements preserve kills`);
}

async function savedPoints(dataDir) {
  try {
    const data = JSON.parse(await readFile(path.join(dataDir, 'profiles.json'), 'utf8'));
    return data.profiles.find((profile) => profile.clientId === 'kill-attacker')?.points ?? 0;
  } catch {
    return 0;
  }
}

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'vvc-kill-test-'));
let server = null;
const sockets = new Set();

try {
  server = await startTestServer({
    timeScale: TIME_SCALE,
    dataDir,
    env: { VVC_AUTOSAVE_MS: String(AUTOSAVE_MS) },
  });
  const attacker = connect(server.url, {
    name: 'Kill attacker', team: 'cleo', clientId: 'kill-attacker', join: true,
  });
  const victim = connect(server.url, {
    name: 'Kill victim', team: 'viking', clientId: 'kill-victim', join: true,
  });
  sockets.add(attacker.ws);
  sockets.add(victim.ws);
  await Promise.all([attacker.ready, victim.ready]);
  assert.ok(await until(() => attacker.me?.g === 1 && victim.me?.g === 1), 'players enter the game');

  attacker.send({ t: 'move', l: false, r: true });
  victim.send({ t: 'move', l: true, r: false });
  assert.ok(await until(() => Math.abs(attacker.me.x - victim.me.x) < 40, 8000), 'players meet');

  const deadline = Date.now() + scaled(15000, 3000);
  while (Date.now() < deadline && !victim.me.d) {
    const right = victim.me.x > attacker.me.x;
    attacker.send({ t: 'move', l: !right, r: right });
    if (Math.abs(attacker.me.x - victim.me.x) < 45) {
      attacker.send({ t: 'act', a: 'm1' });
      await wait(scaled(430, 45));
    } else {
      await wait(30);
    }
  }
  attacker.send({ t: 'move', l: false, r: false });
  victim.send({ t: 'move', l: false, r: false });
  assert.ok(await until(() => attacker.feed.some((kill) => kill.victim === victim.name)), 'kill is published');

  assert.equal(await savedPoints(dataDir), 0, 'the kill has not reached the autosave checkpoint yet');
  assertKillTotals(await profileSnapshot(attacker), 1, 'before checkpoint');

  assert.ok(
    await until(async () => (await savedPoints(dataDir)) === 1, AUTOSAVE_MS + 2000),
    'the autosave checkpoint persists the kill',
  );
  assertKillTotals(await profileSnapshot(attacker), 1, 'after checkpoint');

  attacker.ws.close();
  await once(attacker.ws, 'close');
  sockets.delete(attacker.ws);
  const reconnected = connect(server.url, { name: attacker.name, clientId: attacker.clientId });
  sockets.add(reconnected.ws);
  await reconnected.ready;
  assertKillTotals(await profileSnapshot(reconnected), 1, 'after disconnect');

  for (const ws of sockets) ws.terminate();
  sockets.clear();
  await server.stop();

  const profilesFile = path.join(dataDir, 'profiles.json');
  const stored = JSON.parse(await readFile(profilesFile, 'utf8'));
  const template = stored.profiles.find((profile) => profile.clientId === attacker.clientId);
  const statsOnly = structuredClone(template);
  statsOnly.clientId = 'legacy-stats-only';
  statsOnly.profileId = stored.nextProfileId++;
  statsOnly.name = 'Legacy stats';
  statsOnly.points = 3;
  delete statsOnly.killsAgainst;
  delete statsOnly.deathsBy;
  statsOnly.stats.combat.kills = 7;
  statsOnly.stats.combat.deaths = 4;
  statsOnly.achievements = { unlocked: {} };
  const pointsOnly = structuredClone(template);
  pointsOnly.clientId = 'legacy-points-only';
  pointsOnly.profileId = stored.nextProfileId++;
  pointsOnly.name = 'Legacy points';
  pointsOnly.points = 5;
  delete pointsOnly.killsAgainst;
  delete pointsOnly.deathsBy;
  delete pointsOnly.stats;
  pointsOnly.achievements = { unlocked: {} };
  stored.profiles.push(statsOnly, pointsOnly);
  await writeFile(profilesFile, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');

  server = await startTestServer({ dataDir });

  const restarted = connect(server.url, { name: attacker.name, clientId: attacker.clientId });
  sockets.add(restarted.ws);
  await restarted.ready;
  assertKillTotals(await profileSnapshot(restarted), 1, 'after server restart');

  const legacyStats = connect(server.url, { name: statsOnly.name, clientId: statsOnly.clientId });
  sockets.add(legacyStats.ws);
  await legacyStats.ready;
  assertKillTotals(await profileSnapshot(legacyStats), 7, 'legacy combat stats', 4);

  const legacyPoints = connect(server.url, { name: pointsOnly.name, clientId: pointsOnly.clientId });
  sockets.add(legacyPoints.ws);
  await legacyPoints.ready;
  assertKillTotals(await profileSnapshot(legacyPoints), 5, 'legacy points');

  console.log('PROFILE KILL TESTS OK: live and legacy totals survive checkpoint, disconnect and restart consistently');
} finally {
  for (const ws of sockets) ws.terminate();
  await server?.stop();
  for (const name of await readdir(dataDir)) await unlink(path.join(dataDir, name));
  await rmdir(dataDir);
}
