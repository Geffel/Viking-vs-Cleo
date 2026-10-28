import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';
import { MatchRegistry } from './matches.js';
import { MAX_MESSAGE_BYTES, parseClientMessage } from './protocol.js';
import { claimRoundRegistration, clearRoundRegistration } from './round-registration.js';
import { SqliteProfileStore } from './sqlite-profile-store.js';
import { AccountService } from './account-service.js';
import { installAuthRoutes, readSessionCookie } from './auth-http.js';
import { hashLegacyClientId } from './profile-snapshot.js';
import {
  ProfileStatistics,
  ensureProfileAchievements as ensureStoredAchievements,
  freshProfileAchievements as makeProfileAchievements,
  freshProfileStats as makeProfileStats,
  sanitizeCounterMap as cleanCounterMap,
  sanitizeFactionWins as cleanFactionWins,
  sanitizeProfileAchievements as cleanProfileAchievements,
  sanitizeProfileStats as cleanProfileStats,
} from './profile-statistics.js';
import { TickMetrics } from './tick-metrics.js';
import { ACHIEVEMENTS, achievementUnlockStats, publicAchievements } from '../shared/achievements.js';
import {
  TICK_MS,
  WORLD,
  TEAM_IDS,
  NAME_MAX,
  LAGCOMP,
  LOCAL_SEAT_IDS,
  MATCH_MODES,
  MATCH_PHASES,
  PLAYER,
  MAPS,
  PERFORMANCE_TEST,
  TRAINING,
  mapLayoutFor,
} from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT ?? 3000);
// The load-test endpoint is deliberately unavailable from a normal game start.
const PERFORMANCE_ENABLED = process.env.VVC_PERFORMANCE_ENABLED === '1';
// Tests use a temporary data directory; normal launches keep the existing path.
const DATA_DIR = path.resolve(process.env.VVC_DATA_DIR || path.join(ROOT, 'data'));
const GAME_TIME_SCALE = Math.max(0.01, Number(process.env.GAME_TIME_SCALE) || 1);
const GAME_CLOCK_STARTED_REAL = Date.now();
const GAME_CLOCK_STARTED = GAME_CLOCK_STARTED_REAL;
const gameNow = () => GAME_CLOCK_STARTED + (Date.now() - GAME_CLOCK_STARTED_REAL) * GAME_TIME_SCALE;

// Formatversion for profiles.json. Hoj denna nar sparformatet andras pa ett
// satt som kraver migrering, och lagg till ett steg i migrateProfiles().
const SCHEMA_VERSION = 4;

// Hur ofta pagaende sessioners poang och speltid checkpointas till disk. En
// hard krasch (stromavbrott, kill -9) forlorar da som mest denna tid.
const AUTOSAVE_MS = Math.max(100, Number(process.env.VVC_AUTOSAVE_MS) || 30000);
const LEADERBOARD_BROADCAST_MS = 5000;
const SESSION_REVALIDATE_MS = Math.max(1000, Number(process.env.VVC_SESSION_REVALIDATE_MS) || 60000);
const SNAPSHOT_RATE_HZ = Math.max(10, Math.min(Math.round(1000 / TICK_MS), Number(process.env.NET_SNAPSHOT_HZ) || 30));
const SNAPSHOT_MS = 1000 / SNAPSHOT_RATE_HZ;
// Leaderboarden visar bara toppen: profiles vaxer, men listan stannar pa denna langd.
const LEADERBOARD_MAX_ROWS = 10;
const HOST_SEAT_ID = LOCAL_SEAT_IDS[0] ?? 'P1';

