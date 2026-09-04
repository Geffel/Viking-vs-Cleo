import {
  LOCAL_SEAT_IDS,
  MAPS,
  MAP_VOTE_MS,
  MATCH_COUNTDOWN_MS,
  MATCH_DURATION_MS,
  MATCH_MODES,
  MATCH_PHASES,
  SHARED_SCREEN_MAX_SEATS,
  TEAM_IDS,
} from '../shared/constants.js';

const MAP_IDS = new Set(MAPS.map((map) => map.id));
const DEFAULT_MAP_ID = MAPS[0]?.id ?? 'arena_01';
const HOST_SEAT_ID = LOCAL_SEAT_IDS[0] ?? 'P1';

export class MatchRegistry {
  constructor({ clock = () => Date.now() } = {}) {
    this.clock = clock;
    this.matches = new Map();
    this.nextId = 1;
  }

  create(host, { training = false } = {}) {
    const id = String(this.nextId++);
    const now = this.clock();
    const match = {
      id,
      title: training ? `Training ${id}` : `Match ${id}`,
      phase: MATCH_PHASES.matchLobby,
      mode: training ? MATCH_MODES.training : MATCH_MODES.online,
      // Traningen ar orankad: ingenting som hander dar far rora profilerna.
      // Stangningen satts forst efter addPlayer nedan - en stangd match slapper
      // inte in nagon, inte ens sin egen vard.
      closed: false,
      statsEnabled: !training,
      hostId: host.sessionId,
      createdAt: now,
      updatedAt: now,
      players: new Map(),
      localSeats: new Map(),
      seatPlayerIds: new Map(),
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
    // Traningen ar privat: ingen annan far joina.
    match.closed = training;
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
      updateHostSeat(match);
      match.updatedAt = this.clock();
      return match;
    }

    if (match.closed) return null;

    const row = playerView(player);
    match.players.set(row.id, row);
    if (!match.hostId || !match.players.has(match.hostId)) match.hostId = row.id;
    updateHostSeat(match);
    match.updatedAt = this.clock();
    return match;
  }

  removePlayer(matchId, sessionId) {
    const match = this.matches.get(String(matchId));
    if (!match) return null;

    match.players.delete(sessionId);
    match.mapVotes.delete(sessionId);
    removeSeatsOwnedBy(match, sessionId);
    match.updatedAt = this.clock();

    if (!match.players.size) {
      this.matches.delete(match.id);
      return null;
    }

    if (match.hostId === sessionId) {
      match.hostId = match.players.keys().next().value;
      updateHostSeat(match);
    }
    return match;
  }

  setSharedScreenMode(matchId, sessionId, enabled) {
    const match = this.matches.get(String(matchId));
    const player = match?.players.get(sessionId);
    if (!match || !player) return { error: "You're not in a match lobby." };
    if (match.hostId !== sessionId) return { error: 'Only the host can change shared screen mode.' };
    if (match.phase !== MATCH_PHASES.matchLobby) return { error: 'Shared screen can only be changed in the match lobby.' };
    if (enabled && match.players.size > 1) {
      return { error: 'Shared screen can only be enabled when the host is the only online player.' };
    }

    const nextMode = enabled ? MATCH_MODES.sharedScreen : MATCH_MODES.online;
    if (match.mode === nextMode) return { match };

    match.mode = nextMode;
    match.closed = enabled;
    match.statsEnabled = !enabled;
    if (enabled) ensureHostSeat(match);
    resetMatchSetup(match);
    if (!enabled) clearLocalSeats(match);
    match.updatedAt = this.clock();
    return { match };
  }

