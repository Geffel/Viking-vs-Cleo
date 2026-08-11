import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { MatchRegistry } from './matches.js';
import { ACHIEVEMENTS, evaluateAchievements, publicAchievements } from '../shared/achievements.js';
import { TICK_MS, TEAM_IDS, NAME_MAX, LAGCOMP, MATCH_PHASES, PLAYER, MAPS, mapLayoutFor } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(ROOT, 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

// Formatversion for profiles.json. Hoj denna nar sparformatet andras pa ett
// satt som kraver migrering, och lagg till ett steg i migrateProfiles().
const SCHEMA_VERSION = 3;

// Hur ofta pagaende sessioners poang och speltid checkpointas till disk. En
// hard krasch (stromavbrott, kill -9) forlorar da som mest denna tid.
const AUTOSAVE_MS = 30000;
const LEADERBOARD_BROADCAST_MS = 1000;

const app = express();
app.use(express.static(path.join(ROOT, 'public')));
app.use('/shared', express.static(path.join(ROOT, 'shared')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Legacy-spelet finns kvar for direktjoin-vagen, men lobby-matcher far egna
// Game-instanser nar deras countdown startar.
const game = new Game();
const matchGames = new Map();
const matches = new MatchRegistry();
const profiles = new Map();
const recordedMapVoteStats = new Set();
const recordedMatchResults = new Set();
let nextProfileId = 1;
let nextSessionId = 1;
let shuttingDown = false;
let lastLeaderboardBroadcastSig = '';

// Deklareras fore loadProfiles() - den anropar cleanClientId/cleanName som
// laser denna, och en const i temporal dead zone skulle annars krascha inlasningen.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

loadProfiles();

wss.on('connection', (ws) => {
  ws.sessionId = nextSessionId++;
  ws.name = '';
  ws.clientId = null;
  ws.profileId = 0;
  ws.matchId = '';
  ws.playerId = 0;
  ws.halfRtt = 0;
  ws.pingAt = Date.now();
  ws.lastPongAt = Date.now();

  // Pongen kommer fran WebSocket-protokollet, inte fran sidans kod - den gar
  // alltsa inte att forfalska for att fa en storre bakatspolning.
  ws.on('pong', () => {
    const t = Date.now();
    ws.lastPongAt = t;
    const half = Math.min((t - ws.pingAt) / 2, LAGCOMP.maxRewindMs);
    // Glidande medel: en enstaka topp ska inte flytta traffkontrollen.
    ws.halfRtt = ws.halfRtt ? ws.halfRtt * 0.6 + half * 0.4 : half;
    const p = playerForSocket(ws);
    if (p) p.halfRtt = ws.halfRtt;
  });
  ws.ping();

  const lb = leaderboardSnapshot();
  send(ws, {
    t: 'welcome',
    serverNow: Date.now(),
    sessionId: ws.sessionId,
    teams: game.teamCounts(),
    suggest: game.suggestTeam(),
    matches: matches.list(),
    lb,
    leaderboardSummary: leaderboardSummary(lb),
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    const hadMatch = !!ws.matchId;
    if (ws.playerId) removePlayerSession(ws);
    if (ws.matchId) leaveLobbyMatch(ws);
    if (hadMatch) broadcastLobby();
  });
});

function handleMessage(ws, msg) {
  switch (msg.t) {
    case 'identify': {
      identifySocket(ws, msg);
      send(ws, {
        t: 'identified',
        serverNow: Date.now(),
        sessionId: ws.sessionId,
        name: ws.name,
        profileId: ws.profileId,
        profile: profileSnapshotFor(ws),
        matches: matches.list(),
        match: ws.matchId ? matches.snapshot(ws.matchId) : null,
      });
      broadcastLobby();
      break;
    }
    case 'createMatch': {
      if (!requireIdentity(ws)) return;
      if (ws.playerId) removePlayerSession(ws);
      if (ws.matchId) leaveLobbyMatch(ws);
      const match = matches.create(sessionPlayer(ws));
      ws.matchId = match.id;
      broadcastLobby();
      sendMatch(match);
      break;
    }
    case 'joinMatch': {
      if (!requireIdentity(ws)) return;
      if (ws.playerId) removePlayerSession(ws);
      const matchId = String(msg.id ?? '');
      const match = matches.get(matchId);
      if (!match) {
        send(ws, { t: 'appError', message: 'That match no longer exists.' });
        return;
      }
      if (ws.matchId && ws.matchId !== matchId) leaveLobbyMatch(ws);
      const joined = matches.addPlayer(matchId, sessionPlayer(ws));
      if (!joined) {
        send(ws, { t: 'appError', message: "That match can't be joined right now." });
        return;
      }
      ws.matchId = joined.id;
      broadcastLobby();
      sendMatch(joined);
      break;
    }
    case 'leaveMatch': {
      if (ws.playerId) removePlayerSession(ws);
      if (ws.matchId) leaveLobbyMatch(ws);
      broadcastLobby();
      break;
    }
    case 'setReady': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error } = matches.setReady(result.id, ws.sessionId, !!msg.ready);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      sendMatch(match);
      break;
    }
    case 'setCharacter': {
      const result = requireMatch(ws);
      if (!result) return;
      // Den som redan spelar i en pagaende rond far inte byta sida mitt i.
      if (ws.playerId && result.phase !== MATCH_PHASES.matchLobby) {
        send(ws, { t: 'appError', message: "You're already in the round." });
        return;
      }
      const { match, error } = matches.setCharacter(result.id, ws.sessionId, msg.character);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      sendMatch(match);
      // Sen anslutare som valt karaktar mitt i countdown/playing spawnas direkt in.
      if (!ws.playerId && [MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(match.phase)) {
        spawnLateJoiner(match, ws);
        broadcastLobby();
      }
      break;
    }
    case 'startMatch': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error } = matches.start(result.id, ws.sessionId);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      clearGameSessions(match.id);
      broadcastLobby();
      sendMatch(match);
      break;
    }
    case 'finishMatch': {
      const result = requireMatch(ws);
      if (!result) return;
      const matchGame = matchGames.get(result.id);
      const { match, error } = matches.finish(result.id, ws.sessionId, matchGame?.score);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      recordMatchResult(match, matchGame);
      clearGameSessions(match.id);
      broadcastLobby();
      sendMatch(match);
      break;
    }
    case 'resetMatch': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error } = matches.resetToLobby(result.id, ws.sessionId);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      clearGameSessions(match.id);
      broadcastLobby();
      sendMatch(match);
      break;
    }
    case 'voteMap': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error, change } = matches.voteMap(result.id, ws.sessionId, msg.mapId);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      if (change?.to === MATCH_PHASES.countdown) {
        prepareGameForMatch(match);
        broadcastLobby();
        break;
      }
      sendMatch(match);
      break;
    }
    case 'join': {
      if (ws.playerId) return;
      const name = cleanName(msg.name);
      const team = TEAM_IDS.includes(msg.team) ? msg.team : game.suggestTeam();
      const identity = resolveIdentity(msg.clientId, name);
      ws.name = name;
      ws.clientId = identity.clientId;
      ws.profileId = identity.profileId;
      if (ws.matchId) leaveLobbyMatch(ws);
      const p = game.addPlayer(name, team, identity);
      p.halfRtt = ws.halfRtt;
      ws.playerId = p.id;
      activateProfile(p);
      send(ws, { t: 'joined', id: p.id, name: p.name, team: p.team, profileId: p.profileId });
      break;
    }
    case 'move': {
      if (!canControlGame(ws)) return;
      const sessionGame = gameForSocket(ws);
      const p = sessionGame?.players.get(ws.playerId);
      if (p) sessionGame.setMove(p, msg.l, msg.r);
      break;
    }
    case 'act': {
      if (!canControlGame(ws)) return;
      const sessionGame = gameForSocket(ws);
      const p = sessionGame?.players.get(ws.playerId);
      if (p) sessionGame.action(p, msg.a);
      break;
    }
    case 'actup': {
      if (!canControlGame(ws)) return;
      const sessionGame = gameForSocket(ws);
      const p = sessionGame?.players.get(ws.playerId);
      if (p) sessionGame.releaseAction(p, msg.a);
      break;
    }
    case 'leave': {
      if (ws.playerId) removePlayerSession(ws);
      break;
    }
  }
}