const app = express();
app.use(
  express.static(path.join(ROOT, 'public'), {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) res.set('Cache-Control', 'no-store');
      else if (filePath.endsWith('.ogg')) res.type('audio/ogg');
      else if (filePath.endsWith('.mp3')) res.type('audio/mpeg');
      else if (filePath.endsWith('.wav')) res.type('audio/wav');
    },
  }),
);
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.get('/performance-test', (_req, res) => {
  if (!PERFORMANCE_ENABLED) return res.sendStatus(404);
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});
app.get('/api/performance-test', (_req, res) => {
  if (!PERFORMANCE_ENABLED) return res.sendStatus(404);
  res.json({ ready: true, featureVersion: 3, localObserver: true, dedicatedPage: true,
    minBots: PERFORMANCE_TEST.minBots, maxBots: PERFORMANCE_TEST.maxBots });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

// Legacy-spelet finns kvar for direktjoin-vagen, men lobby-matcher far egna
// Game-instanser nar deras countdown startar.
const game = new Game({ clock: gameNow });
const matchGames = new Map();
const matches = new MatchRegistry();
const profiles = new Map();
const profileStore = new SqliteProfileStore({ dataDir: DATA_DIR });
const accountService = new AccountService({ dataDir: DATA_DIR });
const profileStatistics = new ProfileStatistics({ getProfileById });
const tickMetrics = new TickMetrics();
const recordedMapVoteStats = new Set();
const recordedMatchResults = new Set();
const globalStats = {
  factionWins: { cleo: 0, viking: 0 },
};
let nextProfileId = 1;
let nextSessionId = 1;
let shuttingDown = false;
let lastLeaderboardBroadcastSig = '';

// Deklareras fore loadProfiles() - den anropar cleanClientId/cleanName som
// laser denna, och en const i temporal dead zone skulle annars krascha inlasningen.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

if (existsSync(path.join(DATA_DIR, 'profiles.json')) && !existsSync(profileStore.filePath)) {
  throw new Error('Legacy profiles.json must be imported with npm run profiles:import before the server can start');
}
await profileStore.open();
await accountService.open();
await loadProfiles();

installAuthRoutes(app, accountService, {
  onRegistered(result) {
    const profile = createProfile(result.profileId, result.displayName);
    profiles.set(`account:${result.profileId}`, profile);
    nextProfileId = Math.max(nextProfileId, result.profileId + 1);
  },
  onMigrated(clientId, result) {
    const clientIdHash = hashLegacyClientId(clientId);
    const profile = profiles.get(clientIdHash);
    if (profile) {
      profiles.delete(clientIdHash);
      profile.clientIdHash = '';
      profile.name = result.displayName;
      profiles.set(`account:${result.profileId}`, profile);
    }
  },
  onLoggedOut(sessionToken) {
    for (const ws of wss.clients) {
      if (ws.sessionToken === sessionToken) closeUnauthenticatedSocket(ws, 'Session revoked');
    }
  },
});

server.on('upgrade', async (request, socket, head) => {
  socket.on('error', () => {});
  if (!isAllowedWebSocketOrigin(request)) {
    rejectWebSocketUpgrade(socket, 403, 'Forbidden');
    return;
  }

  const sessionToken = readSessionCookie(request);
  const performanceGuest = isLocalPerformanceRequest(request);
  let authSession = null;
  if (sessionToken) {
    try { authSession = await accountService.verifySession(sessionToken); } catch { authSession = null; }
  }
  if (!performanceGuest && (!authSession?.accountId || !authSession?.profileId || !getProfileById(authSession.profileId))) {
    rejectWebSocketUpgrade(socket, 401, 'Authentication required');
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request, authSession, sessionToken, performanceGuest);
  });
});

wss.on('connection', (ws, _request, authSession, sessionToken, performanceGuest = false) => {
  ws.sessionId = nextSessionId++;
  ws.sessionToken = sessionToken;
  ws.performanceGuest = !!performanceGuest;
  ws.accountId = authSession?.accountId ?? 0;
  ws.authProfileId = authSession?.profileId ?? 0;
  ws.name = '';
  ws.hasLoggedJoin = false;
  ws.clientId = null;
  ws.profileId = ws.authProfileId ?? 0;
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

  // ws emits an error when rejecting oversized/invalid frames. The offending
  // connection is closed by ws; it must not take the server down with it.
  ws.on('error', () => {});
  ws.on('message', (raw, isBinary) => {
    const msg = parseClientMessage(raw, isBinary);
    if (!msg) return;
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    if (ws.name) {
      const match = ws.matchId ? matches.get(ws.matchId) : null;
      gameLog('PLAYER', `Left: ${playerLabel(ws)}${match ? `, ${matchLabel(match)}` : ''}.`);
    }
    const hadMatch = !!ws.matchId;
    if (ws.playerId) removePlayerSession(ws);
    if (ws.matchId) leaveLobbyMatch(ws);
    if (hadMatch) broadcastLobby();
  });
});

