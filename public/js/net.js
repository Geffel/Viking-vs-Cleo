// Halller WebSocket-anslutningen och en liten buffert av ognapsbilder.
// Andra spelare ritas INTERP_MS bakat i tiden och interpoleras, vilket gor
// rorelsen mjuk aven om ett paket kommer sent. Egen spelare ritas alltid
// pa senaste bilden sa att inputen kanns direkt.

// Bor i shared/constants.js eftersom servern spolar tillbaka exakt lika langt
// nar den avgor om ett slag traffade.
import { INTERP_MS, TICK_MS } from '/shared/constants.js';
export { INTERP_MS };

const BUFFER_MS = 1000;
const SNAP_DIST = 220; // storre hopp an sa = respawn/teleport, interpolera inte
const LOCAL_EXTRAP_MS = 50;
const METRIC_WINDOW_MS = 5000;
const METRIC_PING_MS = 1000;
const METRIC_PING_TIMEOUT_MS = 4000;
const LOCAL_ACTION_WINDOW_MS = 1400;
const MAX_LOCAL_ACTIONS = 48;
const FX_ACTIONS = {
  cleo: {
    sand_blast: 'a1',
    blink: 'a2',
    power_shield: 'a3',
    sun_fire_channel: 'a4',
    sun_fire_release: 'a4',
  },
  viking: {
    axe_throw: 'a1',
    shield_charge: 'a2',
    mushrooms: 'a3',
    lasso_throw: 'a4',
  },
};

export class Net {
  constructor() {
    this.ws = null;
    this.selfId = 0;
    this.selfTeam = null;
    this.localPlayers = new Map();
    this.buffer = [];
    this.latest = null;
    this.leaderboard = [];
    this.leaderboardSig = '';
    this.powerups = []; // pizzor pa kartan just nu, senaste ognapsbilden
    this.projectiles = []; // kastade yxor/vapen, senaste ognapsbilden
    this.score = { cleo: 0, viking: 0 };
    this.sessionId = 0;
    this.name = '';
    this.profileId = 0;
    this.profile = null;
    this.achievementStats = null;
    this.achievementStatsSig = '';
    this.matches = [];
    this.match = null;
    this.connected = false;
    this.serverOffsetMs = 0;
    this.handlers = {};
    this.metrics = createMetrics();
    this.metricPingSeq = 0;
    this.metricPingTimer = 0;
    this.pendingMetricPings = new Map();
    this.localActions = [];
  }

  on(type, fn) {
    (this.handlers[type] ||= []).push(fn);
    return this;
  }

