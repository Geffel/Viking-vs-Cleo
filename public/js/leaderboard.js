const rowsEl = document.getElementById('leaderboard-rows');
const summaryEl = document.getElementById('leaderboard-summary');
const statusEl = document.getElementById('leaderboard-status');
const clockEl = document.getElementById('leaderboard-clock');
const onlineEl = document.getElementById('leaderboard-online');
const cleoPctEl = document.getElementById('leaderboard-cleo-pct');
const vikingPctEl = document.getElementById('leaderboard-viking-pct');
const cleoWinsEl = document.getElementById('leaderboard-cleo-wins');
const vikingWinsEl = document.getElementById('leaderboard-viking-wins');
const cleoBarEl = document.getElementById('leaderboard-cleo-bar');
const vikingBarEl = document.getElementById('leaderboard-viking-bar');
const leadEl = document.getElementById('leaderboard-lead');
const climberEl = document.getElementById('leaderboard-climber');
const tickerEl = document.getElementById('leaderboard-ticker');

const LIVE_PHASES = new Set(['countdown', 'playing']);
// "Recent" i rorelse-kolumnen och Top Climber betyder detta fonster. Utan det
// mats allt mot sidladdningen och tavlan fryser efter nagra timmar uppe.
const MOVEMENT_WINDOW_MS = 10 * 60 * 1000;
const state = {
  rows: [],
  matches: [],
  summary: null,
  serverOffsetMs: 0,
  lastUpdateAt: 0,
  baselineRanks: new Map(),
  baselineAt: 0,
  previousRows: new Map(),
  changedRows: new Set(),
  gains: new Map(),
  gainEvents: [],
  rowNodes: new Map(),
  tickerHtml: '',
  countersHtml: '',
  ws: null,
  reconnectTimer: 0,
};

connect();
window.setInterval(tickClock, 1000);
window.vvcLeaderboard = { state, reconnect: connect };