function handleMessage(ws, msg) {
  if ((!ws.accountId || !ws.authProfileId) && !ws.performanceGuest) {
    send(ws, { t: 'appError', code: 'AUTH_REQUIRED', message: 'Authentication required.' });
    ws.close(1008, 'Authentication required');
    return;
  }
  switch (msg.t) {
    case 'clientPing': {
      send(ws, { t: 'clientPong', id: Math.max(0, Number(msg.id) || 0), serverNow: Date.now() });
      break;
    }
    case 'identify': {
      identifySocket(ws);
      send(ws, {
        t: 'identified',
        serverNow: Date.now(),
        sessionId: ws.sessionId,
        name: ws.name,
        profileId: ws.profileId,
        profile: profileSnapshotFor(ws),
        matches: matches.list(),
        match: ws.matchId ? matches.snapshot(ws.matchId) : null,
        achievementStats: achievementStatsSnapshot(),
      });
      broadcastLobby();
      break;
    }
    case 'createMatch': {
      if (!requireIdentity(ws)) return;
      if (msg.mode === MATCH_MODES.performance && !PERFORMANCE_ENABLED) {
        send(ws, { t: 'appError', code: 'PERFORMANCE_DISABLED', message: 'Performance tests are disabled on this server.' });
        return;
      }
      if (ws.performanceGuest && msg.mode !== MATCH_MODES.performance) {
        send(ws, { t: 'appError', code: 'PERFORMANCE_ONLY', message: 'Local test observers can only create performance tests.' });
        return;
      }
      if (ws.playerId) removePlayerSession(ws);
      if (ws.matchId) leaveLobbyMatch(ws);
      const match = matches.create(sessionPlayer(ws), {
        training: msg.mode === MATCH_MODES.training,
        performance: msg.mode === MATCH_MODES.performance,
        maxBots: msg.maxBots,
      });
      ws.matchId = match.id;
      gameLog('MATCH', `Created ${matchLabel(match)} by ${playerLabel(ws)}.`);
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
      if (isSoloTestMatch(match)) {
        send(ws, { t: 'appError', message: 'That is a private test session.' });
        return;
      }
      if (match.closed || match.mode === MATCH_MODES.sharedScreen) {
        send(ws, { t: 'appError', message: 'That match is shared screen and closed to online joiners.' });
        return;
      }
      if (ws.matchId && ws.matchId !== matchId) leaveLobbyMatch(ws);
      const joined = matches.addPlayer(matchId, sessionPlayer(ws));
      if (!joined) {
        send(ws, {
          t: 'appError',
          message: match.closed ? 'That match is closed to online joiners.' : "That match can't be joined right now.",
        });
        return;
      }
      ws.matchId = joined.id;
      gameLog('MATCH', `${playerLabel(ws)} joined ${matchLabel(joined)}.`);
      broadcastLobby();
      sendMatch(joined);
      break;
    }
    case 'setSharedScreenMode': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error } = matches.setSharedScreenMode(result.id, ws.sessionId, !!msg.enabled);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      broadcastLobby();
      sendMatch(match);
      break;
    }
    case 'wakeLocalSeat': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error } = matches.addLocalSeat(result.id, ws.sessionId, cleanInputDevice(msg.inputDevice));
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      broadcastLobby();
      sendMatch(match);
      break;
    }
    case 'setLocalSeatCharacter': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error } = matches.setLocalSeatCharacter(result.id, ws.sessionId, msg.seatId, msg.character);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      sendMatch(match);
      break;
    }
    case 'setLocalSeatReady': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error } = matches.setLocalSeatReady(result.id, ws.sessionId, msg.seatId, !!msg.ready);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      sendMatch(match);
      break;
    }
    case 'removeLocalSeat': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error } = matches.removeLocalSeat(result.id, ws.sessionId, msg.seatId);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      broadcastLobby();
      sendMatch(match);
      break;
    }
    case 'setLocalSeatConnected': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error } = matches.setLocalSeatConnected(result.id, ws.sessionId, cleanInputDevice(msg.inputDevice), !!msg.connected);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      sendMatch(match);
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
      // Privata solotest har ingen att vanta pa: valt fighter tar en direkt till kartvalet.
      if (isSoloTestMatch(match) && match.phase === MATCH_PHASES.matchLobby) {
        const started = matches.start(match.id, ws.sessionId);
        sendMatch(started.match ?? match);
        break;
      }
      sendMatch(match);
      // Sen anslutare som valt karaktar mitt i countdown/playing spawnas direkt in.
      if (!ws.playerId && [MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(match.phase)) {
        spawnLateJoiner(match, ws);
        broadcastLobby();
      }
      break;
    }
    case 'trainingSwitchCharacter': {
      const result = requireMatch(ws);
      if (!result) return;
      if (!isTrainingMatch(result)) {
        send(ws, { t: 'appError', message: 'Character switching is training only.' });
        return;
      }
      if (![MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(result.phase)) {
        send(ws, { t: 'appError', message: "The training session isn't running." });
        return;
      }
      if (!TEAM_IDS.includes(msg.character)) {
        send(ws, { t: 'appError', message: 'Unknown character.' });
        return;
      }
      const { match, error } = switchTrainingCharacter(ws, result, msg.character);
      if (error) {
        send(ws, { t: 'appError', message: error });
        return;
      }
      sendMatch(match);
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
      logMatchFinished(match);
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
      clearRecordedRound(match);
      clearGameSessions(match.id);
      broadcastLobby();
      sendMatch(match);
      break;
    }
    case 'voteMap': {
      const result = requireMatch(ws);
      if (!result) return;
      const { match, error, change } = matches.voteMap(result.id, ws.sessionId, msg.mapId, msg.seatId);
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
      if (!requireIdentity(ws)) return;
      if (ws.playerId) return;
      const team = TEAM_IDS.includes(msg.team) ? msg.team : game.suggestTeam();
      const identity = identityForSocket(ws);
      const name = getProfileById(identity.profileId).name;
      ws.name = name;
      ws.clientId = null;
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
      const control = controlledPlayerForMessage(ws, msg);
      if (control?.player) control.game.setMove(control.player, msg.l, msg.r);
      break;
    }
    case 'act': {
      const control = controlledPlayerForMessage(ws, msg);
      if (control?.player) {
        control.player.halfRtt = ws.halfRtt;
        const shared = matches.get(ws.matchId)?.mode === MATCH_MODES.sharedScreen;
        control.game.action(control.player, msg.a, msg.view,
          shared ? [...control.game.players.keys()] : [control.player.id]);
      }
      break;
    }
    case 'actup': {
      const control = controlledPlayerForMessage(ws, msg);
      if (control?.player) control.game.releaseAction(control.player, msg.a);
      break;
    }
    case 'leave': {
      if (ws.playerId) removePlayerSession(ws);
      break;
    }
  }
}