  addLocalSeat(matchId, sessionId, inputDevice) {
    const match = this.matches.get(String(matchId));
    const error = validateLocalSeatChange(match, sessionId, { requireLobby: true });
    if (error) return { error };

    ensureHostSeat(match);
    const normalizedDevice = normalizeInputDevice(inputDevice);
    if (normalizedDevice.type !== 'gamepad') return { error: 'Only gamepads can add another shared screen seat.' };

    const existing = findSeatByInput(match, normalizedDevice);
    if (existing) {
      existing.connected = true;
      existing.lastSeenAt = this.clock();
      match.updatedAt = this.clock();
      return { match, seat: existing };
    }

    if (match.localSeats.size >= SHARED_SCREEN_MAX_SEATS) return { error: 'Shared screen is full.' };

    const id = nextLocalSeatId(match);
    if (!id) return { error: 'Shared screen is full.' };

    const now = this.clock();
    const seat = localSeatView({
      id,
      ownerSessionId: match.hostId,
      inputDevice: normalizedDevice,
      connected: true,
      lastSeenAt: now,
    });
    match.localSeats.set(id, seat);
    match.updatedAt = now;
    return { match, seat };
  }

  removeLocalSeat(matchId, sessionId, seatId) {
    const match = this.matches.get(String(matchId));
    const error = validateLocalSeatChange(match, sessionId, { requireLobby: true });
    if (error) return { error };

    const id = cleanSeatId(seatId);
    if (id === HOST_SEAT_ID) return { error: 'P1 is the host seat and cannot leave shared screen.' };
    if (!match.localSeats.has(id)) return { error: 'That local player is not in this match.' };

    match.localSeats.delete(id);
    match.seatPlayerIds.delete(id);
    match.updatedAt = this.clock();
    return { match };
  }

  setLocalSeatConnected(matchId, sessionId, inputDevice, connected) {
    const match = this.matches.get(String(matchId));
    const error = validateLocalSeatChange(match, sessionId, { requireLobby: true });
    if (error) return { error };

    const normalizedDevice = normalizeInputDevice(inputDevice);
    const seat = findSeatByInput(match, normalizedDevice);
    if (!seat) return { error: 'That local player is not in this match.' };

    seat.connected = !!connected;
    seat.lastSeenAt = this.clock();
    match.updatedAt = seat.lastSeenAt;
    return { match, seat };
  }

  setLocalSeatCharacter(matchId, sessionId, seatId, character) {
    const match = this.matches.get(String(matchId));
    const error = validateLocalSeatChange(match, sessionId, { requireLobby: true });
    if (error) return { error };

    const seat = match.localSeats.get(cleanSeatId(seatId));
    if (!seat) return { error: 'That local player is not in this match.' };
    const picked = cleanCharacter(character);
    if (picked && !TEAM_IDS.includes(picked)) return { error: 'Unknown character.' };

    seat.character = picked;
    seat.ready = false;
    mirrorHostSeatToPlayer(match, seat);
    match.updatedAt = this.clock();
    return { match, seat };
  }

  setLocalSeatReady(matchId, sessionId, seatId, ready) {
    const match = this.matches.get(String(matchId));
    const error = validateLocalSeatChange(match, sessionId, { requireLobby: true });
    if (error) return { error };

    const seat = match.localSeats.get(cleanSeatId(seatId));
    if (!seat) return { error: 'That local player is not in this match.' };
    if (ready && !seat.character) return { error: 'Pick a character first.' };

    seat.ready = !!ready;
    mirrorHostSeatToPlayer(match, seat);
    match.updatedAt = this.clock();
    return { match, seat };
  }

  setLocalSeatMapVote(matchId, sessionId, seatId, mapId) {
    return this.voteMap(matchId, sessionId, mapId, seatId);
  }

  setLocalSeatPlayer(matchId, seatId, playerId) {
    const match = this.matches.get(String(matchId));
    if (!match) return { error: 'Match not found.' };
    const seat = match.localSeats.get(cleanSeatId(seatId));
    if (!seat) return { error: 'That local player is not in this match.' };

    const id = Math.max(0, Number(playerId) || 0);
    seat.playerId = id;
    if (id) match.seatPlayerIds.set(seat.id, id);
    else match.seatPlayerIds.delete(seat.id);
    match.updatedAt = this.clock();
    return { match, seat };
  }