function connect() {
  if (state.reconnectTimer) {
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = 0;
  }

  setConnection('connecting');
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}`);
  state.ws = ws;

  ws.addEventListener('open', () => setConnection('connected'));
  ws.addEventListener('message', onMessage);
  ws.addEventListener('close', () => {
    if (state.ws === ws) state.ws = null;
    setConnection('offline');
    state.reconnectTimer = window.setTimeout(connect, 1200);
  });
  ws.addEventListener('error', () => setConnection('offline'));
}

function onMessage(event) {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }

  if (typeof msg.serverNow === 'number') state.serverOffsetMs = msg.serverNow - Date.now();

  if (msg.t === 'welcome') {
    applyData({ rows: msg.lb, matches: msg.matches, summary: msg.leaderboardSummary, serverNow: msg.serverNow });
    return;
  }

  if (msg.t === 'lobby') {
    applyData({ rows: msg.lb, matches: msg.matches, summary: msg.leaderboardSummary, serverNow: msg.serverNow });
    return;
  }

  if (msg.t === 'leaderboard') {
    applyData({ rows: msg.lb, matches: msg.matches, summary: msg.summary, serverNow: msg.serverNow });
  }
}

function applyData({ rows = null, matches = null, summary = null, serverNow = null }) {
  if (Array.isArray(rows)) state.rows = rows;
  if (Array.isArray(matches)) state.matches = matches;
  state.summary = summary ?? deriveSummary(state.rows, state.matches);
  state.lastUpdateAt = typeof serverNow === 'number' ? serverNow : serverNowMs();

  updateMovementTrackers(state.rows);
  render();
}

function updateMovementTrackers(rows) {
  const now = serverNowMs();

  // Ny baslinje nar fonstret lopt ut, annars visar UP/DOWN rorelse fran i gar.
  if (rows.length && (!state.baselineRanks.size || now - state.baselineAt > MOVEMENT_WINDOW_MS)) {
    state.baselineRanks = new Map(rows.map((entry, index) => [entry.id, index + 1]));
    state.baselineAt = now;
  }

  state.changedRows = new Set();
  rows.forEach((entry, index) => {
    const prev = state.previousRows.get(entry.id);
    const rank = index + 1;
    const gained = Math.max(0, Number(entry.pts) - Number(prev?.pts ?? entry.pts));
    if (gained) state.gainEvents.push({ id: entry.id, pts: gained, at: now });
    if (prev && (prev.rank !== rank || prev.pts !== Number(entry.pts) || prev.kills !== Number(entry.kills) || prev.deaths !== Number(entry.deaths))) {
      state.changedRows.add(entry.id);
    }
  });

  // Summera bara okningar inom fonstret - listan sallas samtidigt sa den inte vaxer.
  const cutoff = now - MOVEMENT_WINDOW_MS;
  state.gainEvents = state.gainEvents.filter((event) => event.at >= cutoff);
  state.gains = new Map();
  for (const event of state.gainEvents) state.gains.set(event.id, (state.gains.get(event.id) ?? 0) + event.pts);

  state.previousRows = new Map(
    rows.map((entry, index) => [
      entry.id,
      {
        rank: index + 1,
        pts: Number(entry.pts) || 0,
        kills: Number(entry.kills) || 0,
        deaths: Number(entry.deaths) || 0,
      },
    ]),
  );
}

function render() {
  renderRows();
  renderFactionWar();
  renderCounters();
  renderClimber();
  renderTicker();
  tickClock();
}

function renderRows() {
  if (!state.rows.length) {
    if (state.rowNodes.size || !rowsEl.firstElementChild) {
      state.rowNodes.clear();
      rowsEl.innerHTML = '<div class="gl-empty">No stats yet</div>';
    }
    return;
  }

  rowsEl.querySelector('.gl-empty')?.remove();
  const topScore = Math.max(1, ...state.rows.map((entry) => Number(entry.pts) || 0));
  const seen = new Set();

  // Raderna ateranvands i stallet for att byggas om. En ny nod nollstaller sina
  // CSS-animationer, och med en broadcast i sekunden hann skimret aldrig rulla.
  state.rows.forEach((entry, index) => {
    let node = state.rowNodes.get(entry.id);
    if (!node) {
      node = createRow();
      state.rowNodes.set(entry.id, node);
    }

    updateRow(node, entry, index + 1, topScore);
    seen.add(entry.id);
    // Flyttar bara nar rankningen faktiskt bytt plats: CSS raknar nth-child.
    if (rowsEl.children[index] !== node) rowsEl.insertBefore(node, rowsEl.children[index] ?? null);
  });

  for (const [id, node] of state.rowNodes) {
    if (seen.has(id)) continue;
    node.remove();
    state.rowNodes.delete(id);
  }
}

function createRow() {
  const node = document.createElement('div');
  node.className = 'gl-row';
  node.innerHTML = `
      <span class="gl-scan"></span>
      <div class="gl-rank-cell">
        <span class="gl-rank-num"></span>
        <span class="gl-rank-move"></span>
      </div>
      <span class="gl-avatar"><img alt="" /></span>
      <div class="gl-fighter-cell">
        <div>
          <span class="gl-name"></span>
          <span class="gl-faction-tag"></span>
        </div>
        <div class="gl-row-meta">
          <span class="gl-row-gain"></span>
          <span class="gl-row-time"></span>
        </div>
      </div>
      <div class="gl-num"></div>
      <div class="gl-win"></div>
      <div class="gl-kd"></div>
      <div class="gl-score">
        <span></span>
        <i></i>
      </div>`;
  return node;
}

function updateRow(node, entry, rank, topScore) {
  const stats = entry.stats ?? {};
  const matches = Number(stats.matches?.played) || 0;
  const wins = Number(stats.matches?.wins) || 0;
  const kills = Number(entry.kills) || 0;
  const deaths = Number(entry.deaths) || 0;
  const points = Number(entry.pts) || 0;
  const delta = (state.baselineRanks.get(entry.id) ?? rank) - rank;
  const gain = state.gains.get(entry.id) ?? 0;

  node.classList.toggle('top', rank <= 3);
  setVar(node, '--tone', rankTone(entry, rank));
  setVar(node, '--score-width', `${Math.max(4, Math.round((points / topScore) * 100))}%`);

  const move = node.querySelector('.gl-rank-move');
  move.classList.toggle('up', delta > 0);
  move.classList.toggle('down', delta < 0);

  setSrc(node.querySelector('.gl-avatar img'), fighterAsset(entry.fav));
  setText(node.querySelector('.gl-rank-num'), String(rank));
  setText(move, movementLabel(delta));
  setText(node.querySelector('.gl-name'), entry.n);
  setText(node.querySelector('.gl-faction-tag'), sideLabel(entry.fav));
  setText(node.querySelector('.gl-row-gain'), gain ? `+${formatNumber(gain)} pts` : 'no recent gain');
  setText(node.querySelector('.gl-row-time'), formatPlayTime(entry.ms));
  setText(node.querySelector('.gl-num'), formatNumber(matches));
  setText(node.querySelector('.gl-win'), `${matches ? Math.round((wins / matches) * 100) : 0}%`);
  setText(node.querySelector('.gl-kd'), killDeathRatio(kills, deaths));
  setText(node.querySelector('.gl-score span'), formatNumber(points));

  if (state.changedRows.has(entry.id)) flashRow(node);
}

function flashRow(node) {
  // Noden lever vidare, sa blinken maste startas om for hand.
  node.classList.remove('changed');
  void node.offsetWidth;
  node.classList.add('changed');
}

function setText(el, value) {
  const text = String(value);
  if (el.textContent !== text) el.textContent = text;
}

function setSrc(el, value) {
  if (el.getAttribute('src') !== value) el.setAttribute('src', value);
}

function setVar(el, name, value) {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

function renderFactionWar() {
  const points = state.summary?.factionPoints ?? { cleo: 0, viking: 0 };
  const cleo = Math.max(0, Number(points.cleo) || 0);
  const viking = Math.max(0, Number(points.viking) || 0);
  const total = cleo + viking;
  const cleoPct = total ? Math.round((cleo / total) * 100) : 50;
  const vikingPct = 100 - cleoPct;

  cleoPctEl.textContent = `${cleoPct}%`;
  vikingPctEl.textContent = `${vikingPct}%`;
  cleoWinsEl.textContent = winsLabel(cleo);
  vikingWinsEl.textContent = winsLabel(viking);
  cleoBarEl.style.width = `${cleoPct}%`;
  vikingBarEl.style.width = `${vikingPct}%`;

  if (cleoPct === vikingPct) {
    leadEl.textContent = 'Factions are tied';
    leadEl.style.color = '#ffd166';
  } else if (cleoPct > vikingPct) {
    leadEl.textContent = 'Cleo dynasty leads the arena';
    leadEl.style.color = '#ff4d9d';
  } else {
    leadEl.textContent = 'Viking clans lead the arena';
    leadEl.style.color = '#4dc3ff';
  }
}

function winsLabel(wins) {
  return `${formatNumber(wins)} ${wins === 1 ? 'win' : 'wins'}`;
}

function renderCounters() {
  const summary = state.summary ?? deriveSummary(state.rows, state.matches);
  const counters = [
    { k: 'Matches live', v: summary.liveMatches ?? 0, tone: '#ff4d9d' },
    { k: 'Fighters online', v: summary.activePlayers ?? 0, tone: '#4dc3ff' },
    { k: 'Total kills', v: summary.totalKills ?? sum(state.rows, 'kills'), tone: '#ffd166' },
    { k: 'Kebabs claimed', v: summary.totalKebabs ?? 0, tone: '#7cf5b0' },
  ];

  onlineEl.textContent = `${formatNumber(summary.activePlayers ?? 0)} fighters online`;

  const html = counters
    .map(
      (counter) => `
        <div class="gl-counter" style="--tone:${counter.tone}">
          <span>${escapeHtml(counter.k)}</span>
          <b>${formatNumber(counter.v)}</b>
        </div>`,
    )
    .join('');

  if (html === state.countersHtml) return;
  state.countersHtml = html;
  summaryEl.innerHTML = html;
}

function renderClimber() {
  const climber = topClimber();
  if (!climber) return;

  const entry = climber.entry;
  const tone = fighterAccent(entry.fav);
  climberEl.style.setProperty('--tone', tone);
  setSrc(climberEl.querySelector('.gl-climber-avatar img'), fighterAsset(entry.fav));
  setText(climberEl.querySelector('.gl-climber-name'), entry.n);
  setText(climberEl.querySelector('.gl-climber-jump'), `+${formatNumber(Math.max(0, climber.jump))} ranks`);
  setText(climberEl.querySelector('.gl-climber-note'), `+${formatNumber(climber.gain)} points / now #${climber.rank}`);
}

