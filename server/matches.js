import { MAPS, MAP_VOTE_MS, MATCH_COUNTDOWN_MS, MATCH_DURATION_MS, MATCH_PHASES, TEAM_IDS } from '../shared/constants.js';

const MAP_IDS = new Set(MAPS.map((map) => map.id));
const DEFAULT_MAP_ID = MAPS[0]?.id ?? 'arena_01';

export class MatchRegistry {
  constructor({ clock = () => Date.now() } = {}) {
    this.clock = clock;
    this.matches = new Map();
    this.nextId = 1;
  }

  create(host) {
    const id = String(this.nextId++);
    const now = this.clock();
    const match = {
      id,
      title: `Match ${id}`,
      phase: MATCH_PHASES.matchLobby,
      hostId: host.sessionId,
      createdAt: now,
      updatedAt: now,
      players: new Map(),
      mapVotes: new Map(),
      selectedMap: null,
      finalScore: null,
      resultCounts: true,
      unrankedReason: null,
      finishedAt: 0,
      voteEndsAt: 0,
      countdownEndsAt: 0,
      matchEndsAt: 0,
    };
    this.matches.set(id, match);
    this.addPlayer(id, host);
    return match;
  }

  addPlayer(matchId, player) {
    const match = this.matches.get(String(matchId));
    // Ingen fas-grind langre: en spelare far joina aven en pagaende match.
    // En sen anslutare kommer in utan karaktar och far valja for att hoppa in.
    if (!match) return null;

    const existing = match.players.get(player.sessionId);
    if (existing) {
      existing.n = player.name;
      existing.profileId = player.profileId ?? 0;
      match.updatedAt = this.clock();
      return match;
    }

    const row = playerView(player);
    match.players.set(row.id, row);
    if (!match.hostId || !match.players.has(match.hostId)) match.hostId = row.id;
    match.updatedAt = this.clock();
    return match;
  }

  removePlayer(matchId, sessionId) {
    const match = this.matches.get(String(matchId));
    if (!match) return null;

    match.players.delete(sessionId);
    match.mapVotes.delete(sessionId);
    match.updatedAt = this.clock();

    if (!match.players.size) {
      this.matches.delete(match.id);
      return null;
    }

    if (match.hostId === sessionId) {
      match.hostId = match.players.keys().next().value;
    }
    return match;
  }

  setReady(matchId, sessionId, ready) {
    const match = this.matches.get(String(matchId));
    const player = match?.players.get(sessionId);
    if (!match || !player || match.phase !== MATCH_PHASES.matchLobby) return { error: "You're not in a match lobby." };
    if (ready && !player.character) return { error: 'Pick a character first.' };

    player.ready = !!ready;
    match.updatedAt = this.clock();
    return { match };
  }

  setCharacter(matchId, sessionId, character) {
    const match = this.matches.get(String(matchId));
    const player = match?.players.get(sessionId);
    // Karaktar gar att valja i lobbyn OCH under de aktiva faserna, sa att en sen
    // anslutare kan valja sida och hoppa in i en pagaende match.
    const pickablePhases = [MATCH_PHASES.matchLobby, MATCH_PHASES.mapVote, MATCH_PHASES.countdown, MATCH_PHASES.playing];
    if (!match || !player || !pickablePhases.includes(match.phase)) return { error: "You can't pick a character right now." };
    if (!TEAM_IDS.includes(character)) return { error: 'Unknown character.' };

    player.character = character;
    player.ready = false;
    match.updatedAt = this.clock();
    return { match };
  }