function identifySocket(ws, msg) {
  const name = cleanName(msg.name);
  const identity = resolveIdentity(msg.clientId, name);
  ws.name = name;
  ws.clientId = identity.clientId;
  ws.profileId = identity.profileId;

  if (ws.matchId) {
    const match = matches.get(ws.matchId);
    const row = match?.players.get(ws.sessionId);
    if (row) {
      row.n = name;
      row.profileId = ws.profileId;
      match.updatedAt = Date.now();
    }
  }
}

function requireIdentity(ws) {
  if (ws.name) return true;
  send(ws, { t: 'appError', message: 'Enter a name first.' });
  return false;
}

function requireMatch(ws) {
  if (!requireIdentity(ws)) return null;
  const match = ws.matchId ? matches.get(ws.matchId) : null;
  if (match) return match;
  send(ws, { t: 'appError', message: "You're not in a match." });
  return null;
}

function canControlGame(ws) {
  if (!ws.playerId) return false;
  const sessionGame = gameForSocket(ws);
  if (!sessionGame?.players.has(ws.playerId)) return false;
  if (!ws.matchId) return true;
  const match = ws.matchId ? matches.get(ws.matchId) : null;
  return match?.phase === MATCH_PHASES.playing;
}

function sessionPlayer(ws) {
  return {
    sessionId: ws.sessionId,
    name: ws.name,
    profileId: ws.profileId,
  };
}

function leaveLobbyMatch(ws) {
  const oldId = ws.matchId;
  if (!oldId) return;
  ws.matchId = '';

  const match = matches.removePlayer(oldId, ws.sessionId);
  if (!match) clearGameSessions(oldId);
  if (match) sendMatch(match);
}

function lobbySnapshotFor(ws) {
  const lb = leaderboardSnapshot();
  return {
    t: 'lobby',
    serverNow: Date.now(),
    me: {
      sessionId: ws.sessionId,
      name: ws.name,
      profileId: ws.profileId,
      matchId: ws.matchId || null,
    },
    profile: profileSnapshotFor(ws),
    matches: matches.list(),
    match: ws.matchId ? matches.snapshot(ws.matchId) : null,
    lb,
    leaderboardSummary: leaderboardSummary(lb),
  };
}

function broadcastLobby() {
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) send(ws, lobbySnapshotFor(ws));
  }
}

function sendMatch(match) {
  const snap = matches.snapshot(match.id);
  if (!snap) return;
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && ws.matchId === match.id) send(ws, { t: 'match', serverNow: Date.now(), match: snap });
  }
}

function prepareGameForMatch(match) {
  recordMapVoteStats(match);
  clearGameSessions(match.id);
  const matchGame = new Game({ layout: mapLayoutFor(match.selectedMap), mapId: match.selectedMap });
  matchGames.set(match.id, matchGame);

  for (const row of match.players.values()) {
    const ws = socketBySession(row.id);
    if (!ws || ws.readyState !== ws.OPEN) continue;

    const p = matchGame.addPlayer(row.n, row.character, {
      clientId: ws.clientId,
      profileId: ws.profileId,
    });
    p.halfRtt = ws.halfRtt;
    p.invulnUntil = Math.max(p.invulnUntil, match.countdownEndsAt + PLAYER.spawnProtectionMs);
    ws.playerId = p.id;
    activateProfile(p);

    send(ws, {
      t: 'gameReady',
      serverNow: Date.now(),
      id: p.id,
      name: p.name,
      team: p.team,
      profileId: p.profileId,
      profile: profileSnapshotFor(ws),
      match: matches.snapshot(match.id),
    });
  }
}