function closeUnauthenticatedSocket(ws, reason = 'Authentication required') {
  if (ws.readyState !== ws.OPEN) return;
  send(ws, { t: 'appError', code: 'AUTH_REQUIRED', message: `${reason}.` });
  ws.close(1008, reason);
}

function identifySocket(ws) {
  if (ws.performanceGuest) {
    ws.name = 'Performance observer';
    ws.clientId = null;
    ws.profileId = 0;
    return;
  }
  const accountProfile = getProfileById(ws.authProfileId);
  const identity = identityForSocket(ws);
  ws.name = accountProfile.name;
  ws.clientId = null;
  ws.profileId = identity.profileId;

  if (!ws.hasLoggedJoin) {
    ws.hasLoggedJoin = true;
    gameLog('PLAYER', `Joined: ${playerLabel(ws)}, online: ${activeNamedConnections()}.`);
  }

  if (ws.matchId) {
    const match = matches.get(ws.matchId);
    const row = match?.players.get(ws.sessionId);
    if (row) {
      row.n = ws.name;
      row.profileId = ws.profileId;
      match.updatedAt = Date.now();
    }
  }
}

function identityForSocket(ws) {
  return { clientId: null, profileId: ws.authProfileId };
}

function requireIdentity(ws) {
  if (ws.performanceGuest) {
    if (ws.name) return true;
    send(ws, { t: 'appError', message: 'Identify the local test observer first.' });
    return false;
  }
  if (!ws.accountId || !ws.authProfileId || !getProfileById(ws.authProfileId)) {
    send(ws, { t: 'appError', code: 'AUTH_REQUIRED', message: 'Authentication required.' });
    return false;
  }
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

function controlledPlayerForMessage(ws, msg) {
  const match = ws.matchId ? matches.get(ws.matchId) : null;
  if (match?.mode === MATCH_MODES.sharedScreen && msg?.seatId) {
    if (match.phase !== MATCH_PHASES.playing || match.hostId !== ws.sessionId) return null;
    const seatId = cleanSeatId(msg.seatId);
    const seat = seatId ? match.localSeats.get(seatId) : null;
    const playerId = seat ? match.seatPlayerIds.get(seat.id) || seat.playerId : 0;
    const matchGame = matchGames.get(match.id);
    const player = playerId ? matchGame?.players.get(playerId) : null;
    return player && matchGame ? { game: matchGame, player } : null;
  }

  if (!canControlGame(ws)) return null;
  const sessionGame = gameForSocket(ws);
  const player = sessionGame?.players.get(ws.playerId);
  return player && sessionGame ? { game: sessionGame, player } : null;
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

  const oldMatch = matches.get(oldId);
  const match = matches.removePlayer(oldId, ws.sessionId);
  if (!match) {
    clearRecordedRound(oldMatch);
    clearGameSessions(oldId);
    if (oldMatch) gameLog('MATCH', `Abandoned ${matchLabel(oldMatch)}; no players remain.`);
  } else {
    gameLog('MATCH', `${playerLabel(ws)} left ${matchLabel(match)}.`);
  }
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
  const training = isTrainingMatch(match);
  const performanceTest = isPerformanceTestMatch(match);
  const matchGame = new Game({
    clock: gameNow,
    layout: mapLayoutFor(match.selectedMap),
    mapId: match.selectedMap,
    abilityCooldownCap: training
      ? TRAINING.abilityCooldownMs
      : performanceTest ? PERFORMANCE_TEST.abilityCooldownMs : 0,
  });
  matchGames.set(match.id, matchGame);

  if (match.mode === MATCH_MODES.sharedScreen) {
    const hostWs = socketBySession(match.hostId);
    if (!hostWs || hostWs.readyState !== hostWs.OPEN) return;

    const localPlayers = [...match.localSeats.values()]
      .sort((a, b) => LOCAL_SEAT_IDS.indexOf(a.id) - LOCAL_SEAT_IDS.indexOf(b.id))
      .filter((seat) => seat.character)
      .map((seat) => {
        const p = matchGame.addPlayer(seat.name || seat.id, seat.character, {
          clientId: null,
          profileId: 0,
        });
        p.halfRtt = hostWs.halfRtt;
        p.invulnUntil = Math.max(p.invulnUntil, match.countdownEndsAt + PLAYER.spawnProtectionMs);
        matches.setLocalSeatPlayer(match.id, seat.id, p.id);
        if (seat.id === HOST_SEAT_ID) hostWs.playerId = p.id;
        return { seatId: seat.id, playerId: p.id, team: p.team, name: p.name };
      });

    const primary = localPlayers.find((player) => player.seatId === HOST_SEAT_ID) ?? localPlayers[0] ?? null;
    if (!primary) return;

    send(hostWs, {
      t: 'gameReady',
      serverNow: Date.now(),
      id: primary.playerId,
      name: primary.name,
      team: primary.team,
      profileId: 0,
      localPlayers,
      profile: profileSnapshotFor(hostWs),
      match: matches.snapshot(match.id),
      achievementStats: achievementStatsSnapshot(),
    });
    return;
  }

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
    // Traningen ar orankad: speltid och kills far inte bokforas i profilen.
    if (match.statsEnabled !== false) activateProfile(p);

    send(ws, {
      t: 'gameReady',
      serverNow: Date.now(),
      id: p.id,
      name: p.name,
      team: p.team,
      profileId: p.profileId,
      profile: profileSnapshotFor(ws),
      match: matches.snapshot(match.id),
      achievementStats: achievementStatsSnapshot(),
    });
  }

  if (training) syncTrainingBot(match, matchGame);
  else if (performanceTest) syncPerformanceBots(match, matchGame);
}