function renderTicker() {
  const items = tickerItems();
  const text = items.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
  if (text === state.tickerHtml) return;
  state.tickerHtml = text;
  tickerEl.innerHTML = `${text}${text}`;
}

function tickClock() {
  const now = new Date(serverNowMs());
  clockEl.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
}

function setConnection(mode) {
  document.body.dataset.connection = mode;
  if (mode === 'connected') {
    statusEl.textContent = 'Live';
    return;
  }
  statusEl.textContent = mode === 'connecting' ? 'Connecting' : 'Reconnecting';
}

function topClimber() {
  if (!state.rows.length) return null;

  let best = null;
  state.rows.forEach((entry, index) => {
    const rank = index + 1;
    const jump = (state.baselineRanks.get(entry.id) ?? rank) - rank;
    const gain = state.gains.get(entry.id) ?? 0;
    const candidate = { entry, rank, jump, gain };
    if (!best || candidate.jump > best.jump || (candidate.jump === best.jump && candidate.gain > best.gain)) best = candidate;
  });

  return best;
}

function tickerItems() {
  const items = [];
  const liveMatches = [...state.matches].filter((match) => LIVE_PHASES.has(match.phase));

  for (const match of liveMatches.slice(0, 4)) {
    const score = match.liveScore ?? match.finalScore ?? {};
    items.push(`${match.title ?? `Match ${match.id}`} is ${phaseLabel(match.phase)} / Cleo ${score.cleo ?? 0} - ${score.viking ?? 0} Viking`);
  }

  for (const entry of state.rows.slice(0, 5)) {
    const gain = state.gains.get(entry.id) ?? 0;
    if (gain) items.push(`${entry.n} gained ${gain} points`);
  }

  if (state.rows[0]) items.push(`${state.rows[0].n} holds rank #1 with ${formatNumber(state.rows[0].pts)} points`);
  if (state.summary?.liveMatches) items.push(`${state.summary.liveMatches} live matches are running`);
  if (!items.length) items.push('Arena feed is waiting for the next match');

  return items;
}