// Spawnar en spelare som joinade EFTER att arenan redan startat. Anvander samma
// vag som prepareGameForMatch men bara for den ena sena anslutaren.
function spawnLateJoiner(match, ws) {
  const matchGame = matchGames.get(match.id);
  if (!matchGame || !ws || ws.readyState !== ws.OPEN) return;

  const row = match.players.get(ws.sessionId);
  if (!row?.character) return;
  if (ws.playerId && matchGame.players.has(ws.playerId)) return;

  const p = matchGame.addPlayer(row.n, row.character, {
    clientId: ws.clientId,
    profileId: ws.profileId,
  });
  p.halfRtt = ws.halfRtt;
  p.invulnUntil = Math.max(p.invulnUntil, Date.now() + PLAYER.spawnProtectionMs);
  ws.playerId = p.id;
  activateProfile(p);

  send(ws, {
    t: 'gameReady',
    serverNow: Date.now(),
    id: p.id,
    name: p.name,
    team: p.team,
    profileId: p.profileId,
    profile: profileSnapshotFor(ws),
    match: matches.snapshot(match.id),
  });
}

function beginFight(match) {
  const now = Date.now();
  const matchGame = matchGames.get(match.id);
  if (!matchGame) return;
  matchGame.markStarted(now);

  for (const row of match.players.values()) {
    const ws = socketBySession(row.id);
    const p = ws?.playerId ? matchGame.players.get(ws.playerId) : null;
    if (p) p.invulnUntil = Math.max(p.invulnUntil, now + PLAYER.spawnProtectionMs);
  }
}

function clearGameSessions(matchId = '') {
  const targetGame = matchId ? matchGames.get(matchId) : game;
  for (const ws of wss.clients) {
    if (ws.readyState !== ws.OPEN || !ws.playerId) continue;
    if (matchId ? ws.matchId !== matchId : ws.matchId) continue;
    const player = targetGame?.players.get(ws.playerId);
    if (player) finalizeProfile(player);
    ws.playerId = 0;
  }
  targetGame?.reset();
  if (matchId) matchGames.delete(matchId);
}

function socketBySession(sessionId) {
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && ws.sessionId === sessionId) return ws;
  }
  return null;
}

function gameForSocket(ws) {
  if (!ws?.playerId) return null;
  return ws.matchId ? matchGames.get(ws.matchId) ?? null : game;
}

function playerForSocket(ws) {
  return gameForSocket(ws)?.players.get(ws.playerId) ?? null;
}

function findPlayerById(playerId) {
  if (!playerId) return null;
  const legacyPlayer = game.players.get(playerId);
  if (legacyPlayer) return legacyPlayer;

  for (const matchGame of matchGames.values()) {
    const player = matchGame.players.get(playerId);
    if (player) return player;
  }
  return null;
}

function* allPlayers() {
  yield* game.players.values();
  for (const matchGame of matchGames.values()) yield* matchGame.players.values();
}

function cleanName(raw) {
  const name = String(raw ?? '').replace(CONTROL_CHARS, '').trim().slice(0, NAME_MAX);
  return name || `Player${Math.floor(Math.random() * 900 + 100)}`;
}

function cleanClientId(raw) {
  const id = String(raw ?? '').replace(CONTROL_CHARS, '').trim().slice(0, 80);
  return /^[a-zA-Z0-9-]+$/.test(id) ? id : '';
}

function resolveIdentity(rawClientId, name) {
  const clientId = cleanClientId(rawClientId);
  if (!clientId) return { clientId: null, profileId: 0 };

  let profile = profiles.get(clientId);
  if (!profile) {
    profile = createProfile(nextProfileId++, name);
    profiles.set(clientId, profile);
  }

  profile.name = name;
  profile.seen++;
  profile.lastSeenAt = Date.now();
  saveProfiles();
  return { clientId, profileId: profile.profileId };
}

function activateProfile(player) {
  if (!player.clientId) return;
  const profile = profiles.get(player.clientId);
  if (!profile) return;
  profile.name = player.name;
  profile.lastSeenAt = Date.now();
  // committedKills/committedMs speglar hur mycket av den pagaende sessionen som
  // redan bokforts i de permanenta faltarna, sa checkpoint och finalize inte
  // dubbelraknar. Falten lever bara i minnet och sparas aldrig till disk.
  profile.active = {
    playerId: player.id,
    startedAt: Date.now(),
    team: player.team,
    committedKills: 0,
    committedMs: 0,
  };
  saveProfiles();
}

function removePlayerSession(ws) {
  const sessionGame = gameForSocket(ws);
  const player = sessionGame?.players.get(ws.playerId);
  if (!player) {
    ws.playerId = 0;
    return;
  }

  finalizeProfile(player);
  sessionGame.removePlayer(player.id);
  ws.playerId = 0;
}

function finalizeProfile(player) {
  if (!player?.clientId) return;
  const profile = profiles.get(player.clientId);
  if (!profile || profile.active?.playerId !== player.id) return;

  profile.name = player.name;
  commitPending(profile); // bokfor det som annu inte checkpointats
  profile.lastSeenAt = Date.now();
  profile.active = null;
  saveProfiles();
}

// Bokfor en pagaende sessions annu ej sparade poang och speltid i profilens
// permanenta falt. Anvands bade av autospar-checkpointen och av finalize.
// Returnerar true om nagot faktiskt andrades.
function commitPending(profile) {
  const active = profile.active;
  if (!active) return false;
  const player = findPlayerById(active.playerId);
  if (!player) return false;

  const kills = Math.max(0, player.kills - (active.committedKills ?? 0));
  const elapsed = Math.max(0, Date.now() - active.startedAt);
  const ms = Math.max(0, elapsed - (active.committedMs ?? 0));
  if (kills === 0 && ms === 0) return false;

  profile.points += kills;
  profile.playMs += ms;
  profile.teamPlayMs[player.team] = (profile.teamPlayMs[player.team] ?? 0) + ms;
  active.committedKills = player.kills;
  active.committedMs = elapsed;
  return true;
}

function leaderboardSnapshot() {
  const rows = [];
  for (const profile of profiles.values()) {
    const view = buildProfileView(profile);

    rows.push({
      id: profile.profileId,
      n: view.name,
      pts: view.points,
      ms: view.playMs,
      kills: view.kills,
      deaths: view.deaths,
      nemesis: view.nemesis,
      prey: view.prey,
      fav: view.favoriteCharacter,
      stats: view.stats,
      achievements: view.achievements,
    });
  }

  rows.sort((a, b) => b.pts - a.pts || b.ms - a.ms || a.n.localeCompare(b.n, 'sv'));
  return rows.slice(0, 12);
}