  emit(type, payload) {
    for (const fn of this.handlers[type] ?? []) fn(payload);
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}`);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.startMetricPing();
      this.emit('open');
    };

    ws.onclose = () => {
      this.connected = false;
      this.stopMetricPing();
      this.clearLiveGame();
      this.emit('close');
      setTimeout(() => this.connect(), 1200);
    };

    ws.onmessage = (ev) => {
      const bytes = byteLength(ev.data);
      const msg = JSON.parse(ev.data);
      this.noteInbound(msg.t, bytes);
      this.updateServerTime(msg);
      this.setAchievementStats(msg.achievementStats);
      if (msg.t === 'state') this.onState(msg, bytes);
      else if (msg.t === 'clientPong') this.onClientPong(msg);
      else if (msg.t === 'joined') {
        this.selfId = msg.id;
        this.selfTeam = msg.team;
        this.localPlayers.clear();
        this.emit('joined', msg);
      } else if (msg.t === 'welcome') {
        this.sessionId = msg.sessionId ?? this.sessionId;
        this.matches = msg.matches ?? [];
        this.setLeaderboard(msg.lb ?? []);
        this.emit('welcome', msg);
      } else if (msg.t === 'identified') {
        this.sessionId = msg.sessionId ?? this.sessionId;
        this.name = msg.name ?? this.name;
        this.profileId = msg.profileId ?? this.profileId;
        if (msg.profile) this.setProfile(msg.profile);
        this.matches = msg.matches ?? this.matches;
        this.match = msg.match ?? null;
        if (!isLiveGamePhase(this.match?.phase)) this.clearLiveGame();
        this.emit('identified', msg);
      } else if (msg.t === 'lobby') {
        this.name = msg.me?.name ?? this.name;
        this.profileId = msg.me?.profileId ?? this.profileId;
        if (msg.profile) this.setProfile(msg.profile);
        this.matches = msg.matches ?? [];
        this.match = msg.match ?? null;
        if (!isLiveGamePhase(this.match?.phase)) this.clearLiveGame();
        this.setLeaderboard(msg.lb ?? this.leaderboard);
        this.emit('lobby', msg);
      } else if (msg.t === 'leaderboard') {
        this.matches = msg.matches ?? this.matches;
        this.setLeaderboard(msg.lb ?? []);
        this.emit('leaderboardSummary', msg.summary ?? null);
      } else if (msg.t === 'match') {
        this.match = msg.match ?? null;
        if (!isLiveGamePhase(this.match?.phase)) this.clearLiveGame();
        this.emit('match', this.match);
      } else if (msg.t === 'gameReady') {
        this.localPlayers = new Map(
          (msg.localPlayers ?? [])
            .map((player) => [
              String(player.seatId ?? ''),
              {
                seatId: String(player.seatId ?? ''),
                playerId: Math.max(0, Number(player.playerId) || 0),
                team: player.team ?? null,
                name: player.name ?? String(player.seatId ?? ''),
              },
            ])
            .filter(([seatId, player]) => seatId && player.playerId),
        );
        const primary = this.localPlayers.size ? [...this.localPlayers.values()][0] : null;
        this.selfId = primary?.playerId ?? msg.id;
        this.selfTeam = primary?.team ?? msg.team;
        this.match = msg.match ?? this.match;
        this.buffer = [];
        this.latest = null;
        this.powerups = [];
        this.projectiles = [];
        this.score = { cleo: 0, viking: 0 };
        if (msg.profile) this.setProfile(msg.profile);
        this.emit('gameReady', msg);
      } else if (msg.t === 'achievementUnlocked') {
        if (msg.profile) this.setProfile(msg.profile);
        this.emit('achievementUnlocked', msg);
      } else if (msg.t === 'appError') {
        this.emit('appError', msg);
      }
    };
  }

  send(obj) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const str = JSON.stringify(obj);
    this.noteOutbound(obj?.t, byteLength(str));
    this.ws.send(str);
  }

  identify(name, clientId) {
    this.send({ t: 'identify', name, clientId });
  }

  createMatch() {
    this.send({ t: 'createMatch' });
  }

  joinMatch(id) {
    this.send({ t: 'joinMatch', id });
  }

  setSharedScreenMode(enabled) {
    this.send({ t: 'setSharedScreenMode', enabled });
  }

  wakeLocalSeat(inputDevice) {
    this.send({ t: 'wakeLocalSeat', inputDevice });
  }

  setLocalSeatCharacter(seatId, character) {
    this.send({ t: 'setLocalSeatCharacter', seatId, character });
  }

  setLocalSeatReady(seatId, ready) {
    this.send({ t: 'setLocalSeatReady', seatId, ready });
  }

  removeLocalSeat(seatId) {
    this.send({ t: 'removeLocalSeat', seatId });
  }

  setLocalSeatConnected(inputDevice, connected) {
    this.send({ t: 'setLocalSeatConnected', inputDevice, connected });
  }

  leaveMatch() {
    this.send({ t: 'leaveMatch' });
    this.match = null;
    this.clearLiveGame();
  }

  setReady(ready) {
    this.send({ t: 'setReady', ready });
  }

  setCharacter(character) {
    this.send({ t: 'setCharacter', character });
  }

  startMatch() {
    this.send({ t: 'startMatch' });
  }

  voteMap(mapId) {
    this.send({ t: 'voteMap', mapId });
  }

  voteLocalSeatMap(seatId, mapId) {
    this.send({ t: 'voteMap', seatId, mapId });
  }

  resetMatch() {
    this.send({ t: 'resetMatch' });
  }

  serverNow() {
    return Date.now() + this.serverOffsetMs;
  }

  updateServerTime(msg) {
    if (typeof msg.serverNow === 'number') this.serverOffsetMs = msg.serverNow - Date.now();
  }

  onState(msg, bytes = 0) {
    const time = performance.now();
    this.noteState(msg, bytes, time);
    const players = new Map();
    for (const p of msg.players) players.set(p.i, p);
    const projectiles = msg.pr ?? [];

    this.latest = { time, players, projectiles };
    this.setLeaderboard(msg.lb ?? this.leaderboard);
    this.powerups = msg.pu ?? [];
    this.projectiles = projectiles;
    this.score = msg.score;
    this.buffer.push(this.latest);

    while (this.buffer.length > 2 && time - this.buffer[0].time > BUFFER_MS) this.buffer.shift();

    // Egna effekter direkt - egen spelare ritas ju ocksa utan fordrojning.
    // Andras fordrojs lika mycket som kropparna sa att de hamnar ratt.
    const delayed = [];
    for (const fx of msg.fx) {
      this.noteFx(fx, time);
      if (this.isLocalPlayerId(fx.id) || this.isLocalPlayerId(fx.by)) this.emit('fx', fx);
      else delayed.push(fx);
    }

    if (delayed.length || msg.feed.length) {
      setTimeout(() => {
        for (const fx of delayed) this.emit('fx', fx);
        for (const kill of msg.feed) this.emit('kill', kill);
      }, INTERP_MS);
    }
  }

  /** Lamnar matchen men behaller anslutningen - man kan joina igen direkt. */
  leave() {
    this.send({ t: 'leave' });
    this.clearLiveGame();
  }

  clearLiveGame() {
    this.selfId = 0;
    this.selfTeam = null;
    this.localPlayers.clear();
    this.buffer = [];
    this.latest = null;
    this.powerups = [];
    this.projectiles = [];
    this.score = { cleo: 0, viking: 0 };
  }

  self() {
    return this.selfId ? this.latest?.players.get(this.selfId) ?? null : null;
  }

  localPlayerIds() {
    if (this.localPlayers.size) return [...this.localPlayers.values()].map((player) => player.playerId).filter(Boolean);
    return this.selfId ? [this.selfId] : [];
  }

  localPlayerForSeat(seatId) {
    return this.localPlayers.get(String(seatId ?? '')) ?? null;
  }

  localSelfPlayers() {
    return this.localPlayerIds()
      .map((id) => this.latest?.players.get(id) ?? null)
      .filter(Boolean);
  }

  isLocalPlayerId(playerId) {
    const id = Math.max(0, Number(playerId) || 0);
    return !!id && this.localPlayerIds().includes(id);
  }

  /** Spelarlista att rita just nu. */
  sample() {
    const buf = this.buffer;
    if (!buf.length) return [];

    const renderTime = performance.now() - INTERP_MS;
    let i = buf.length - 1;
    while (i > 0 && buf[i].time > renderTime) i--;

    const a = buf[i];
    const b = buf[i + 1];
    const out = [];

    const localIds = new Set(this.localPlayerIds());

    for (const p of a.players.values()) {
      if (localIds.has(p.i)) continue; // egna spelare ritas fran latest
      out.push(b ? lerpPlayer(p, b.players.get(p.i), clamp01((renderTime - a.time) / (b.time - a.time))) : p);
    }

    const latestAgeMs = this.latest ? performance.now() - this.latest.time : 0;
    for (const id of localIds) {
      const p = this.latest?.players.get(id);
      if (p) out.push(extrapolatePlayer(p, latestAgeMs));
    }
    return out;
  }

  /** Projektiler att rita just nu, med samma fordrojning som spelarna. */
  sampleProjectiles() {
    const buf = this.buffer;
    if (!buf.length) return [];

    const renderTime = performance.now() - INTERP_MS;
    let i = buf.length - 1;
    while (i > 0 && buf[i].time > renderTime) i--;

    const a = buf[i];
    const b = buf[i + 1];
    const alpha = b ? clamp01((renderTime - a.time) / (b.time - a.time)) : 0;
    const out = [];

    const localIds = new Set(this.localPlayerIds());

    for (const pr of a.projectiles ?? []) {
      if (localIds.has(pr.o)) continue;
      const next = b?.projectiles?.find((p) => p.i === pr.i);
      out.push(next ? lerpProjectile(pr, next, alpha) : pr);
    }

    const latestAgeMs = this.latest ? performance.now() - this.latest.time : 0;
    for (const pr of this.latest?.projectiles ?? []) {
      if (localIds.has(pr.o)) out.push(extrapolateProjectile(pr, latestAgeMs));
    }
    return out;
  }

  setLeaderboard(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const sig = JSON.stringify(
      list.map((e) => [
        e.id,
        e.n,
        e.pts,
        Math.floor((e.ms ?? 0) / 1000),
        e.nemesis?.name,
        e.nemesis?.count,
        e.prey?.name,
        e.prey?.count,
        e.fav,
        e.stats,
        e.achievements,
      ]),
    );
    if (sig === this.leaderboardSig) return;
    this.leaderboard = list;
    this.leaderboardSig = sig;
    const own = this.profileId ? list.find((entry) => entry.id === this.profileId) : null;
    if (own) this.setProfile(own);
    this.emit('leaderboard', list);
  }

  setProfile(profile) {
    if (!profile) return;
    if (profile.achievementStats) this.achievementStats = profile.achievementStats;
    this.profile = this.achievementStats ? { ...profile, achievementStats: this.achievementStats } : profile;
    this.emit('profile', this.profile);
  }

  setAchievementStats(stats) {
    if (!stats) return;
    const normalized = {
      totalProfiles: Math.max(0, Number(stats.totalProfiles) || 0),
      unlocked: stats.unlocked ?? {},
      pcts: stats.pcts ?? {},
    };
    const sig = JSON.stringify(normalized);
    if (sig === this.achievementStatsSig) return;
    this.achievementStats = normalized;
    this.achievementStatsSig = sig;
    this.emit('achievementStats', normalized);
    if (this.profile) this.setProfile({ ...this.profile, achievementStats: normalized });
  }

  startMetricPing() {
    this.stopMetricPing();
    this.sendMetricPing();
    this.metricPingTimer = setInterval(() => this.sendMetricPing(), METRIC_PING_MS);
  }

  stopMetricPing() {
    if (this.metricPingTimer) clearInterval(this.metricPingTimer);
    this.metricPingTimer = 0;
    this.pendingMetricPings.clear();
  }

  sendMetricPing() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    for (const [id, sentAt] of this.pendingMetricPings) {
      if (now - sentAt > METRIC_PING_TIMEOUT_MS) {
        this.pendingMetricPings.delete(id);
        this.metrics.pingLost++;
      }
    }
    const id = ++this.metricPingSeq;
    this.pendingMetricPings.set(id, now);
    this.send({ t: 'clientPing', id });
  }

  onClientPong(msg) {
    const id = Math.max(0, Number(msg.id) || 0);
    const sentAt = this.pendingMetricPings.get(id);
    if (!sentAt) return;
    this.pendingMetricPings.delete(id);

    const rtt = performance.now() - sentAt;
    const m = this.metrics;
    const prev = m.rttMs || rtt;
    m.rttMs = m.rttMs ? m.rttMs * 0.75 + rtt * 0.25 : rtt;
    m.rttJitterMs = m.rttJitterMs ? m.rttJitterMs * 0.75 + Math.abs(rtt - prev) * 0.25 : Math.abs(rtt - prev);
    m.rttLastMs = rtt;
    m.rttSamples++;
  }

  noteInbound(type, bytes) {
    const now = performance.now();
    const m = this.metrics;
    m.inBytes += bytes;
    m.inMessages++;
    pushMetricSample(m.inSamples, now, bytes);
    noteMetricType(m.inTypes, type, bytes);
  }

  noteOutbound(type, bytes) {
    const now = performance.now();
    const m = this.metrics;
    m.outBytes += bytes;
    m.outMessages++;
    pushMetricSample(m.outSamples, now, bytes);
    noteMetricType(m.outTypes, type, bytes);
  }

  noteState(msg, bytes, now = performance.now()) {
    const m = this.metrics;
    m.stateBytes += bytes;
    m.stateMessages++;
    m.lastStateBytes = bytes;
    pushMetricSample(m.stateSamples, now, bytes);

    const stateIntervalMs = m.lastStateAt ? now - m.lastStateAt : 0;
    if (m.lastStateAt) pushMetricSample(m.stateIntervals, now, stateIntervalMs);
    m.lastStateAt = now;

    const tick = Number(msg.tick);
    if (Number.isFinite(tick)) {
      if (m.lastTick !== null) {
        const expectedTicks = stateIntervalMs > 0 ? Math.max(1, Math.round(stateIntervalMs / TICK_MS)) : 1;
        if (tick > m.lastTick + expectedTicks) m.tickGaps += tick - m.lastTick - expectedTicks;
        else if (tick <= m.lastTick) m.outOfOrderStates++;
      }
      m.lastTick = tick;
    }
  }

  noteLocalAction(action, seatId = null) {
    const playerId = seatId ? this.localPlayerForSeat(seatId)?.playerId : this.selfId;
    this.localActions.push({
      action,
      seatId: seatId ? String(seatId) : '',
      playerId: Math.max(0, Number(playerId) || 0),
      at: performance.now(),
    });
    while (this.localActions.length > MAX_LOCAL_ACTIONS) this.localActions.shift();
  }

  noteFx(fx, now = performance.now()) {
    const id = Math.max(0, Number(fx?.id) || 0);
    if (!id || !this.isLocalPlayerId(id)) return;
    const action = actionForFx(fx);
    if (!action) return;

    const minAt = now - LOCAL_ACTION_WINDOW_MS;
    while (this.localActions.length && this.localActions[0].at < minAt) this.localActions.shift();

    const index = this.localActions.findIndex((row) => row.playerId === id && row.action === action);
    if (index < 0) return;

    const [row] = this.localActions.splice(index, 1);
    const delay = now - row.at;
    const m = this.metrics;
    m.localFxDelayLastMs = delay;
    m.localFxDelayMs = m.localFxDelayMs ? m.localFxDelayMs * 0.72 + delay * 0.28 : delay;
    m.localFxSamples++;
    pushMetricSample(m.localFxSamplesWindow, now, delay);
  }

  metricsSnapshot() {
    const now = performance.now();
    const m = this.metrics;
    pruneMetricSamples(m.inSamples, now);
    pruneMetricSamples(m.outSamples, now);
    pruneMetricSamples(m.stateSamples, now);
    pruneMetricSamples(m.stateIntervals, now);
    pruneMetricSamples(m.localFxSamplesWindow, now);

    const bufferMs = this.buffer.length >= 2 ? this.buffer[this.buffer.length - 1].time - this.buffer[0].time : 0;
    const stateIntervalAvg = averageMetricValue(m.stateIntervals);
    const stateIntervalJitter = averageAbsDeviation(m.stateIntervals, stateIntervalAvg);
    const localFxWindowAvg = averageMetricValue(m.localFxSamplesWindow);

    return {
      connected: this.connected,
      interpMs: INTERP_MS,
      serverOffsetMs: this.serverOffsetMs,
      rttMs: m.rttMs,
      rttLastMs: m.rttLastMs,
      rttJitterMs: m.rttJitterMs,
      pingLost: m.pingLost,
      inKbps: kbps(m.inSamples),
      outKbps: kbps(m.outSamples),
      inMsgPs: perSecond(m.inSamples),
      outMsgPs: perSecond(m.outSamples),
      stateHz: perSecond(m.stateSamples),
      stateBytesAvg: averageMetricValue(m.stateSamples),
      stateBytesLast: m.lastStateBytes,
      stateIntervalMs: stateIntervalAvg,
      stateJitterMs: stateIntervalJitter,
      tick: m.lastTick,
      tickGaps: m.tickGaps,
      outOfOrderStates: m.outOfOrderStates,
      bufferMs,
      bufferFrames: this.buffer.length,
      localFxDelayMs: m.localFxDelayMs,
      localFxDelayLastMs: m.localFxDelayLastMs,
      localFxDelayWindowMs: localFxWindowAvg,
      localFxSamples: m.localFxSamples,
      totals: {
        inBytes: m.inBytes,
        outBytes: m.outBytes,
        inMessages: m.inMessages,
        outMessages: m.outMessages,
        stateBytes: m.stateBytes,
        stateMessages: m.stateMessages,
      },
      types: {
        in: cloneMetricTypes(m.inTypes),
        out: cloneMetricTypes(m.outTypes),
      },
    };
  }
}

function createMetrics() {
  return {
    inBytes: 0,
    outBytes: 0,
    inMessages: 0,
    outMessages: 0,
    stateBytes: 0,
    stateMessages: 0,
    lastStateBytes: 0,
    lastStateAt: 0,
    lastTick: null,
    tickGaps: 0,
    outOfOrderStates: 0,
    rttMs: 0,
    rttLastMs: 0,
    rttJitterMs: 0,
    rttSamples: 0,
    pingLost: 0,
    localFxDelayMs: 0,
    localFxDelayLastMs: 0,
    localFxSamples: 0,
    inSamples: [],
    outSamples: [],
    stateSamples: [],
    stateIntervals: [],
    localFxSamplesWindow: [],
    inTypes: {},
    outTypes: {},
  };
}

function noteMetricType(types, type, bytes) {
  const key = String(type || 'unknown');
  const row = (types[key] ||= { messages: 0, bytes: 0 });
  row.messages++;
  row.bytes += bytes;
}

function cloneMetricTypes(types) {
  return Object.fromEntries(Object.entries(types).map(([key, value]) => [key, { messages: value.messages, bytes: value.bytes }]));
}

function pushMetricSample(samples, t, value) {
  samples.push({ t, value });
  pruneMetricSamples(samples, t);
}

function pruneMetricSamples(samples, now) {
  while (samples.length && now - samples[0].t > METRIC_WINDOW_MS) samples.shift();
}

function averageMetricValue(samples) {
  if (!samples.length) return 0;
  return samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
}

function averageAbsDeviation(samples, avg) {
  if (!samples.length) return 0;
  return samples.reduce((sum, sample) => sum + Math.abs(sample.value - avg), 0) / samples.length;
}

function kbps(samples) {
  if (!samples.length) return 0;
  const spanMs = Math.max(1000, samples[samples.length - 1].t - samples[0].t);
  const bytes = samples.reduce((sum, sample) => sum + sample.value, 0);
  return (bytes * 8) / spanMs;
}

function perSecond(samples) {
  if (!samples.length) return 0;
  const spanMs = Math.max(1000, samples[samples.length - 1].t - samples[0].t);
  return (samples.length * 1000) / spanMs;
}

function byteLength(value) {
  return typeof value === 'string' ? value.length : 0;
}

function actionForFx(fx) {
  if (fx?.k === 'swing') return fx.slot ?? 'melee';
  if (fx?.k === 'jump') return 'jump';
  return FX_ACTIONS[fx?.team]?.[fx?.k] ?? null;
}

function lerpPlayer(a, b, alpha) {
  if (!b) return a;
  if (Math.hypot(b.x - a.x, b.y - a.y) > SNAP_DIST) return b;
  return { ...a, x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
}

function lerpProjectile(a, b, alpha) {
  if (!b) return a;
  if (Math.hypot(b.x - a.x, b.y - a.y) > SNAP_DIST) return b;
  return {
    ...a,
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
    a: a.a + (b.a - a.a) * alpha,
  };
}

function extrapolatePlayer(p, ageMs) {
  if (!p || p.d) return p;
  const ticks = extrapolatedTicks(ageMs);
  if (ticks <= 0 || (!(p.vx || p.vy))) return p;
  return { ...p, x: p.x + p.vx * ticks, y: p.y + p.vy * ticks };
}

function extrapolateProjectile(pr, ageMs) {
  const ticks = extrapolatedTicks(ageMs);
  if (ticks <= 0 || (!(pr.vx || pr.vy))) return pr;
  return {
    ...pr,
    x: pr.x + (pr.vx ?? 0) * ticks,
    y: pr.y + (pr.vy ?? 0) * ticks,
    a: pr.a === undefined ? pr.a : pr.a + ((pr.av ?? 0) * ticks),
  };
}

function extrapolatedTicks(ageMs) {
  return Math.max(0, Math.min(LOCAL_EXTRAP_MS, ageMs)) / TICK_MS;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function isLiveGamePhase(phase) {
  return phase === 'countdown' || phase === 'playing';
}