function isTrainingMatch(match) {
  return match?.mode === MATCH_MODES.training;
}

function isPerformanceTestMatch(match) {
  return match?.mode === MATCH_MODES.performance;
}

function isSoloTestMatch(match) {
  return isTrainingMatch(match) || isPerformanceTestMatch(match);
}

/** Skapar den valda maxlasten och fordelar lagen och startpositionerna. */
function syncPerformanceBots(match, matchGame = matchGames.get(match.id)) {
  if (!matchGame) return [];
  for (const other of [...matchGame.players.values()]) {
    if (other.bot) matchGame.removePlayer(other.id);
  }

  const count = Math.max(
    PERFORMANCE_TEST.minBots,
    Math.min(PERFORMANCE_TEST.maxBots, Math.round(Number(match.maxBots) || PERFORMANCE_TEST.defaultBots)),
  );
  const bots = [];
  for (let index = 0; index < count; index++) {
    const bot = matchGame.addBot(index % 2 ? 'viking' : 'cleo', { combat: true, index });
    const fraction = count === 1 ? 0.5 : index / (count - 1);
    bot.x = 80 + fraction * (WORLD.w - 160);
    bot.y = 80 + (index % 3) * 65;
    bot.history.length = 0;
    bots.push(bot);
  }
  return bots;
}

/**
 * Ser till att det star exakt en traningsdocka i arenan, av motsatt karaktar
 * mot den spelaren valt. Kors bade nar matchen startar och vid karaktarsbyte.
 */
function syncTrainingBot(match, matchGame = matchGames.get(match.id)) {
  if (!matchGame) return null;

  for (const other of [...matchGame.players.values()]) {
    if (other.bot) matchGame.removePlayer(other.id);
  }

  const hero = [...matchGame.players.values()][0];
  if (!hero) return null;
  return matchGame.addBot(oppositeTeam(hero.team));
}

function oppositeTeam(team) {
  return team === 'viking' ? 'cleo' : 'viking';
}

/**
 * Byter karaktar mitt i traningen: spelaren spawnas om som det andra laget och
 * dockan byter till motsatt sida. Allt gammalt tillstand (cooldowns, buffar,
 * combo) foljer inte med - den nya karaktaren borjar rent.
 */
function switchTrainingCharacter(ws, match, character) {
  const matchGame = matchGames.get(match.id);
  if (!matchGame) return { error: "The training session isn't running." };

  const old = ws.playerId ? matchGame.players.get(ws.playerId) : null;
  if (old?.team === character) return { match };

  const { error } = matches.setCharacter(match.id, ws.sessionId, character);
  if (error) return { error };

  if (old) matchGame.removePlayer(old.id);
  const p = matchGame.addPlayer(ws.name, character, { clientId: ws.clientId, profileId: ws.profileId });
  p.halfRtt = ws.halfRtt;
  p.invulnUntil = Math.max(p.invulnUntil, Date.now() + PLAYER.spawnProtectionMs);
  ws.playerId = p.id;
  syncTrainingBot(match, matchGame);

  send(ws, {
    t: 'gameReady',
    serverNow: Date.now(),
    id: p.id,
    name: p.name,
    team: p.team,
    profileId: p.profileId,
    profile: profileSnapshotFor(ws),
    match: matches.snapshot(match.id),
    achievementStats: achievementStatsSnapshot(),
  });
  return { match };
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
    achievementStats: achievementStatsSnapshot(),
  });
}

function beginFight(match) {
  const now = Date.now();
  const matchGame = matchGames.get(match.id);
  if (!matchGame) return;
  matchGame.markStarted(now);

  if (match.mode === MATCH_MODES.sharedScreen) {
    for (const p of matchGame.players.values()) {
      p.invulnUntil = Math.max(p.invulnUntil, now + PLAYER.spawnProtectionMs);
    }
    return;
  }

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

function activeNamedConnections() {
  let count = 0;
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && ws.name) count++;
  }
  return count;
}

function cleanName(raw) {
  const name = String(raw ?? '').replace(CONTROL_CHARS, '').trim().slice(0, NAME_MAX);
  return name || `Player${Math.floor(Math.random() * 900 + 100)}`;
}

function cleanClientId(raw) {
  const id = String(raw ?? '').replace(CONTROL_CHARS, '').trim().slice(0, 80);
  return /^[a-zA-Z0-9-]+$/.test(id) ? id : '';
}

function cleanInputDevice(raw) {
  const type = raw?.type === 'gamepad' ? 'gamepad' : raw?.type === 'keyboard' ? 'keyboard' : '';
  if (type === 'keyboard') return { type };
  if (type !== 'gamepad') return { type: '' };

  const index = Math.max(0, Math.min(15, Math.floor(Number(raw.index) || 0)));
  const label = String(raw.label ?? '').replace(CONTROL_CHARS, '').trim().slice(0, 80);
  return label ? { type, index, label } : { type, index };
}