function leaderboardPayload(rows = leaderboardSnapshot()) {
  return {
    t: 'leaderboard',
    serverNow: Date.now(),
    lb: rows,
    matches: leaderboardMatchesSnapshot(),
    summary: leaderboardSummary(rows),
  };
}

function leaderboardSummary(rows = leaderboardSnapshot()) {
  const matchList = leaderboardMatchesSnapshot();
  let totalKills = 0;
  let totalPlayMs = 0;
  let totalMatches = 0;
  let totalPowerups = 0;
  let totalKebabs = 0;
  let cleoPoints = 0;
  let vikingPoints = 0;

  for (const profile of profiles.values()) {
    const view = buildProfileView(profile);
    const points = Math.max(0, Number(view.points) || 0);
    totalKills += view.kills;
    totalPlayMs += view.playMs;
    totalMatches += Math.max(0, Number(view.stats?.matches?.played) || 0);
    totalPowerups += Math.max(0, Number(view.stats?.powerups?.total) || 0);
    totalKebabs += Math.max(0, Number(view.stats?.powerups?.byKind?.kebab) || 0);

    if (view.favoriteCharacter === 'Cleo') cleoPoints += points;
    else if (view.favoriteCharacter === 'Viking') vikingPoints += points;
    else {
      cleoPoints += points / 2;
      vikingPoints += points / 2;
    }
  }

  return {
    totalProfiles: profiles.size,
    shownProfiles: rows.length,
    activePlayers: activeNamedConnections(),
    activePlayers: [...allPlayers()].length,
    activeMatches: matchList.length,
    liveMatches: matchList.filter((match) => [MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(match.phase)).length,
    totalKills,
    totalPlayMs,
    totalMatches,
    totalPowerups,
    totalKebabs,
    factionPoints: {
      cleo: Math.round(cleoPoints),
      viking: Math.round(vikingPoints),
    },
  };
}

function leaderboardMatchesSnapshot() {
  return matches.list().map((match) => ({
    ...match,
    liveScore: matchGames.get(match.id)?.score ?? match.finalScore ?? null,
  }));
}

function broadcastLeaderboard({ force = false } = {}) {
  const payload = leaderboardPayload();
  const sig = leaderboardSignature(payload);
  if (!force && sig === lastLeaderboardBroadcastSig) return payload;
  lastLeaderboardBroadcastSig = sig;

  const str = JSON.stringify(payload);
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.send(str);
  }
  return payload;
}

function leaderboardSignature(payload) {
  return JSON.stringify({
    rows: payload.lb.map((entry) => [
      entry.id,
      entry.n,
      entry.pts,
      Math.floor((entry.ms ?? 0) / 1000),
      entry.kills,
      entry.deaths,
      entry.nemesis?.name,
      entry.nemesis?.count,
      entry.prey?.name,
      entry.prey?.count,
      entry.fav,
    ]),
    summary: {
      ...payload.summary,
      totalPlayMs: Math.floor((payload.summary?.totalPlayMs ?? 0) / 1000),
    },
    matches: payload.matches.map((match) => [
      match.id,
      match.phase,
      match.playerCount,
      match.selectedMap,
      Math.floor((match.voteEndsAt ?? 0) / 1000),
      Math.floor((match.countdownEndsAt ?? 0) / 1000),
      Math.floor((match.matchEndsAt ?? 0) / 1000),
      match.finalScore?.cleo ?? 0,
      match.finalScore?.viking ?? 0,
      match.liveScore?.cleo ?? 0,
      match.liveScore?.viking ?? 0,
    ]),
  });
}

function loadProfiles() {
  try {
    if (!fs.existsSync(PROFILES_FILE)) return;

    const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
    const data = migrateProfiles(JSON.parse(raw));
    nextProfileId = Math.max(1, Number(data.nextProfileId) || 1);

    for (const row of data.profiles ?? []) {
      const clientId = cleanClientId(row.clientId);
      if (!clientId) continue;

      const profileId = Math.max(1, Number(row.profileId) || nextProfileId++);
      const profile = createProfile(profileId, row.name);
      profile.points = Math.max(0, Number(row.points) || 0);
      profile.playMs = Math.max(0, Number(row.playMs) || 0);
      profile.seen = Math.max(0, Number(row.seen) || 0);
      profile.lastSeenAt = Math.max(0, Number(row.lastSeenAt) || 0);
      profile.killsAgainst = sanitizeCounterMap(row.killsAgainst);
      profile.deathsBy = sanitizeCounterMap(row.deathsBy);
      profile.teamPlayMs = {
        cleo: Math.max(0, Number(row.teamPlayMs?.cleo) || 0),
        viking: Math.max(0, Number(row.teamPlayMs?.viking) || 0),
      };
      profile.stats = sanitizeProfileStats(row.stats);
      profile.achievements = sanitizeProfileAchievements(row.achievements);
      unlockProfileAchievements(profile, { notify: false });
      profiles.set(clientId, profile);
      nextProfileId = Math.max(nextProfileId, profileId + 1);
    }
  } catch (err) {
    console.warn('Kunde inte lasa profiler:', err.message);
  }
}

// Uppgraderar ett inlast objekt till aktuellt SCHEMA_VERSION. Filer utan
// versionsfalt (skrivna innan versionering) behandlas som v1-kompatibla. Nya
// steg laggs till som "if (version < N) { ...; version = N; }".
function migrateProfiles(data) {
  const version = Math.max(0, Number(data?.version) || 0);

  if (version > SCHEMA_VERSION) {
    console.warn(
      `Profilfilen ar sparad i ett nyare format (v${version} > v${SCHEMA_VERSION}). ` +
        'Laser in sa gott det gar - uppdatera servern for fullt stod.',
    );
  }

  // Framtida migreringar mellan versioner placeras har.

  return data ?? {};
}