  setReady(matchId, sessionId, ready) {
    const match = this.matches.get(String(matchId));
    const player = match?.players.get(sessionId);
    if (!match || !player || match.phase !== MATCH_PHASES.matchLobby) return { error: "You're not in a match lobby." };
    if (ready && !player.character) return { error: 'Pick a character first.' };

    player.ready = !!ready;
    if (isSharedScreen(match) && sessionId === match.hostId) {
      const seat = ensureHostSeat(match);
      seat.ready = player.ready;
    }
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
    if (isSharedScreen(match) && sessionId === match.hostId) {
      const seat = ensureHostSeat(match);
      seat.character = character;
      seat.ready = false;
    }
    match.updatedAt = this.clock();
    return { match };
  }

  start(matchId, sessionId) {
    const match = this.matches.get(String(matchId));
    if (!match || match.phase !== MATCH_PHASES.matchLobby) return { error: "The match can't be started right now." };
    if (match.hostId !== sessionId) return { error: 'Only the host can start the match.' };

    if (isSharedScreen(match)) {
      ensureHostSeat(match);
      const localSeats = [...match.localSeats.values()];
      if (localSeats.length < 2) return { error: 'Shared screen needs at least two local players.' };
      const missing = localSeats.filter((seat) => !seat.character);
      if (missing.length) return { error: 'Every local player must pick a character before the match starts.' };
    } else {
      const missing = [...match.players.values()].filter((player) => !player.character);
      if (missing.length) return { error: 'Everyone must pick a character before the match starts.' };
    }

    match.phase = MATCH_PHASES.mapVote;
    match.mapVotes.clear();
    for (const seat of match.localSeats.values()) {
      seat.mapVote = null;
      seat.playerId = 0;
    }
    match.seatPlayerIds.clear();
    match.selectedMap = null;
    match.finalScore = null;
    match.resultCounts = true;
    match.unrankedReason = null;
    match.finishedAt = 0;
    match.voteEndsAt = isTraining(match) ? 0 : this.clock() + MAP_VOTE_MS;
    match.countdownEndsAt = 0;
    match.matchEndsAt = 0;
    match.updatedAt = this.clock();
    return { match };
  }

  voteMap(matchId, sessionId, mapId, seatId = null) {
    const match = this.matches.get(String(matchId));
    if (!match || match.phase !== MATCH_PHASES.mapVote) return { error: 'Map voting is not open.' };
    if (!MAP_IDS.has(mapId)) return { error: 'Unknown map.' };

    const now = this.clock();
    let seat = null;
    if (isSharedScreen(match)) {
      const error = validateLocalSeatChange(match, sessionId, { requireLobby: false });
      if (error) return { error };
      seat = match.localSeats.get(cleanSeatId(seatId) || HOST_SEAT_ID);
      if (!seat) return { error: 'That local player is not in this match.' };
      seat.mapVote = mapId;
      if (seat.id === HOST_SEAT_ID) match.mapVotes.set(match.hostId, mapId);
    } else {
      const player = match.players.get(sessionId);
      if (!player) return { error: 'Map voting is not open.' };
      match.mapVotes.set(sessionId, mapId);
    }
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

    return seat ? { match, seat } : { match };
  }