function cleanSeatId(raw) {
  const id = String(raw ?? '').replace(CONTROL_CHARS, '').trim().toUpperCase();
  return LOCAL_SEAT_IDS.includes(id) ? id : '';
}

function activateProfile(player) {
  const profile = getProfileById(player.profileId);
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
  const profile = getProfileById(player?.profileId);
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

    rows.push(leaderboardRow(profile, view));
  }

  rows.sort((a, b) => b.pts - a.pts || b.ms - a.ms || a.n.localeCompare(b.n, 'sv'));
  return rows.slice(0, LEADERBOARD_MAX_ROWS);
}

function leaderboardRow(profile, view) {
  const matches = view.stats?.matches ?? {};
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
    stats: {
      matches: {
        played: Math.max(0, Number(matches.played) || 0),
        wins: Math.max(0, Number(matches.wins) || 0),
      },
    },
  };
}

function leaderboardPayload(rows = leaderboardSnapshot(), { includeAchievementStats = false } = {}) {
  const payload = {
    t: 'leaderboard',
    serverNow: Date.now(),
    lb: rows,
    matches: leaderboardMatchesSnapshot(),
    summary: leaderboardSummary(rows),
  };
  if (includeAchievementStats) payload.achievementStats = achievementStatsSnapshot();
  return payload;
}

function achievementStatsSnapshot() {
  return achievementUnlockStats([...profiles.values()].map((profile) => buildProfileView(profile)));
}