function saveProfiles() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const data = {
      version: SCHEMA_VERSION,
      nextProfileId,
      profiles: [...profiles.entries()].map(([clientId, profile]) => ({
        clientId,
        profileId: profile.profileId,
        name: profile.name,
        points: profile.points,
        playMs: profile.playMs,
        seen: profile.seen,
        lastSeenAt: profile.lastSeenAt,
        killsAgainst: profile.killsAgainst,
        deathsBy: profile.deathsBy,
        teamPlayMs: profile.teamPlayMs,
        stats: profile.stats,
        achievements: profile.achievements,
      })),
    };
    const tmp = `${PROFILES_FILE}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, PROFILES_FILE);
  } catch (err) {
    console.warn('Kunde inte spara profiler:', err.message);
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const player of allPlayers()) finalizeProfile(player);
  saveProfiles();
}

function createProfile(profileId, name) {
  return {
    profileId,
    name: cleanName(name),
    points: 0,
    playMs: 0,
    seen: 0,
    lastSeenAt: 0,
    killsAgainst: {},
    deathsBy: {},
    teamPlayMs: { cleo: 0, viking: 0 },
    stats: freshProfileStats(),
    achievements: freshProfileAchievements(),
    active: null,
  };
}

function freshProfileAchievements() {
  return { unlocked: {} };
}

function freshProfileStats() {
  return {
    matches: {
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      bestKills: 0,
      bestCritHits: 0,
      bestPowerups: 0,
      flawless3KillMatches: 0,
      byMap: {},
      mapVotes: {},
      unanimousMapVotes: 0,
    },
    combat: {
      hits: 0,
      critHits: 0,
      backstabHits: 0,
      protectedHits: 0,
      kills: 0,
      deaths: 0,
      firstBloods: 0,
      damageDealt: 0,
      damageTaken: 0,
      quickDamageHits: 0,
      surviveUnder10Hp: 0,
      lowHpKills: 0,
      revengeKills: 0,
      stunnedKills: 0,
      ownStunKills: 0,
      killsWhileKebab: 0,
      killsWhileEnraged: 0,
      killsWhileBerserk: 0,
      deathsWhileBerserk: 0,
      buffStackHits: 0,
      killsByCause: {},
      deathsByCause: {},
    },
    combos: {
      finishers: 0,
      exactFinishers: 0,
      finisherKills: 0,
      enrages: 0,
      byId: {},
      killsById: {},
    },
    powerups: {
      total: 0,
      byKind: {},
      pizzaLowHp: 0,
      centerPickups: 0,
    },
    abilities: {
      used: {},
      released: {},
      hits: {},
      kills: {},
      longRangeHits: {},
      fullChargeHits: {},
      blinkLowHp: 0,
      blinkThroughPlayer: 0,
      shieldBlocks: 0,
      fullShieldSets: 0,
      harpoonPulls: 0,
      harpoonSetupKills: 0,
    },
  };
}

function sanitizeProfileStats(raw) {
  const stats = freshProfileStats();
  mergeStats(stats, raw);
  stats.matches.byMap = sanitizeMapStats(raw?.matches?.byMap);
  stats.matches.mapVotes = sanitizePlainCounterMap(raw?.matches?.mapVotes);
  stats.combat.killsByCause = sanitizePlainCounterMap(raw?.combat?.killsByCause);
  stats.combat.deathsByCause = sanitizePlainCounterMap(raw?.combat?.deathsByCause);
  stats.combos.byId = sanitizePlainCounterMap(raw?.combos?.byId);
  stats.combos.killsById = sanitizePlainCounterMap(raw?.combos?.killsById);
  stats.powerups.byKind = sanitizePlainCounterMap(raw?.powerups?.byKind);
  stats.abilities.used = sanitizePlainCounterMap(raw?.abilities?.used);
  stats.abilities.released = sanitizePlainCounterMap(raw?.abilities?.released);
  stats.abilities.hits = sanitizePlainCounterMap(raw?.abilities?.hits);
  stats.abilities.kills = sanitizePlainCounterMap(raw?.abilities?.kills);
  stats.abilities.longRangeHits = sanitizePlainCounterMap(raw?.abilities?.longRangeHits);
  stats.abilities.fullChargeHits = sanitizePlainCounterMap(raw?.abilities?.fullChargeHits);
  return stats;
}

function sanitizeProfileAchievements(raw) {
  const achievements = freshProfileAchievements();
  const allowed = new Set(ACHIEVEMENTS.map((def) => def.id));
  for (const [id, value] of Object.entries(raw?.unlocked ?? {})) {
    const cleanId = String(id).replace(CONTROL_CHARS, '').trim().slice(0, 64);
    const unlockedAt = Math.max(0, Number(value) || 0);
    if (allowed.has(cleanId) && unlockedAt) achievements.unlocked[cleanId] = unlockedAt;
  }
  return achievements;
}

function mergeStats(target, raw) {
  if (!raw || typeof raw !== 'object') return target;
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in target)) continue;
    if (typeof target[key] === 'number') {
      target[key] = Math.max(0, Number(value) || 0);
      continue;
    }
    if (target[key] && typeof target[key] === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
      mergeStats(target[key], value);
    }
  }
  return target;
}

function sanitizePlainCounterMap(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    const cleanKey = String(key).replace(CONTROL_CHARS, '').trim().slice(0, 48);
    const count = Math.max(0, Number(value) || 0);
    if (cleanKey && count) out[cleanKey] = count;
  }
  return out;
}

function sanitizeMapStats(raw) {
  const out = {};
  for (const [mapId, value] of Object.entries(raw ?? {})) {
    const cleanId = String(mapId).replace(CONTROL_CHARS, '').trim().slice(0, 48);
    if (!cleanId || !value || typeof value !== 'object') continue;
    out[cleanId] = {
      played: Math.max(0, Number(value.played) || 0),
      wins: Math.max(0, Number(value.wins) || 0),
      losses: Math.max(0, Number(value.losses) || 0),
      draws: Math.max(0, Number(value.draws) || 0),
    };
  }
  return out;
}

function sanitizeCounterMap(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    const id = Math.max(1, Number(key) || 0);
    const count = Math.max(0, Number(value) || 0);
    if (id && count) out[id] = count;
  }
  return out;
}

function ensureProfileStats(profile) {
  if (!profile.stats) profile.stats = freshProfileStats();
  return profile.stats;
}

function ensureProfileAchievements(profile) {
  if (!profile.achievements) profile.achievements = freshProfileAchievements();
  if (!profile.achievements.unlocked) profile.achievements.unlocked = {};
  return profile.achievements;
}

function profileSnapshotFor(ws) {
  const profile = getProfileById(ws?.profileId);
  if (!profile) return null;
  const view = buildProfileView(profile);
  return {
    id: profile.profileId,
    n: view.name,
    pts: view.points,
    ms: view.playMs,
    kills: view.kills,
    deaths: view.deaths,
    nemesis: view.nemesis,
    prey: view.prey,
    fav: view.favoriteCharacter,
    stats: view.stats,
    achievements: view.achievements,
  };
}

function unlockPendingAchievements({ notify = true } = {}) {
  let dirty = false;
  for (const profile of profiles.values()) {
    const unlocked = unlockProfileAchievements(profile, { notify });
    dirty = unlocked.length > 0 || dirty;
  }
  return dirty;
}

function unlockProfileAchievements(profile, { notify = true } = {}) {
  if (!profile) return [];
  const achievements = ensureProfileAchievements(profile);
  const view = buildProfileView(profile);
  const states = evaluateAchievements(view);
  const now = Date.now();
  const unlocked = [];

  for (const state of states) {
    if (!state.unlocked || achievements.unlocked[state.id]) continue;
    achievements.unlocked[state.id] = now;
    unlocked.push(state.id);
  }

  if (notify && unlocked.length) notifyAchievementUnlocks(profile, unlocked);
  return unlocked;
}

function notifyAchievementUnlocks(profile, ids) {
  const defs = publicAchievements(ACHIEVEMENTS.filter((def) => ids.includes(def.id)));
  if (!defs.length) return;
  const profileView = profileSnapshotFor({ profileId: profile.profileId });
  const msg = JSON.stringify({
    t: 'achievementUnlocked',
    serverNow: Date.now(),
    achievements: defs,
    profile: profileView,
  });

  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && ws.profileId === profile.profileId) ws.send(msg);
  }
}

function inc(obj, key, amount = 1) {
  const cleanKey = String(key ?? '').replace(CONTROL_CHARS, '').trim().slice(0, 48);
  if (!cleanKey) return;
  obj[cleanKey] = Math.max(0, Number(obj[cleanKey]) || 0) + amount;
}

function statProfile(ref) {
  const profileId = Math.max(1, Number(ref?.profileId) || 0);
  return profileId ? getProfileById(profileId) : null;
}

function mapStats(stats, mapId) {
  const id = String(mapId || 'unknown');
  stats.matches.byMap[id] ??= { played: 0, wins: 0, losses: 0, draws: 0 };
  return stats.matches.byMap[id];
}

function processKillStats(feed) {
  let dirty = false;
  for (const kill of feed ?? []) {
    const killerId = Math.max(1, Number(kill.killerProfileId) || 0);
    const victimId = Math.max(1, Number(kill.victimProfileId) || 0);
    if (!killerId || !victimId || killerId === victimId) continue;

    const killer = getProfileById(killerId);
    const victim = getProfileById(victimId);
    if (!killer || !victim) continue;

    killer.killsAgainst[victimId] = (killer.killsAgainst[victimId] ?? 0) + 1;
    victim.deathsBy[killerId] = (victim.deathsBy[killerId] ?? 0) + 1;
    dirty = true;
  }
  if (dirty) {
    dirty = unlockPendingAchievements({ notify: true }) || dirty;
    saveProfiles();
  }
}

function processStatEvents(events) {
  let dirty = false;
  for (const ev of events ?? []) {
    dirty = applyStatEvent(ev) || dirty;
  }
  if (dirty) {
    dirty = unlockPendingAchievements({ notify: true }) || dirty;
    saveProfiles();
  }
}

function applyStatEvent(ev) {
  switch (ev?.k) {
    case 'hit':
      return applyHitStats(ev);
    case 'kill':
      return applyKillEventStats(ev);
    case 'combo':
      return applyComboStats(ev);
    case 'enrage':
      return applyEnrageStats(ev);
    case 'powerup':
      return applyPowerupStats(ev);
    case 'ability_use':
      return applyAbilityUseStats(ev);
    case 'ability_release':
      return applyAbilityReleaseStats(ev);
    case 'shield_block':
      return applyShieldBlockStats(ev);
    case 'protected_hit':
      return applyProtectedHitStats(ev);
    case 'harpoon_pull':
      return applyHarpoonPullStats(ev);
    default:
      return false;
  }
}

function applyHitStats(ev) {
  let dirty = false;
  const source = statProfile(ev.player);
  const target = statProfile(ev.target);

  if (source) {
    const stats = ensureProfileStats(source);
    stats.combat.hits++;
    stats.combat.damageDealt += Math.max(0, Number(ev.actualDamage) || 0);
    if (ev.crit) stats.combat.critHits++;
    if (ev.backstab) stats.combat.backstabHits++;
    if (ev.quickDamage) stats.combat.quickDamageHits++;
    if (ev.buffStack) stats.combat.buffStackHits++;

    if (ev.abilityId) {
      inc(stats.abilities.hits, ev.abilityId);
      if (ev.longRange) inc(stats.abilities.longRangeHits, ev.abilityId);
      if (ev.fullCharge) inc(stats.abilities.fullChargeHits, ev.abilityId);
    }
    dirty = true;
  }

  if (target) {
    const stats = ensureProfileStats(target);
    stats.combat.damageTaken += Math.max(0, Number(ev.actualDamage) || 0);
    if (ev.surviveUnder10Hp) stats.combat.surviveUnder10Hp++;
    dirty = true;
  }

  return dirty;
}

function applyKillEventStats(ev) {
  let dirty = false;
  const killer = ev.credited ? statProfile(ev.player) : null;
  const victim = statProfile(ev.victim);

  if (killer) {
    const stats = ensureProfileStats(killer);
    stats.combat.kills++;
    inc(stats.combat.killsByCause, ev.cause || 'unknown');
    if (ev.firstInMatch) stats.combat.firstBloods++;
    if (ev.sourceHadKebab) stats.combat.killsWhileKebab++;
    if (ev.sourceHadEnrage) stats.combat.killsWhileEnraged++;
    if (ev.sourceHadBerserk) stats.combat.killsWhileBerserk++;
    if (ev.retaliation) stats.combat.revengeKills++;
    if (ev.lowHpKill) stats.combat.lowHpKills++;
    if (ev.targetWasStunned) stats.combat.stunnedKills++;
    if (ev.targetWasStunned && Number(ev.targetStunnedBy) === Number(ev.player?.playerId)) stats.combat.ownStunKills++;
    if (ev.harpoonSetupKill) stats.abilities.harpoonSetupKills++;
    if (ev.abilityId) inc(stats.abilities.kills, ev.abilityId);
    dirty = true;
  }

  if (victim) {
    const stats = ensureProfileStats(victim);
    stats.combat.deaths++;
    inc(stats.combat.deathsByCause, ev.cause || 'unknown');
    if (ev.victimHadBerserk) stats.combat.deathsWhileBerserk++;
    dirty = true;
  }

  return dirty;
}

function applyComboStats(ev) {
  const profile = statProfile(ev.player);
  if (!profile) return false;
  const stats = ensureProfileStats(profile);
  stats.combos.finishers++;
  if (ev.exact) stats.combos.exactFinishers++;
  if (ev.killed) {
    stats.combos.finisherKills++;
    inc(stats.combos.killsById, ev.comboId);
  }
  inc(stats.combos.byId, ev.comboId);
  return true;
}

function applyEnrageStats(ev) {
  const profile = statProfile(ev.player);
  if (!profile) return false;
  ensureProfileStats(profile).combos.enrages++;
  return true;
}

function applyPowerupStats(ev) {
  const profile = statProfile(ev.player);
  if (!profile) return false;
  const stats = ensureProfileStats(profile);
  stats.powerups.total++;
  inc(stats.powerups.byKind, ev.kind);
  if (ev.kind === 'pizza' && ev.lowHp) stats.powerups.pizzaLowHp++;
  if (ev.center) stats.powerups.centerPickups++;
  return true;
}

function applyAbilityUseStats(ev) {
  const profile = statProfile(ev.player);
  if (!profile) return false;
  const stats = ensureProfileStats(profile);
  inc(stats.abilities.used, ev.abilityId);
  if (ev.abilityId === 'blink' && ev.lowHp) stats.abilities.blinkLowHp++;
  if (ev.abilityId === 'blink' && ev.throughPlayer) stats.abilities.blinkThroughPlayer++;
  return true;
}

function applyAbilityReleaseStats(ev) {
  const profile = statProfile(ev.player);
  if (!profile) return false;
  const stats = ensureProfileStats(profile);
  inc(stats.abilities.released, ev.abilityId);
  return true;
}

function applyShieldBlockStats(ev) {
  const profile = statProfile(ev.player);
  if (!profile) return false;
  const stats = ensureProfileStats(profile);
  stats.abilities.shieldBlocks++;
  if (ev.fullSet) stats.abilities.fullShieldSets++;
  return true;
}

function applyProtectedHitStats(ev) {
  const profile = statProfile(ev.player);
  if (!profile) return false;
  ensureProfileStats(profile).combat.protectedHits++;
  return true;
}

function applyHarpoonPullStats(ev) {
  const profile = statProfile(ev.player);
  if (!profile) return false;
  ensureProfileStats(profile).abilities.harpoonPulls++;
  return true;
}

function recordMapVoteStats(match) {
  if (!match || recordedMapVoteStats.has(match.id)) return;
  recordedMapVoteStats.add(match.id);

  let dirty = false;
  const players = [...match.players.values()];
  const selectedMap = match.selectedMap || MAPS[0]?.id || 'unknown';
  const votedSelected = players.filter((player) => match.mapVotes.get(player.id) === selectedMap);
  const unanimous = players.length > 0 && votedSelected.length === players.length;

  for (const player of players) {
    const profile = getProfileById(player.profileId);
    if (!profile) continue;
    const stats = ensureProfileStats(profile);
    const vote = match.mapVotes.get(player.id);
    if (vote) inc(stats.matches.mapVotes, vote);
    if (unanimous) stats.matches.unanimousMapVotes++;
    dirty = true;
  }

  if (dirty) {
    dirty = unlockPendingAchievements({ notify: true }) || dirty;
    saveProfiles();
  }
}

function recordMatchResult(match, matchGame) {
  if (!match || !matchGame || recordedMatchResults.has(match.id)) return;
  recordedMatchResults.add(match.id);
  processKillStats(matchGame.feed);
  matchGame.feed = [];
  processStatEvents(matchGame.events);
  matchGame.events = [];

  const score = match.finalScore ?? matchGame.score ?? { cleo: 0, viking: 0 };
  const winner = score.cleo === score.viking ? null : score.cleo > score.viking ? 'cleo' : 'viking';
  const mapId = match.selectedMap || matchGame.mapId || 'unknown';
  let dirty = false;

  for (const player of matchGame.players.values()) {
    const profile = getProfileById(player.profileId);
    if (!profile) continue;

    const stats = ensureProfileStats(profile);
    const map = mapStats(stats, mapId);
    stats.matches.played++;
    map.played++;

    if (!winner) {
      stats.matches.draws++;
      map.draws++;
    } else if (player.team === winner) {
      stats.matches.wins++;
      map.wins++;
    } else {
      stats.matches.losses++;
      map.losses++;
    }

    stats.matches.bestKills = Math.max(stats.matches.bestKills, player.kills);
    stats.matches.bestCritHits = Math.max(stats.matches.bestCritHits, player.stats?.critHits ?? 0);
    stats.matches.bestPowerups = Math.max(stats.matches.bestPowerups, player.stats?.powerups ?? 0);
    if (player.kills >= 3 && player.deaths === 0) stats.matches.flawless3KillMatches++;
    dirty = true;
  }

  if (dirty) {
    dirty = unlockPendingAchievements({ notify: true }) || dirty;
    saveProfiles();
  }
}

function getProfileById(profileId) {
  for (const profile of profiles.values()) {
    if (profile.profileId === profileId) return profile;
  }
  return null;
}

function buildProfileView(profile) {
  let points = profile.points;
  let playMs = profile.playMs;
  let kills = sumCounterMap(profile.killsAgainst);
  const deaths = sumCounterMap(profile.deathsBy);
  const teamPlayMs = { ...profile.teamPlayMs };

  const active = profile.active;
  if (active) {
    const player = findPlayerById(active.playerId);
    if (player) {
      // Bara den del som annu inte checkpointats in i de permanenta faltarna,
      // annars dubbelraknas det som commitPending redan bokfort.
      const pendingKills = Math.max(0, player.kills - (active.committedKills ?? 0));
      const ms = Math.max(0, (Date.now() - active.startedAt) - (active.committedMs ?? 0));
      points += pendingKills;
      kills += pendingKills;
      playMs += ms;
      teamPlayMs[player.team] = (teamPlayMs[player.team] ?? 0) + ms;
    }
  }

  return {
    name: profile.name || `Player ${profile.profileId}`,
    points,
    playMs,
    kills,
    deaths,
    nemesis: describeMatchup(profile.deathsBy),
    prey: describeMatchup(profile.killsAgainst),
    favoriteCharacter: favoriteCharacter(teamPlayMs),
    stats: profile.stats,
    achievements: ensureProfileAchievements(profile),
  };
}

// Summerar en raknarmapp (profileId -> antal) till ett totalvarde.
function sumCounterMap(map) {
  let total = 0;
  for (const value of Object.values(map ?? {})) total += Math.max(0, Number(value) || 0);
  return total;
}

function describeMatchup(counterMap) {
  let bestId = 0;
  let bestCount = 0;
  for (const [profileId, count] of Object.entries(counterMap ?? {})) {
    const n = Math.max(0, Number(count) || 0);
    const id = Math.max(1, Number(profileId) || 0);
    if (n > bestCount || (n === bestCount && id && id < bestId)) {
      bestId = id;
      bestCount = n;
    }
  }

  if (!bestId || !bestCount) return null;
  const profile = getProfileById(bestId);
  return { name: profile?.name || `Player ${bestId}`, count: bestCount };
}

function favoriteCharacter(teamPlayMs) {
  const cleo = teamPlayMs.cleo ?? 0;
  const viking = teamPlayMs.viking ?? 0;
  if (cleo === 0 && viking === 0) return 'None yet';
  if (cleo === viking) return 'Both Cleo and Viking';
  return cleo > viking ? 'Cleo' : 'Viking';
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastTo(str, predicate) {
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && predicate(ws)) ws.send(str);
  }
}

function sendGameSnapshot(targetGame, predicate) {
  const snap = targetGame.snapshot();
  processKillStats(snap.feed);
  processStatEvents(snap.events);
  delete snap.events;
  snap.lb = leaderboardSnapshot();
  broadcastTo(JSON.stringify(snap), predicate);
}

setInterval(() => {
  broadcastLeaderboard();
}, LEADERBOARD_BROADCAST_MS);

setInterval(() => {
  const changes = matches.advancePhases({
    scoreForMatch: (match) => matchGames.get(match.id)?.score,
  });
  if (!changes.length) return;

  for (const change of changes) {
    if (change.to === MATCH_PHASES.countdown) prepareGameForMatch(change.match);
    if (change.to === MATCH_PHASES.playing) beginFight(change.match);
    if (change.to === MATCH_PHASES.results) {
      const matchGame = matchGames.get(change.match.id);
      recordMatchResult(change.match, matchGame);
      clearGameSessions(change.match.id);
    }
    sendMatch(change.match);
  }

  broadcastLobby();
}, 250);

// --------------------------------------------------------------- spelloopen

let acc = 0;
let last = performance.now();

setInterval(() => {
  const nowMs = performance.now();
  acc += nowMs - last;
  last = nowMs;

  // Ta igen missade tick, men aldrig mer an 5 i rad (undviker dodsspiral).
  let steps = 0;
  while (acc >= TICK_MS && steps < 5) {
    game.update();
    for (const matchGame of matchGames.values()) matchGame.update();
    acc -= TICK_MS;
    steps++;
  }
  if (steps === 5) acc = 0;

  sendGameSnapshot(game, (ws) => !ws.matchId && !!ws.playerId);

  for (const [matchId, matchGame] of matchGames) {
    const match = matches.get(matchId);
    if (!match || ![MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(match.phase)) {
      if (!match) matchGames.delete(matchId);
      continue;
    }
    sendGameSnapshot(matchGame, (ws) => ws.matchId === matchId);
  }
}, TICK_MS);

// Pingar varje sekund. Ger bade en fardig rundtursstid at traffkontrollen och
// en signal om att anslutningen lever - svarar ingen pa 15 sekunder ryker den.
const DEAD_AFTER_MS = 15000;

setInterval(() => {
  const t = Date.now();
  for (const ws of wss.clients) {
    if (ws.readyState !== ws.OPEN) continue;
    if (t - ws.lastPongAt > DEAD_AFTER_MS) {
      ws.terminate();
      continue;
    }
    ws.pingAt = t;
    ws.ping();
  }
}, 1000);

// Checkpointar pagaende sessioner till disk med jamna mellanrum sa poang och
// speltid overlever aven en hard krasch som aldrig hinner kora shutdown().
setInterval(() => {
  let dirty = false;
  for (const profile of profiles.values()) {
    if (commitPending(profile)) dirty = true;
  }
  if (dirty) saveProfiles();
}, AUTOSAVE_MS);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Viking vs Cleo kör!\n');
  console.log(`  Här på datorn:  http://localhost:${PORT}`);
  for (const url of lanUrls(PORT)) console.log(`  På nätverket:   ${url}`);
  console.log('');
});

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

process.on('exit', () => {
  shutdown();
});

function lanUrls(port) {
  const urls = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${port}`);
    }
  }
  return urls;
}