function deriveSummary(rows, matches) {
  return {
    totalProfiles: rows.length,
    shownProfiles: rows.length,
    activePlayers: 0,
    activeMatches: matches.length,
    liveMatches: matches.filter((match) => LIVE_PHASES.has(match.phase)).length,
    totalKills: sum(rows, 'kills'),
    totalPlayMs: sum(rows, 'ms'),
    totalMatches: sumMatches(rows),
    totalKebabs: 0,
    factionPoints: { cleo: 0, viking: 0 },
  };
}

function sumMatches(rows = state.rows) {
  return rows.reduce((total, entry) => total + (Number(entry.stats?.matches?.played) || 0), 0);
}

function phaseLabel(phase) {
  switch (phase) {
    case 'matchLobby':
      return 'Lobby';
    case 'mapVote':
      return 'Map vote';
    case 'countdown':
      return 'Countdown';
    case 'playing':
      return 'In match';
    case 'results':
      return 'Results';
    default:
      return phase || 'Unknown';
  }
}

function movementLabel(delta) {
  if (delta > 0) return `UP ${delta}`;
  if (delta < 0) return `DOWN ${Math.abs(delta)}`;
  return '--';
}

function rankTone(entry, rank) {
  if (rank === 1) return '#ffd166';
  if (rank === 2) return '#cfd6e6';
  if (rank === 3) return '#e0975a';
  return fighterAccent(entry.fav);
}

function fighterAccent(fav) {
  const f = String(fav || '');
  const hasCleo = f.includes('Cleo');
  const hasViking = f.includes('Viking');
  if (hasViking && !hasCleo) return '#4dc3ff';
  if (hasCleo && !hasViking) return '#ff4d9d';
  return '#ffd166';
}

function fighterAsset(fav) {
  const f = String(fav || '');
  if (f.includes('Viking') && !f.includes('Cleo')) return '/assets/viking/idle.png';
  return '/assets/cleo/idle.png';
}

function sideLabel(fav) {
  const f = String(fav || '');
  const hasCleo = f.includes('Cleo');
  const hasViking = f.includes('Viking');
  if (hasCleo && hasViking) return 'Both';
  if (hasViking) return 'Viking';
  if (hasCleo) return 'Cleo';
  return 'None';
}

function killDeathRatio(kills, deaths) {
  if (deaths > 0) return (kills / deaths).toFixed(1);
  return kills > 0 ? 'inf' : '0.0';
}

function formatPlayTime(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

function serverNowMs() {
  return Date.now() + state.serverOffsetMs;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Number(value) || 0));
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