function leaderboardSummary(rows = leaderboardSnapshot()) {
  const matchList = leaderboardMatchesSnapshot();
  let totalKills = 0;
  let totalPlayMs = 0;
  let totalMatches = 0;
  let totalPowerups = 0;
  let totalKebabs = 0;

  for (const profile of profiles.values()) {
    const view = buildProfileView(profile);
    totalKills += view.kills;
    totalPlayMs += view.playMs;
    totalMatches += Math.max(0, Number(view.stats?.matches?.played) || 0);
    totalPowerups += Math.max(0, Number(view.stats?.powerups?.total) || 0);
    totalKebabs += Math.max(0, Number(view.stats?.powerups?.byKind?.kebab) || 0);
  }

  return {
    totalProfiles: profiles.size,
    shownProfiles: rows.length,
    activePlayers: activeNamedConnections(),
    activeMatches: matchList.length,
    liveMatches: matchList.filter((match) => [MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(match.phase)).length,
    totalKills,
    totalPlayMs,
    totalMatches,
    totalPowerups,
    totalKebabs,
    factionPoints: {
      cleo: globalStats.factionWins.cleo,
      viking: globalStats.factionWins.viking,
    },
  };
}

function leaderboardMatchesSnapshot() {
  return matches.list().map((match) => ({
    id: match.id,
    title: match.title,
    phase: match.phase,
    mode: match.mode,
    sharedScreen: match.sharedScreen,
    playerCount: match.playerCount,
    selectedMap: match.selectedMap,
    finalScore: match.finalScore,
    voteEndsAt: match.voteEndsAt,
    countdownEndsAt: match.countdownEndsAt,
    matchEndsAt: match.matchEndsAt,
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
      entry.stats?.matches?.played ?? 0,
      entry.stats?.matches?.wins ?? 0,
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

async function loadProfiles() {
  try {
    const stored = await profileStore.load();
    if (!stored) return;
    const data = migrateProfiles(stored);
    nextProfileId = Math.max(1, Number(data.nextProfileId) || 1);
    globalStats.factionWins = cleanFactionWins(data.globalStats?.factionWins);

    for (const row of data.profiles ?? []) {
      const clientIdHash = row.clientIdHash || (cleanClientId(row.clientId) ? hashLegacyClientId(row.clientId) : '');
      const profileId = Math.max(1, Number(row.profileId) || nextProfileId++);
      const hasLegacyId = /^[a-f0-9]{64}$/.test(clientIdHash);
      const migrated = row.legacyStatus === 'migrated' || !!row.accountId;
      if (!hasLegacyId && !migrated) continue;
      const profile = createProfile(profileId, row.name);
      profile.clientIdHash = migrated ? '' : clientIdHash;
      profile.points = Math.max(0, Number(row.points) || 0);
      profile.playMs = Math.max(0, Number(row.playMs) || 0);
      profile.seen = Math.max(0, Number(row.seen) || 0);
      profile.lastSeenAt = Math.max(0, Number(row.lastSeenAt) || 0);
      profile.killsAgainst = cleanCounterMap(row.killsAgainst);
      profile.deathsBy = cleanCounterMap(row.deathsBy);
      profile.teamPlayMs = {
        cleo: Math.max(0, Number(row.teamPlayMs?.cleo) || 0),
        viking: Math.max(0, Number(row.teamPlayMs?.viking) || 0),
      };
      profile.stats = cleanProfileStats(row.stats);
      profile.achievements = cleanProfileAchievements(row.achievements);
      profileStatistics.unlockAchievements(new Set([profile]));
      profiles.set(migrated ? `account:${profileId}` : clientIdHash, profile);
      nextProfileId = Math.max(nextProfileId, profileId + 1);
    }
  } catch (err) {
    console.warn('Kunde inte lasa profiler:', err.message);
    throw err;
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
    const data = {
        version: SCHEMA_VERSION,
        nextProfileId,
        globalStats,
        profiles: [...profiles.values()].map((profile) => ({
        clientIdHash: profile.clientIdHash,
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
    profileStore.save(data);
  } catch (err) {
    console.warn('Kunde inte spara profiler:', err.message);
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  gameLog('SERVER', 'Shutting down gracefully.');

  for (const player of allPlayers()) finalizeProfile(player);
  saveProfiles();
  try {
    await profileStore.close();
  } catch (err) {
    console.error('Kunde inte tomma profilkon:', err.message);
    process.exitCode = 1;
  }
  try {
    await accountService.close();
  } catch (err) {
    console.error('Kunde inte stanga kontolagret:', err.message);
    process.exitCode = 1;
  }
  const timing = tickMetrics.snapshot();
  if (timing.ticks) {
    gameLog(
      'TICK',
      `samples=${timing.sampledTicks}, p95=${timing.p95Ms.toFixed(3)} ms, ` +
        `p99=${timing.p99Ms.toFixed(3)} ms, max=${timing.maxMs.toFixed(3)} ms.`,
    );
  }
}

function createProfile(profileId, name) {
  return {
    clientIdHash: '',
    profileId,
    name: cleanName(name),
    points: 0,
    playMs: 0,
    seen: 0,
    lastSeenAt: 0,
    killsAgainst: {},
    deathsBy: {},
    teamPlayMs: { cleo: 0, viking: 0 },
    stats: makeProfileStats(),
    achievements: makeProfileAchievements(),
    active: null,
  };
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

function notifyAchievementUnlocks(profile, ids) {
  const defs = publicAchievements(ACHIEVEMENTS.filter((def) => ids.includes(def.id)));
  if (!defs.length) return;
  const profileView = profileSnapshotFor({ profileId: profile.profileId });
  const msg = JSON.stringify({
    t: 'achievementUnlocked',
    serverNow: Date.now(),
    achievements: defs,
    profile: profileView,
    achievementStats: achievementStatsSnapshot(),
  });

  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && ws.profileId === profile.profileId) ws.send(msg);
  }
}

function processKillStats(feed) {
  persistChangedProfiles(profileStatistics.applyKillFeed(feed));
}

function processStatEvents(events) {
  persistChangedProfiles(profileStatistics.applyEvents(events));
}

function persistChangedProfiles(changedProfiles, { notify = true, force = false } = {}) {
  if (!changedProfiles?.size && !force) return false;
  for (const { profile, ids } of profileStatistics.unlockAchievements(changedProfiles)) {
    if (notify) notifyAchievementUnlocks(profile, ids);
  }
  saveProfiles();
  return true;
}

function recordMapVoteStats(match) {
  if (!claimRoundRegistration(recordedMapVoteStats, match)) return;
  if (match.statsEnabled === false) return;
  persistChangedProfiles(profileStatistics.applyMapVote(match, MAPS[0]?.id || 'unknown'));
}

function recordMatchResult(match, matchGame) {
  if (!matchGame || !claimRoundRegistration(recordedMatchResults, match)) return;
  if (match.statsEnabled === false || match.resultCounts === false) {
    matchGame.feed = [];
    matchGame.events = [];
    return;
  }

  processKillStats(matchGame.feed);
  matchGame.feed = [];
  processStatEvents(matchGame.events);
  matchGame.events = [];

  const { changed, winner } = profileStatistics.applyMatchResult(match, matchGame);
  if (winner) globalStats.factionWins[winner]++;
  persistChangedProfiles(changed, { force: !!winner });
}

function clearRecordedRound(match) {
  clearRoundRegistration(recordedMapVoteStats, match);
  clearRoundRegistration(recordedMatchResults, match);
}

function gameLog(category, message) {
  console.log(`[${category}] ${message}`);
}

function playerLabel({ name, profileId }) {
  const id = Math.max(0, Number(profileId) || 0);
  return id ? `${name} (#${id})` : name || 'Unknown player';
}

function matchLabel(match) {
  const mode = match.mode === MATCH_MODES.training
    ? 'training'
    : match.mode === MATCH_MODES.performance
      ? 'performance test'
      : match.mode === MATCH_MODES.sharedScreen ? 'shared screen' : 'online';
  return `#${match.id} (${mode})`;
}

function logMatchStarted(match) {
  gameLog('MATCH', `Started ${matchLabel(match)}, map: ${match.selectedMap || 'unknown map'}, players: ${match.players.size}.`);
}

function logMatchFinished(match) {
  if (!match?.finishedAt || match.loggedFinishedAt === match.finishedAt) return;
  match.loggedFinishedAt = match.finishedAt;

  const score = match.finalScore ?? { cleo: 0, viking: 0 };
  const winner = score.cleo === score.viking ? 'draw' : score.cleo > score.viking ? 'Team Cleo' : 'Team Viking';
  const ranking = match.resultCounts === false ? `, unranked: ${match.unrankedReason ?? 'yes'}` : '';
  gameLog(
    'MATCH',
    `Finished ${matchLabel(match)}, map: ${match.selectedMap || 'unknown map'}, score: Team Viking ${score.viking}–${score.cleo} Team Cleo, winner: ${winner}${ranking}.`,
  );
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
  // Nya killfeed-handelser bokfors direkt i bade motstandarkartan och combat-
  // statistiken. Aldre profilversioner kan bara ha en av dessa eller points,
  // sa det hogsta bestendiga vardet bevarar historiken utan live-dubbelrakning.
  const kills = Math.max(
    sumCounterMap(profile.killsAgainst),
    Math.max(0, Number(profile.stats?.combat?.kills) || 0),
    Math.max(0, Number(profile.points) || 0),
  );
  const deaths = Math.max(
    sumCounterMap(profile.deathsBy),
    Math.max(0, Number(profile.stats?.combat?.deaths) || 0),
  );
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
    achievements: ensureStoredAchievements(profile),
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

function isAllowedWebSocketOrigin(request) {
  const host = String(request.headers.host ?? '').toLowerCase();
  const origin = String(request.headers.origin ?? '');
  if (!host || !origin) return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function isLocalPerformanceRequest(request) {
  if (!PERFORMANCE_ENABLED) return false;
  const remote = String(request.socket?.remoteAddress ?? '').toLowerCase();
  const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  if (!loopback) return false;
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    return url.pathname.replace(/\/+$/, '') === '/performance-test' || url.searchParams.get('performanceTest') === '1';
  } catch {
    return false;
  }
}

function rejectWebSocketUpgrade(socket, status, message) {
  if (!socket.writable) return socket.destroy();
  const body = `${message}\n`;
  socket.end(
    `HTTP/1.1 ${status} ${message}\r\n` +
    'Connection: close\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

function broadcastTo(str, predicate) {
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN && predicate(ws)) ws.send(str);
  }
}

function sendGameSnapshot(targetGame, predicate, { statsEnabled = true } = {}) {
  const snap = targetGame.snapshot();
  if (statsEnabled) {
    processKillStats(snap.feed);
    processStatEvents(snap.events);
  }
  delete snap.events;
  broadcastTo(JSON.stringify(snap), predicate);
}

setInterval(() => {
  broadcastLeaderboard();
}, LEADERBOARD_BROADCAST_MS);

// A WebSocket may outlive the cookie that opened it. Revalidate active
// sessions so expiry, password resets and server-side revocation also remove
// access from already connected game clients.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState !== ws.OPEN || ws.sessionCheckPending || ws.performanceGuest) continue;
    ws.sessionCheckPending = true;
    accountService.verifySession(ws.sessionToken)
      .then((session) => {
        if (!session || session.accountId !== ws.accountId || session.profileId !== ws.authProfileId) {
          closeUnauthenticatedSocket(ws, 'Session expired');
        }
      })
      .catch(() => closeUnauthenticatedSocket(ws, 'Session verification failed'))
      .finally(() => { ws.sessionCheckPending = false; });
  }
}, SESSION_REVALIDATE_MS);

setInterval(() => {
  const changes = matches.advancePhases({
    scoreForMatch: (match) => matchGames.get(match.id)?.score,
  });
  if (!changes.length) return;

  for (const change of changes) {
    if (change.to === MATCH_PHASES.countdown) prepareGameForMatch(change.match);
    if (change.to === MATCH_PHASES.playing) {
      beginFight(change.match);
      logMatchStarted(change.match);
    }
    if (change.to === MATCH_PHASES.results) {
      const matchGame = matchGames.get(change.match.id);
      recordMatchResult(change.match, matchGame);
      logMatchFinished(change.match);
      clearGameSessions(change.match.id);
    }
    sendMatch(change.match);
  }

  broadcastLobby();
}, 250);

// --------------------------------------------------------------- spelloopen

let acc = 0;
let snapshotAcc = SNAPSHOT_MS;
let last = performance.now();

setInterval(() => {
  const tickStarted = performance.now();
  const nowMs = performance.now();
  const elapsed = nowMs - last;
  acc += elapsed;
  snapshotAcc += elapsed;
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

  if (snapshotAcc >= SNAPSHOT_MS) {
    snapshotAcc %= SNAPSHOT_MS;

    sendGameSnapshot(game, (ws) => !ws.matchId && !!ws.playerId);

    for (const [matchId, matchGame] of matchGames) {
      const match = matches.get(matchId);
      if (!match || ![MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(match.phase)) {
        if (!match) matchGames.delete(matchId);
        continue;
      }
      sendGameSnapshot(matchGame, (ws) => ws.matchId === matchId, { statsEnabled: match.statsEnabled !== false });
    }
  }
  tickMetrics.record(performance.now() - tickStarted);
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
  const port = server.address().port;
  gameLog('SERVER', `Started on port ${port}.`);
  console.log('\n  Viking vs Cleo is running!\n');
  console.log(`  On this computer:  http://localhost:${port}`);
  for (const url of lanUrls(port)) console.log(`  On the network:    ${url}`);
  console.log('');
});

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(process.exitCode ?? 0);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(process.exitCode ?? 0);
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