  start(matchId, sessionId) {
    const match = this.matches.get(String(matchId));
    if (!match || match.phase !== MATCH_PHASES.matchLobby) return { error: "The match can't be started right now." };
    if (match.hostId !== sessionId) return { error: 'Only the host can start the match.' };

    const missing = [...match.players.values()].filter((player) => !player.character);
    if (missing.length) return { error: 'Everyone must pick a character before the match starts.' };

    match.phase = MATCH_PHASES.mapVote;
    match.mapVotes.clear();
    match.selectedMap = null;
    match.finalScore = null;
    match.resultCounts = true;
    match.unrankedReason = null;
    match.finishedAt = 0;
    match.voteEndsAt = this.clock() + MAP_VOTE_MS;
    match.countdownEndsAt = 0;
    match.matchEndsAt = 0;
    match.updatedAt = this.clock();
    return { match };
  }

  voteMap(matchId, sessionId, mapId) {
    const match = this.matches.get(String(matchId));
    const player = match?.players.get(sessionId);
    if (!match || !player || match.phase !== MATCH_PHASES.mapVote) return { error: 'Map voting is not open.' };
    if (!MAP_IDS.has(mapId)) return { error: 'Unknown map.' };

    const now = this.clock();
    match.mapVotes.set(sessionId, mapId);
    match.updatedAt = now;

    if (allPlayersVoted(match)) {
      match.selectedMap = resolveSelectedMap(match);
      match.phase = MATCH_PHASES.countdown;
      match.voteEndsAt = 0;
      match.countdownEndsAt = now + MATCH_COUNTDOWN_MS;
      match.matchEndsAt = 0;
      match.updatedAt = now;
      return { match, change: { match, from: MATCH_PHASES.mapVote, to: MATCH_PHASES.countdown } };
    }

    return { match };
  }