  finish(matchId, sessionId, finalScore = null) {
    const match = this.matches.get(String(matchId));
    if (!match || ![MATCH_PHASES.mapVote, MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(match.phase)) {
      return { error: "The match can't be ended right now." };
    }
    if (match.hostId !== sessionId) return { error: 'Only the host can end the round.' };

    const now = this.clock();
    completeMatch(match, finalScore, now, resultOptionsFor(match));
    return { match };
  }

  resetToLobby(matchId, sessionId) {
    const match = this.matches.get(String(matchId));
    if (!match || match.phase !== MATCH_PHASES.results) return { error: "The match can't be reset right now." };
    if (match.hostId !== sessionId) return { error: 'Only the host can start a new round.' };

    match.phase = MATCH_PHASES.matchLobby;
    resetMatchSetup(match, { keepLocalSeatCharacters: isSharedScreen(match) });
    match.updatedAt = this.clock();
    return { match };
  }

  advancePhases({ scoreForMatch = null } = {}) {
    const now = this.clock();
    const changes = [];

    for (const match of this.matches.values()) {
      if (match.phase === MATCH_PHASES.mapVote && match.voteEndsAt && now >= match.voteEndsAt) {
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
        // Traningen har ingen klocka: 0 gor att tidsuttaget nedan aldrig slar till.
        match.matchEndsAt = isTraining(match) ? 0 : now + MATCH_DURATION_MS;
        match.updatedAt = now;
        changes.push({ match, from: MATCH_PHASES.countdown, to: MATCH_PHASES.playing });
        continue;
      }

      if (match.phase === MATCH_PHASES.playing && match.matchEndsAt && now >= match.matchEndsAt) {
        const statsEnabled = match.statsEnabled !== false;
        const resultCounts = statsEnabled && countPickedPlayers(match) >= 2;
        completeMatch(match, scoreForMatch?.(match) ?? null, now, {
          resultCounts,
          unrankedReason: statsEnabled ? (resultCounts ? null : 'soloTimeUp') : 'sharedScreen',
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
    // Traningsmatcher ar privata - de hor inte hemma i lobbyns matchlista.
    return [...this.matches.values()].filter((match) => !isTraining(match)).map(snapshot);
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

function localSeatView({ id, ownerSessionId, inputDevice, connected = true, lastSeenAt = 0 }) {
  return {
    id,
    ownerSessionId,
    inputDevice,
    name: id,
    character: null,
    ready: false,
    mapVote: null,
    playerId: 0,
    connected,
    lastSeenAt,
  };
}

function snapshot(match) {
  const players = [...match.players.values()].map((player) => ({
    ...player,
    mapVote: match.mapVotes.get(player.id) ?? null,
  }));
  const sharedScreen = isSharedScreen(match);
  const localSeats = sharedScreen
    ? [...match.localSeats.values()].map((seat) => ({
        ...seat,
        playerId: match.seatPlayerIds.get(seat.id) ?? seat.playerId ?? 0,
      }))
    : [];
  const host = players.find((p) => p.id === match.hostId) ?? null;
  const readyCount = players.filter((p) => p.ready).length;
  const charactersChosenCount = players.filter((p) => p.character).length;
  const localReadyCount = localSeats.filter((seat) => seat.ready).length;
  const localCharactersChosenCount = localSeats.filter((seat) => seat.character).length;
  const onlineAllCharactersChosen = players.length > 0 && charactersChosenCount === players.length;
  const localAllCharactersChosen = localSeats.length > 0 && localCharactersChosenCount === localSeats.length;
  const sharedCanStart = localSeats.length >= 2 && localAllCharactersChosen;
  const voteRows = sharedScreen
    ? localSeats.map((seat) => ({
        id: seat.id,
        seatId: seat.id,
        n: seat.name ?? seat.id,
        character: seat.character,
        mapVote: seat.mapVote,
      }))
    : players;
  const mapVotes = MAPS.map((map) => {
    const voters = voteRows.filter((row) => row.mapVote === map.id);
    return {
      id: map.id,
      name: map.name,
      asset: map.asset,
      thumb: map.thumb,
      count: voters.length,
      voters: voters.map((row) => ({
        id: row.id,
        seatId: row.seatId ?? null,
        n: row.n,
        character: row.character,
      })),
    };
  });
  return {
    id: match.id,
    title: match.title,
    phase: match.phase,
    mode: match.mode ?? MATCH_MODES.online,
    sharedScreen,
    training: isTraining(match),
    closed: !!match.closed,
    statsEnabled: match.statsEnabled !== false,
    hostId: match.hostId,
    hostName: host?.n ?? 'Host',
    playerCount: players.length,
    readyCount,
    charactersChosenCount,
    allReady: players.length > 0 && readyCount === players.length,
    allCharactersChosen: sharedScreen ? sharedCanStart : onlineAllCharactersChosen,
    players,
    localSeats,
    seats: localSeats,
    localSeatCount: localSeats.length,
    localReadyCount,
    localCharactersChosenCount,
    allLocalSeatsReady: localSeats.length > 0 && localReadyCount === localSeats.length,
    allLocalSeatsChosen: localAllCharactersChosen,
    hasMinimumLocalSeats: localSeats.length >= 2,
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

function resetMatchSetup(match, { keepLocalSeatCharacters = false } = {}) {
  const keepSeatCharacters = keepLocalSeatCharacters && isSharedScreen(match);
  for (const player of match.players.values()) {
    player.ready = false;
    if (!keepSeatCharacters || player.id !== match.hostId) player.character = null;
  }
  for (const seat of match.localSeats?.values() ?? []) {
    seat.ready = false;
    if (!keepSeatCharacters) seat.character = null;
    seat.mapVote = null;
    seat.playerId = 0;
  }
  if (keepSeatCharacters) mirrorHostSeatToPlayer(match, match.localSeats.get(HOST_SEAT_ID));

  match.mapVotes.clear();
  match.seatPlayerIds?.clear();
  match.selectedMap = null;
  match.finalScore = null;
  match.resultCounts = true;
  match.unrankedReason = null;
  match.finishedAt = 0;
  match.voteEndsAt = 0;
  match.countdownEndsAt = 0;
  match.matchEndsAt = 0;
}

function isSharedScreen(match) {
  return match?.mode === MATCH_MODES.sharedScreen;
}

function isTraining(match) {
  return match?.mode === MATCH_MODES.training;
}

function ensureHostSeat(match) {
  match.localSeats ??= new Map();
  match.seatPlayerIds ??= new Map();

  let seat = match.localSeats.get(HOST_SEAT_ID);
  if (!seat) {
    seat = localSeatView({
      id: HOST_SEAT_ID,
      ownerSessionId: match.hostId,
      inputDevice: { type: 'keyboard' },
      connected: true,
      lastSeenAt: match.updatedAt ?? 0,
    });
    match.localSeats.set(HOST_SEAT_ID, seat);
  }

  seat.ownerSessionId = match.hostId;
  seat.inputDevice = { type: 'keyboard' };
  seat.connected = true;
  seat.lastSeenAt = match.updatedAt ?? seat.lastSeenAt ?? 0;
  return seat;
}

function updateHostSeat(match) {
  if (!isSharedScreen(match)) return;
  ensureHostSeat(match);
}

function mirrorHostSeatToPlayer(match, seat) {
  if (seat?.id !== HOST_SEAT_ID) return;
  const player = match.players.get(match.hostId);
  if (!player) return;
  player.character = seat.character;
  player.ready = seat.ready;
}

function clearLocalSeats(match) {
  match.localSeats?.clear();
  match.seatPlayerIds?.clear();
}

function removeSeatsOwnedBy(match, sessionId) {
  if (!match.localSeats?.size) return;
  for (const seat of [...match.localSeats.values()]) {
    if (seat.ownerSessionId === sessionId) {
      match.localSeats.delete(seat.id);
      match.seatPlayerIds?.delete(seat.id);
    }
  }
}

function validateLocalSeatChange(match, sessionId, { requireLobby }) {
  if (!match || !match.players.has(sessionId)) return "You're not in a match.";
  if (!isSharedScreen(match)) return 'Shared screen mode is not enabled.';
  if (match.hostId !== sessionId) return 'Only the host can manage shared screen players.';
  if (requireLobby && match.phase !== MATCH_PHASES.matchLobby) return 'Local players can only change in the match lobby.';
  ensureHostSeat(match);
  return '';
}

function normalizeInputDevice(device) {
  const type = device?.type === 'gamepad' ? 'gamepad' : device?.type === 'keyboard' ? 'keyboard' : '';
  if (type === 'keyboard') return { type };
  if (type !== 'gamepad') return { type: '' };

  const index = Math.max(0, Math.min(15, Math.floor(Number(device.index) || 0)));
  const label = String(device.label ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  return label ? { type, index, label } : { type, index };
}

function findSeatByInput(match, inputDevice) {
  const key = inputDeviceKey(inputDevice);
  if (!key) return null;
  return [...match.localSeats.values()].find((seat) => inputDeviceKey(seat.inputDevice) === key) ?? null;
}

function inputDeviceKey(inputDevice) {
  if (inputDevice?.type === 'keyboard') return 'keyboard';
  if (inputDevice?.type === 'gamepad') return `gamepad:${Number(inputDevice.index) || 0}`;
  return '';
}

function nextLocalSeatId(match) {
  return LOCAL_SEAT_IDS.find((id) => !match.localSeats.has(id)) ?? '';
}

function cleanSeatId(seatId) {
  const id = String(seatId ?? '').trim().toUpperCase();
  return LOCAL_SEAT_IDS.includes(id) ? id : '';
}

function cleanCharacter(character) {
  if (character === null || character === undefined || character === '') return null;
  return String(character);
}

function resultOptionsFor(match) {
  if (match?.statsEnabled === false) return { resultCounts: false, unrankedReason: unrankedReasonFor(match) };
  return {};
}

function unrankedReasonFor(match) {
  return isTraining(match) ? 'training' : 'sharedScreen';
}

function completeMatch(match, finalScore, now, { resultCounts = true, unrankedReason = null } = {}) {
  match.phase = MATCH_PHASES.results;
  match.finalScore = sanitizeScore(finalScore);
  const statsEnabled = match.statsEnabled !== false;
  match.resultCounts = statsEnabled && resultCounts !== false;
  match.unrankedReason = match.resultCounts ? null : unrankedReason ?? (statsEnabled ? null : unrankedReasonFor(match));
  match.finishedAt = now;
  match.voteEndsAt = 0;
  match.countdownEndsAt = 0;
  match.matchEndsAt = 0;
  match.updatedAt = now;
}

function countPickedPlayers(match) {
  if (isSharedScreen(match)) {
    let count = 0;
    for (const seat of match.localSeats.values()) {
      if (seat.character) count++;
    }
    return count;
  }

  let count = 0;
  for (const player of match.players.values()) {
    if (player.character) count++;
  }
  return count;
}

function resolveSelectedMap(match) {
  const counts = new Map(MAPS.map((map) => [map.id, 0]));
  for (const vote of mapVotesForMatch(match)) {
    if (counts.has(vote)) counts.set(vote, counts.get(vote) + 1);
  }

  let best = -1;
  for (const count of counts.values()) best = Math.max(best, count);

  const tied = MAPS.filter((map) => counts.get(map.id) === best).map((map) => map.id);
  const hostVote = isSharedScreen(match) ? match.localSeats.get(HOST_SEAT_ID)?.mapVote : match.mapVotes.get(match.hostId);
  if (hostVote && tied.includes(hostVote)) return hostVote;

  return tied[0] ?? DEFAULT_MAP_ID;
}

function allPlayersVoted(match) {
  if (isSharedScreen(match)) {
    if (!match.localSeats.size) return false;
    for (const seat of match.localSeats.values()) {
      if (!seat.mapVote) return false;
    }
    return true;
  }

  if (!match.players.size) return false;
  for (const player of match.players.values()) {
    if (!match.mapVotes.has(player.id)) return false;
  }
  return true;
}

function mapVotesForMatch(match) {
  if (isSharedScreen(match)) return [...match.localSeats.values()].map((seat) => seat.mapVote).filter(Boolean);
  return [...match.mapVotes.values()];
}

function sanitizeScore(score) {
  return {
    cleo: Math.max(0, Number(score?.cleo) || 0),
    viking: Math.max(0, Number(score?.viking) || 0),
  };
}
