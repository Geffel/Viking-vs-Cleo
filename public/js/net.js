// Halller WebSocket-anslutningen och en liten buffert av ognapsbilder.
// Andra spelare ritas INTERP_MS bakat i tiden och interpoleras, vilket gor
// rorelsen mjuk aven om ett paket kommer sent. Egen spelare ritas alltid
// pa senaste bilden sa att inputen kanns direkt.

// Bor i shared/constants.js eftersom servern spolar tillbaka exakt lika langt
// nar den avgor om ett slag traffade.
import { INTERP_MS } from '/shared/constants.js';
export { INTERP_MS };

const BUFFER_MS = 1000;
const SNAP_DIST = 220; // storre hopp an sa = respawn/teleport, interpolera inte

export class Net {
  constructor() {
    this.ws = null;
    this.selfId = 0;
    this.selfTeam = null;
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
    this.matches = [];
    this.match = null;
    this.connected = false;
    this.serverOffsetMs = 0;
    this.handlers = {};
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
      this.emit('open');
    };

    ws.onclose = () => {
      this.connected = false;
      this.clearLiveGame();
      this.emit('close');
      setTimeout(() => this.connect(), 1200);
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      this.updateServerTime(msg);
      if (msg.t === 'state') this.onState(msg);
      else if (msg.t === 'joined') {
        this.selfId = msg.id;
        this.selfTeam = msg.team;
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
        this.selfId = msg.id;
        this.selfTeam = msg.team;
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
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
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

  resetMatch() {
    this.send({ t: 'resetMatch' });
  }

  serverNow() {
    return Date.now() + this.serverOffsetMs;
  }

  updateServerTime(msg) {
    if (typeof msg.serverNow === 'number') this.serverOffsetMs = msg.serverNow - Date.now();
  }

  onState(msg) {
    const time = performance.now();
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
      if (fx.id === this.selfId) this.emit('fx', fx);
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
    this.buffer = [];
    this.latest = null;
    this.powerups = [];
    this.projectiles = [];
    this.score = { cleo: 0, viking: 0 };
  }

  self() {
    return this.selfId ? this.latest?.players.get(this.selfId) ?? null : null;
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

    for (const p of a.players.values()) {
      if (p.i === this.selfId) continue; // egen spelare ritas fran latest
      out.push(b ? lerpPlayer(p, b.players.get(p.i), clamp01((renderTime - a.time) / (b.time - a.time))) : p);
    }

    const me = this.self();
    if (me) out.push(me);
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

    for (const pr of a.projectiles ?? []) {
      if (pr.o === this.selfId) continue;
      const next = b?.projectiles?.find((p) => p.i === pr.i);
      out.push(next ? lerpProjectile(pr, next, alpha) : pr);
    }

    for (const pr of this.latest?.projectiles ?? []) {
      if (pr.o === this.selfId) out.push(pr);
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
    this.profile = profile;
    this.emit('profile', profile);
  }
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

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function isLiveGamePhase(phase) {
  return phase === 'countdown' || phase === 'playing';
}