  finish(matchId, sessionId, finalScore = null) {
    const match = this.matches.get(String(matchId));
    if (!match || ![MATCH_PHASES.mapVote, MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(match.phase)) {
      return { error: "The match can't be ended right now." };
    }
    if (match.hostId !== sessionId) return { error: 'Only the host can end the round.' };

    const now = this.clock();
    completeMatch(match, finalScore, now);
    return { match };
  }

  resetToLobby(matchId, sessionId) {
    const match = this.matches.get(String(matchId));
    if (!match || match.phase !== MATCH_PHASES.results) return { error: "The match can't be reset right now." };
    if (match.hostId !== sessionId) return { error: 'Only the host can start a new round.' };

    for (const player of match.players.values()) {
      player.ready = false;
      player.character = null;
    }

    match.phase = MATCH_PHASES.matchLobby;
    match.mapVotes.clear();
    match.selectedMap = null;
    match.finalScore = null;
    match.resultCounts = true;
    match.unrankedReason = null;
    match.finishedAt = 0;
    match.voteEndsAt = 0;
    match.countdownEndsAt = 0;
    match.matchEndsAt = 0;
    match.updatedAt = this.clock();
    return { match };
  }

  advancePhases({ scoreForMatch = null } = {}) {
    const now = this.clock();
    const changes = [];

    for (const match of this.matches.values()) {
      if (match.phase === MATCH_PHASES.mapVote && now >= match.voteEndsAt) {
        match.selectedMap = resolveSelectedMap(match);
        match.phase = MATCH_PHASES.countdown;
        match.countdownEndsAt = now + MATCH_COUNTDOWN_MS;
        match.matchEndsAt = 0;
        match.updatedAt = now;
        changes.push({ match, from: MATCH_PHASES.mapVote, to: MATCH_PHASES.countdown });
        continue;
      }

      if (match.phase === MATCH_PHASES.countdown && now >= match.countdownEndsAt) {
        match.phase = MATCH_PHASES.playing;
        match.matchEndsAt = now + MATCH_DURATION_MS;
        match.updatedAt = now;
        changes.push({ match, from: MATCH_PHASES.countdown, to: MATCH_PHASES.playing });
        continue;
      }

      if (match.phase === MATCH_PHASES.playing && match.matchEndsAt && now >= match.matchEndsAt) {
        const resultCounts = countPickedPlayers(match) >= 2;
        completeMatch(match, scoreForMatch?.(match) ?? null, now, {
          resultCounts,
          unrankedReason: resultCounts ? null : 'soloTimeUp',
        });
        changes.push({ match, from: MATCH_PHASES.playing, to: MATCH_PHASES.results, reason: 'timeUp' });
      }
    }

    return changes;
  }

  get(matchId) {
    return this.matches.get(String(matchId)) ?? null;
  }

  snapshot(matchId) {
    const match = this.get(matchId);
    return match ? snapshot(match) : null;
  }

  list() {
    return [...this.matches.values()].map(snapshot);
  }
}

function playerView(player) {
  return {
    id: player.sessionId,
    n: player.name,
    profileId: player.profileId ?? 0,
    ready: false,
    character: null,
  };
}

function snapshot(match) {
  const players = [...match.players.values()].map((player) => ({
    ...player,
    mapVote: match.mapVotes.get(player.id) ?? null,
  }));
  const host = players.find((p) => p.id === match.hostId) ?? null;
  const readyCount = players.filter((p) => p.ready).length;
  const charactersChosenCount = players.filter((p) => p.character).length;
  const mapVotes = MAPS.map((map) => ({
    id: map.id,
    name: map.name,
    asset: map.asset,
    thumb: map.thumb,
    count: players.filter((player) => player.mapVote === map.id).length,
    voters: players
      .filter((player) => player.mapVote === map.id)
      .map((player) => ({
        id: player.id,
        n: player.n,
        character: player.character,
      })),
  }));
  return {
    id: match.id,
    title: match.title,
    phase: match.phase,
    hostId: match.hostId,
    hostName: host?.n ?? 'Host',
    playerCount: players.length,
    readyCount,
    charactersChosenCount,
    allReady: players.length > 0 && readyCount === players.length,
    allCharactersChosen: players.length > 0 && charactersChosenCount === players.length,
    players,
    maps: MAPS.map((map) => ({ id: map.id, name: map.name, asset: map.asset, thumb: map.thumb })),
    mapVotes,
    selectedMap: match.selectedMap,
    finalScore: match.finalScore,
    resultCounts: match.resultCounts !== false,
    unrankedReason: match.unrankedReason ?? null,
    finishedAt: match.finishedAt,
    voteEndsAt: match.voteEndsAt,
    countdownEndsAt: match.countdownEndsAt,
    matchEndsAt: match.matchEndsAt,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
  };
}

function completeMatch(match, finalScore, now, { resultCounts = true, unrankedReason = null } = {}) {
  match.phase = MATCH_PHASES.results;
  match.finalScore = sanitizeScore(finalScore);
  match.resultCounts = resultCounts !== false;
  match.unrankedReason = match.resultCounts ? null : unrankedReason;
  match.finishedAt = now;
  match.voteEndsAt = 0;
  match.countdownEndsAt = 0;
  match.matchEndsAt = 0;
  match.updatedAt = now;
}

function countPickedPlayers(match) {
  let count = 0;
  for (const player of match.players.values()) {
    if (player.character) count++;
  }
  return count;
}

function resolveSelectedMap(match) {
  const counts = new Map(MAPS.map((map) => [map.id, 0]));
  for (const vote of match.mapVotes.values()) {
    if (counts.has(vote)) counts.set(vote, counts.get(vote) + 1);
  }

  let best = -1;
  for (const count of counts.values()) best = Math.max(best, count);

  const tied = MAPS.filter((map) => counts.get(map.id) === best).map((map) => map.id);
  const hostVote = match.mapVotes.get(match.hostId);
  if (hostVote && tied.includes(hostVote)) return hostVote;

  return tied[0] ?? DEFAULT_MAP_ID;
}

function allPlayersVoted(match) {
  if (!match.players.size) return false;
  for (const player of match.players.values()) {
    if (!match.mapVotes.has(player.id)) return false;
  }
  return true;
}

function sanitizeScore(score) {
  return {
    cleo: Math.max(0, Number(score?.cleo) || 0),
    viking: Math.max(0, Number(score?.viking) || 0),
  };
}
