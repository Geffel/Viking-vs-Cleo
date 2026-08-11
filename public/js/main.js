import { Net } from '/js/net.js';
import { Renderer } from '/js/render.js';
import { AudioManager } from '/js/audio.js';
import { Hud } from '/js/hud.js';
import { AchievementsUi } from '/js/achievements.js';
import { ControlsUi } from '/js/controls.js';
import { initInput } from '/js/input.js';
import { initLobbyInfo } from '/js/info.js';
import { ACTION_SLOTS, MAPS, MAP_VOTE_MS, MATCH_DURATION_MS, MATCH_PHASES, NAME_MAX, mapLayoutFor, mapThemeFor } from '/shared/constants.js';

const net = new Net();
const stage = document.getElementById('stage');
const renderer = new Renderer(document.getElementById('canvas'));
const audio = new AudioManager({ getListener: () => net.self() });
const hud = new Hud();
const input = initInput(net, (action) => {
  audio.prime();
  if (ACTION_SLOTS.includes(action)) hud.flash(action);
});

const intro = document.getElementById('intro');
const introForm = document.getElementById('intro-form');
const introName = document.getElementById('intro-name');
const introError = document.getElementById('intro-error');
const lobby = document.getElementById('lobby');
const lobbyPlayerName = document.getElementById('lobby-player-name');
const lobbyError = document.getElementById('lobby-error');
const globalLobby = document.getElementById('global-lobby');
const matchList = document.getElementById('match-list');
const createMatchBtn = document.getElementById('create-match');
const openAchievementsBtn = document.getElementById('open-achievements');
const achievementsView = document.getElementById('achievements-view');
const openControlsBtn = document.getElementById('open-controls');
const controlsView = document.getElementById('controls-view');
const matchRoom = document.getElementById('match-room');
const matchRoomTitle = document.getElementById('match-room-title');
const matchRoomPhase = document.getElementById('match-room-phase');
const matchPlayerList = document.getElementById('match-player-list');
const characterSelect = document.getElementById('character-select');
const readyToggle = document.getElementById('ready-toggle');
const startMatchBtn = document.getElementById('start-match');
const resetMatchBtn = document.getElementById('reset-match');
const mapVote = document.getElementById('map-vote');
const mapVoteList = document.getElementById('map-vote-list');
const mapVoteTimer = document.getElementById('map-vote-timer');
const mapLockBtn = document.getElementById('map-lock');
const roundResults = document.getElementById('round-results');
const roundResultScore = document.getElementById('round-result-score');
const roundResultNote = document.getElementById('round-result-note');
const leaveMatchBtn = document.getElementById('leave-match');
const viewAchievementsResultBtn = document.getElementById('view-achievements-result');
const leaveMatchFallback = document.getElementById('leave-match-fallback');
const fightOverlay = document.getElementById('fight-overlay');
const fightCopy = document.getElementById('fight-copy');
const connEl = document.getElementById('conn');
const leaveBtn = document.getElementById('leave');
const matchClock = document.getElementById('match-clock');
const boardBody = document.getElementById('lobby-board-body');
const playerCard = document.getElementById('player-card');
const fighterProfile = document.getElementById('fighter-profile');
const fighterProfileBack = document.getElementById('fighter-profile-back');
const fighterProfileImg = document.getElementById('fighter-profile-img');
const fighterProfileRank = document.getElementById('fighter-profile-rank');
const fighterProfileName = document.getElementById('fighter-profile-name');
const fighterProfileRating = document.getElementById('fighter-profile-rating');
const fighterProfileRecord = document.getElementById('fighter-profile-record');
const fighterProfileTiles = document.getElementById('fighter-profile-tiles');

const TRANSITION_MS = 620;
const AUDIO_DEBUG = new URLSearchParams(location.search).has('audioDebug');
const ROW_ACCENTS = ['#ff4d9d', '#4dc3ff', '#ffd166', '#ff86bf'];
const MAP_TONES = {
  arena_01: '#ffd166',
  nile: '#ffd166',
  fjord: '#4dc3ff',
  deep_forest: '#7cf5b0',
  ivory_city: '#f0e6c8',
};
const WIPES = {
  lobby: { type: 'blade', a: '#0a0f1e', b: '#182238', vs: true },
  matchRoom: { type: 'blade', a: '#ff4d9d', b: '#4dc3ff', vs: true },
  mapVote: { type: 'blade', a: '#ffd166', b: '#ff9f43', vs: false },
  results: { type: 'blade', a: '#0a0f1e', b: '#151d34', vs: true },
  countdown: { type: 'flash', color: 'rgba(255,209,102,0.9)' },
};

const clientId = loadClientId();
let currentName = localStorage.getItem('vvc.name') ?? '';
let currentView = 'intro';
let leaderboardEntries = new Map();
let hoverCardId = 0;
let openProfileId = 0;
let hideCardTimer = 0;
let lastMatchPhase = '';
let fightFlashUntil = 0;
let wiping = false;
let lastFightText = '';
let lastFightMode = '';
let achievementsReturnView = 'lobby';
let controlsReturnView = 'lobby';

const achievementsUi = new AchievementsUi({
  playerName: () => currentName,
  onBack: closeAchievements,
});

const controlsUi = new ControlsUi({ onBack: closeControls });

introName.value = currentName;
initLobbyInfo();
initPlayerCard();
initAudioDebug();
setView('intro');

introForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submitName();
});

createMatchBtn.addEventListener('click', () => {
  lobbyError.textContent = '';
  net.createMatch();
});

openAchievementsBtn?.addEventListener('click', () => openAchievements());
viewAchievementsResultBtn?.addEventListener('click', () => openAchievements());
openControlsBtn?.addEventListener('click', () => openControls());

matchList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-join-match]');
  if (!btn) return;
  lobbyError.textContent = '';
  net.joinMatch(btn.dataset.joinMatch);
});

characterSelect.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-character]');
  if (!btn) return;
  lobbyError.textContent = '';
  net.setCharacter(btn.dataset.character);
});

readyToggle.addEventListener('click', () => {
  const me = currentMatchPlayer();
  if (!me) return;
  lobbyError.textContent = '';
  net.setReady(!me.ready);
});

startMatchBtn.addEventListener('click', () => {
  lobbyError.textContent = '';
  net.startMatch();
});

resetMatchBtn.addEventListener('click', () => {
  lobbyError.textContent = '';
  net.resetMatch();
});

mapLockBtn?.addEventListener('click', () => {
  const match = net.match;
  if (match?.phase !== MATCH_PHASES.mapVote) return;
  const me = currentMatchPlayer(match);
  const mapId = me?.mapVote ?? match.mapVotes?.[0]?.id ?? match.maps?.[0]?.id;
  if (mapId) net.voteMap(mapId);
});

mapVoteList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-map-id]');
  if (!btn || btn.disabled) return;
  lobbyError.textContent = '';
  net.voteMap(btn.dataset.mapId);
});

leaveBtn.addEventListener('click', leaveCurrentMatch);

function leaveCurrentMatch() {
  if (net.match) net.leaveMatch();
  else net.leave();
  audio.stopAllLoops();
  playWipe(WIPES.lobby, () => {
    renderMatchRoom(null);
    setView('lobby');
  });
}

leaveMatchFallback?.addEventListener('click', leaveCurrentMatch);

leaveMatchBtn.addEventListener('click', leaveCurrentMatch);

// ---------------------------------------------------------------- natverk

net.on('welcome', (msg) => {
  renderMatches(msg.matches ?? []);
});

net.on('identified', (msg) => {
  currentName = msg.name;
  localStorage.setItem('vvc.name', currentName);
  renderMatches(msg.matches ?? []);
  applyMatchUpdate(msg.match ?? null);
});

net.on('lobby', (msg) => {
  if (msg.me?.name) currentName = msg.me.name;
  if (msg.lb) renderLeaderboard(msg.lb);
  renderMatches(msg.matches ?? []);
  if (currentName) applyMatchUpdate(msg.match ?? null);
  else renderMatchRoom(msg.match ?? null);
});

net.on('match', (match) => {
  const previousPhase = lastMatchPhase;
  applyMatchUpdate(match, previousPhase);
});

net.on('appError', (msg) => {
  const target = currentView === 'intro' ? introError : lobbyError;
  target.textContent = msg.message ?? 'Something went wrong.';
});

net.on('leaderboard', renderLeaderboard);
net.on('profile', (profile) => achievementsUi.setProfile(profile));
net.on('achievementUnlocked', (msg) => achievementsUi.unlock(msg.achievements ?? [], msg.profile ?? null));

// Legacy-vagen finns kvar tills matchlobbyn faktiskt startar spelet.
net.on('joined', ({ team }) => {
  setView('game');
  hud.setTeam(team);
  leaveBtn.hidden = false;
  input.enable();
  document.activeElement?.blur();
});

net.on('gameReady', ({ team, match }) => {
  achievementsUi.clearMatch();
  const previousPhase = lastMatchPhase;
  applyMatchUpdate(match, previousPhase, () => {
    hud.setTeam(team);
    syncGameAccess(match);
    document.activeElement?.blur();
  });
});

net.on('fx', (fx) => {
  renderer.addFx(fx);
  audio.playFx(fx);
  if (AUDIO_DEBUG && isAudioDebugFx(fx)) console.log('audio fx', fx, audio.status());
});
net.on('kill', (kill) => hud.addKill(kill));

net.on('open', () => {
  connEl.hidden = true;
  if (currentView !== 'intro' && currentName) net.identify(currentName, clientId);
});

net.on('close', () => {
  connEl.hidden = false;
  connEl.textContent = 'Lost connection - reconnecting...';
  input.disable();
  audio.stopAllLoops();
  hud.hide();
});

net.connect();

// ------------------------------------------------------------- renderloop

let lastFrame = performance.now();

function frame(now) {
  const dt = now - lastFrame;
  lastFrame = now;

  const players = net.sample();
  audio.sync(players);
  const arena = currentArena();
  renderer.setArena(arena.asset, arena.theme);
  renderer.setMapLayout(arena.layout);
  renderer.draw(players, net.powerups, net.sampleProjectiles(), net.selfId, dt);

  hud.updateScore(net.score);
  const me = net.self();
  if (me) {
    hud.sync(me);
    hud.updateSelf(me);
  }
  hud.update(dt);
  updatePhaseTimers();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ vyer

function submitName() {
  const name = introName.value.trim().slice(0, NAME_MAX);
  if (!name) {
    introError.textContent = 'Enter a name.';
    introName.focus();
    return;
  }
  if (!net.connected) {
    introError.textContent = 'Waiting for the server...';
    return;
  }

  introError.textContent = '';
  currentName = name;
  net.identify(name, clientId);
}

function setView(view) {
  currentView = view;

  intro.classList.toggle('hidden', view !== 'intro');
  lobby.classList.toggle('hidden', view === 'intro' || view === 'game');
  globalLobby.hidden = view !== 'lobby';
  matchRoom.hidden = view !== 'matchRoom';
  if (achievementsView) achievementsView.hidden = view !== 'achievements';
  if (controlsView) controlsView.hidden = view !== 'controls';
  leaveBtn.hidden = view !== 'game';

  // Profil-overlayen hor bara hemma i globala lobbyn.
  if (view !== 'lobby' && openProfileId) closeProfile();

  if (view !== 'game') {
    input.disable();
    hud.hide();
    if (fightOverlay) fightOverlay.hidden = true;
    resetFightCopy();
  }

  if (view === 'intro') {
    window.setTimeout(() => introName.focus(), 0);
  }

  if (view === 'lobby' || view === 'matchRoom' || view === 'achievements' || view === 'controls') {
    lobbyPlayerName.textContent = currentName ? `Connected as ${currentName}` : 'Global lobby';
  }

  markViewEntry(view);
}

function openAchievements() {
  achievementsReturnView = currentView === 'matchRoom' ? 'matchRoom' : 'lobby';
  hidePlayerCard();
  if (openProfileId) closeProfile();
  achievementsUi.renderPage();
  setView('achievements');
}

function closeAchievements() {
  const backTo = achievementsReturnView === 'matchRoom' && net.match ? 'matchRoom' : 'lobby';
  setView(backTo);
}

function openControls() {
  controlsReturnView = currentView === 'matchRoom' ? 'matchRoom' : 'lobby';
  hidePlayerCard();
  if (openProfileId) closeProfile();
  controlsUi.open();
  setView('controls');
}

function closeControls() {
  const backTo = controlsReturnView === 'matchRoom' && net.match ? 'matchRoom' : 'lobby';
  setView(backTo);
}

function applyMatchUpdate(match, previousPhase = lastMatchPhase, after = null) {
  const wipe = selectMatchWipe(match, previousPhase);
  const apply = () => {
    renderMatchRoom(match ?? null);
    routeForMatch(match ?? null, previousPhase);
    after?.();
  };

  if (wipe) playWipe(wipe, apply);
  else apply();
}

function selectMatchWipe(match, previousPhase) {
  if (!currentName) return null;

  if (!match) {
    if (currentView === 'intro' || currentView === 'matchRoom' || currentView === 'game') return WIPES.lobby;
    return null;
  }

  if (previousPhase === MATCH_PHASES.mapVote && match.phase === MATCH_PHASES.countdown) return WIPES.countdown;
  if (match.phase === MATCH_PHASES.results && previousPhase !== MATCH_PHASES.results) return WIPES.results;
  if (match.phase === MATCH_PHASES.mapVote && previousPhase !== MATCH_PHASES.mapVote) return WIPES.mapVote;

  if (match.phase === MATCH_PHASES.matchLobby) {
    if (currentView === 'intro' || currentView === 'lobby' || previousPhase === MATCH_PHASES.results) return WIPES.matchRoom;
  }

  return null;
}

function playWipe(wipe, swap) {
  if (!wipe || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    swap();
    return;
  }

  if (wiping) {
    swap();
    return;
  }

  wiping = true;
  const ov = document.createElement('div');
  ov.className = 'vvc-overlay';

  if (wipe.type === 'blade') {
    const bladeEase = 'cubic-bezier(0.16,0.9,0.2,1)';
    const bladeA = wipe.a || '#0a0f1e';
    const bladeB = wipe.b || '#182238';
    const blades = [
      ['vvc-blade-left', 'right', `linear-gradient(100deg, ${bladeA}, ${bladeB})`, 'vvc-bladeL'],
      ['vvc-blade-right', 'left', `linear-gradient(280deg, ${bladeA}, ${bladeB})`, 'vvc-bladeR'],
    ];

    blades.forEach(([bladeClass, edgeSide, background, animationName]) => {
      const blade = document.createElement('div');
      blade.className = bladeClass;
      blade.style.background = background;
      blade.style.animation = `${animationName} ${TRANSITION_MS}ms ${bladeEase} both`;
      blade.innerHTML = `<span class="vvc-blade-texture"></span><span class="vvc-blade-edge ${edgeSide}"></span>`;
      ov.appendChild(blade);
    });

    const seam = document.createElement('div');
    seam.className = 'vvc-blade-seam';
    seam.style.animation = `vvc-seamflash ${TRANSITION_MS}ms ease-out both`;
    ov.appendChild(seam);

    const impact = document.createElement('div');
    impact.className = 'vvc-impact';
    impact.style.animation = `vvc-impact ${TRANSITION_MS}ms ease-out both`;
    ov.appendChild(impact);

    [-38, -24, -12, -4, 6, 16, 28, 40].forEach((angle, i) => {
      const spark = document.createElement('div');
      spark.className = 'vvc-spark';
      spark.style.setProperty('--a', `${angle}deg`);
      spark.style.width = `${60 + (i % 3) * 34}px`;
      spark.style.background = `linear-gradient(90deg, #fff, ${i % 2 ? '#ffd166' : i % 3 ? '#ff4d9d' : '#4dc3ff'}, transparent)`;
      spark.style.animation = `vvc-spark ${TRANSITION_MS}ms cubic-bezier(0.2,0.7,0.3,1) both`;
      ov.appendChild(spark);
    });

    if (wipe.vs !== false) {
      const vs = document.createElement('div');
      vs.className = 'vvc-vs';
      vs.innerHTML = '<span>VS</span>';
      vs.style.animation = `vvc-vspop ${TRANSITION_MS}ms cubic-bezier(0.3,1.5,0.5,1) both`;
      vs.querySelector('span').style.animation = `vvc-vsjitter ${TRANSITION_MS}ms ease-out both`;
      ov.appendChild(vs);
    }
  } else {
    const flash = document.createElement('div');
    flash.style.cssText = 'position:absolute;inset:0';
    flash.style.background = `radial-gradient(circle, ${wipe.color}, transparent 72%)`;
    flash.style.animation = `vvc-flash ${TRANSITION_MS}ms ease-out both`;
    ov.appendChild(flash);
  }

  document.body.appendChild(ov);
  window.setTimeout(swap, TRANSITION_MS * 0.46);
  window.setTimeout(() => {
    ov.remove();
    wiping = false;
  }, TRANSITION_MS * 1.04);
}

function markViewEntry(view) {
  const el =
    view === 'intro'
      ? intro
      : view === 'lobby'
        ? globalLobby
        : view === 'matchRoom'
          ? matchRoom
          : view === 'achievements'
            ? achievementsView
            : view === 'controls'
              ? controlsView
              : null;
  if (!el) return;
  el.classList.remove('vvc-enter');
  void el.offsetWidth;
  el.classList.add('vvc-enter');
}

function renderMatches(matches) {
  net.matches = matches;
  if (!matchList) return;

  if (!matches.length) {
    matchList.innerHTML = '<div class="empty">No matches yet.</div>';
    return;
  }

  matchList.innerHTML = matches
    .map((match, index) => {
      // Ingen match ar last langre - man far joina aven en pagaende match.
      const inLobby = match.phase === MATCH_PHASES.matchLobby;
      const mapLabel = match.selectedMap ? mapName(match, match.selectedMap) : '';
      const accent = ROW_ACCENTS[index % ROW_ACCENTS.length];
      return `
        <div class="match-row" data-match-id="${escapeHtml(match.id)}" style="--row-accent:${accent};--row-delay:${(index * 0.06).toFixed(2)}s">
          <div class="match-main">
            <span class="match-title">${escapeHtml(match.title)}</span>
            <span class="match-meta">
              <span>host <b>${escapeHtml(match.hostName)}</b></span>
              <span class="phase-badge ${inLobby ? '' : 'locked'}">${phaseLabel(match.phase)}</span>
              ${mapLabel ? `<span class="match-map">🗺 ${escapeHtml(mapLabel)}</span>` : ''}
            </span>
          </div>
          <div class="match-side">
            <span class="match-count">${match.playerCount}</span>
            <button type="button" data-join-match="${escapeHtml(match.id)}">${inLobby ? 'Join' : 'Jump in'}</button>
          </div>
        </div>`;
    })
    .join('');
}

function renderMatchRoom(match) {
  net.match = match;
  if (!match || !matchRoom) {
    if (matchRoom) matchRoom.dataset.phase = '';
    if (matchPlayerList) matchPlayerList.innerHTML = '';
    if (mapVote) mapVote.hidden = true;
    if (roundResults) roundResults.hidden = true;
    if (leaveMatchFallback) leaveMatchFallback.hidden = true;
    return;
  }

  const me = currentMatchPlayer(match);
  const isHost = me?.id === match.hostId;
  const inMatchLobby = match.phase === MATCH_PHASES.matchLobby;
  const inResults = match.phase === MATCH_PHASES.results;
  // En sen anslutare som annu inte spawnats (ingen selfId, ingen karaktar) far
  // valja sida for att hoppa in i en match som redan startat.
  const preGame = [MATCH_PHASES.mapVote, MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(match.phase);
  const joiningLive = preGame && !!me && !me.character && !net.selfId;
  const canPick = inMatchLobby || joiningLive;
  matchRoom.dataset.phase = match.phase;
  matchRoomTitle.textContent = match.title;
  const selectedMap = mapName(match, match.selectedMap);
  matchRoomPhase.textContent = joiningLive
    ? 'Pick a character to jump into the match' + (selectedMap ? ` - Map: ${selectedMap}` : '')
    : `${phaseLabel(match.phase)} - Host ${match.hostName} - Ready ${match.readyCount}/${match.playerCount}` +
      (selectedMap ? ` - Map: ${selectedMap}` : '');

  characterSelect.hidden = !canPick;

  for (const btn of characterSelect.querySelectorAll('[data-character]')) {
    const on = btn.dataset.character === me?.character;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.disabled = !canPick;
  }

  readyToggle.hidden = !inMatchLobby;
  readyToggle.textContent = me?.ready ? 'Ready' : 'Ready up';
  readyToggle.classList.toggle('on', !!me?.ready);
  readyToggle.disabled = !inMatchLobby || !me?.character;

  startMatchBtn.hidden = !isHost || !inMatchLobby;
  startMatchBtn.disabled = !match.allCharactersChosen;
  startMatchBtn.title = match.allCharactersChosen ? '' : 'Everyone must pick a character first.';
  resetMatchBtn.hidden = !isHost || !inResults;
  if (leaveMatchFallback) leaveMatchFallback.hidden = inResults;
  if (leaveMatchBtn) leaveMatchBtn.hidden = !inResults;

  renderMapVote(match);
  renderRoundResults(match);

  matchPlayerList.innerHTML = match.players
    .map(
      (player) => {
        const character = player.character ?? '';
        const accent = characterColor(character);
        const avatar = character
          ? `<img src="/assets/${escapeHtml(character)}/idle.png" alt="" />`
          : `<span class="avatar-empty">?</span>`;
        return `
        <div class="match-player ${player.ready ? 'ready' : 'not-ready'}" data-session-id="${player.id}" style="--player-accent:${accent}">
          <span class="player-avatar ${escapeHtml(character)}">${avatar}</span>
          <span class="player-copy">
            <span class="player-name-line">
              <b>${escapeHtml(player.n)}</b>
              ${player.id === match.hostId ? '<span class="host-mark">&#9819; host</span>' : ''}
            </span>
            <span class="player-character">${escapeHtml(playerStatus(player, match))}</span>
          </span>
          <span class="ready-badge ${player.ready ? 'ready' : ''}">${player.ready ? 'Ready' : 'Not ready'}</span>
        </div>`;
      },
    )
    .join('');
}

function routeForMatch(match, previousPhase = lastMatchPhase) {
  if (!currentName) return;
  if (!match) {
    lastMatchPhase = '';
    fightFlashUntil = 0;
    resetFightCopy();
    setView('lobby');
    return;
  }

  const enteringFight = previousPhase === MATCH_PHASES.countdown && match.phase === MATCH_PHASES.playing;
  if (previousPhase === MATCH_PHASES.countdown && match.phase === MATCH_PHASES.playing) {
    fightFlashUntil = performance.now() + 1200;
  }
  lastMatchPhase = match.phase;

  // Sen anslutare som annu inte spawnats (ingen selfId) stannar i matchrummet
  // och valjer karaktar - forst nar de faktiskt ar med i arenan gar de till spelvyn.
  const live = match.phase === MATCH_PHASES.countdown || match.phase === MATCH_PHASES.playing;
  if (live && net.selfId) setView('game');
  else setView('matchRoom');

  syncGameAccess(match);
  if (enteringFight) triggerFightSlam();
}

function syncGameAccess(match = net.match) {
  if (match?.phase === MATCH_PHASES.playing && net.selfId) input.enable();
  else input.disable();

  updateFightOverlay(match);
  updateMatchClock(match);
}

function renderMapVote(match) {
  if (!mapVote || !mapVoteList) return;
  const voting = match.phase === MATCH_PHASES.mapVote;
  mapVote.hidden = !voting;
  if (!voting) {
    mapVoteList.innerHTML = '';
    return;
  }

  updateMapVoteTimer(match);
  const maps = match.mapVotes?.length ? match.mapVotes : match.maps ?? [];
  const myVote = currentMatchPlayer(match)?.mapVote ?? null;
  if (mapLockBtn) mapLockBtn.disabled = !maps.length;

  mapVoteList.innerHTML = maps
    .map((map, index) => {
      const voters = map.voters ?? [];
      const chosen = myVote === map.id;
      const tone = mapTone(map.id, index);
      // Forhandsbilden om den finns, annars arenabilden i full storlek.
      const image = map.thumb ?? map.asset;
      const hasImage = !!image;
      return `
        <button class="map-option ${hasImage ? 'has-image' : 'placeholder'} ${chosen ? 'on' : ''}" type="button" data-map-id="${escapeHtml(
          map.id,
        )}" aria-pressed="${chosen}" style="--map-tone:${tone};${hasImage ? `--map-image:url('${escapeHtml(map.asset)}')` : ''}">
          <span class="map-name">${escapeHtml(map.name ?? map.id)}</span>
          <span class="map-count">${voters.length}</span>
          <span class="vote-pills">
            ${voters
              .map(
                (voter) =>
                  `<span class="vote-pill ${escapeHtml(voter.character ?? '')}" title="${escapeHtml(voter.n)}">${escapeHtml(initials(voter.n))}</span>`,
              )
              .join('')}
          </span>
        </button>`;
    })
    .join('');
}

function renderRoundResults(match) {
  if (!roundResults || !roundResultScore || !roundResultNote) return;
  const showing = match.phase === MATCH_PHASES.results;
  roundResults.hidden = !showing;
  if (!showing) return;

  const cleo = Math.max(0, Number(match.finalScore?.cleo) || 0);
  const viking = Math.max(0, Number(match.finalScore?.viking) || 0);
  const winner = cleo === viking ? '' : cleo > viking ? 'cleo' : 'viking';
  const winnerColor = winner === 'viking' ? 'rgba(77,195,255,' : 'rgba(255,77,157,';
  const mvp = match.players.find((player) => player.character === winner)?.n ?? match.hostName ?? currentName;

  roundResults.style.setProperty('--winner-bg', winner ? `${winnerColor}0.14)` : 'rgba(255,209,102,0.14)');
  roundResults.style.setProperty('--winner-border', winner ? `${winnerColor}0.4)` : 'rgba(255,209,102,0.42)');
  roundResultScore.innerHTML = `
    <span class="result-side cleo"><span>Cleo</span><strong>${cleo}</strong></span>
    <span class="result-vs"><span>VS</span></span>
    <span class="result-side viking"><span>Viking</span><strong>${viking}</strong></span>`;
  roundResultNote.innerHTML = `${escapeHtml(resultLabel(cleo, viking))} - MVP <b>${escapeHtml(mvp || 'Host')}</b>`;
  achievementsUi.renderSummary(match);
  roundResults.classList.remove('vvc-enter');
  void roundResults.offsetWidth;
  roundResults.classList.add('vvc-enter');
}

function updatePhaseTimers() {
  const match = net.match;
  if (match?.phase === MATCH_PHASES.mapVote) updateMapVoteTimer(match);
  updateMatchClock(match);
  if (currentView === 'game') updateFightOverlay(match);
}

function updateMapVoteTimer(match) {
  if (!mapVoteTimer) return;
  const left = remainingMs(match.voteEndsAt);
  mapVoteTimer.textContent = formatClock(left);
  mapVote?.style.setProperty('--vote-progress', `${Math.max(0, Math.min(100, (left / MAP_VOTE_MS) * 100)).toFixed(1)}%`);
}

function updateFightOverlay(match = net.match) {
  if (!fightOverlay || !fightCopy) return;

  if (match?.phase === MATCH_PHASES.countdown) {
    fightOverlay.hidden = false;
    fightOverlay.classList.add('countdown-mode');
    fightOverlay.classList.remove('fight-mode');
    setFightCopy(String(Math.max(1, Math.ceil(remainingMs(match.countdownEndsAt) / 1000))), 'vvc-count');
    return;
  }

  if (match?.phase === MATCH_PHASES.playing && performance.now() < fightFlashUntil) {
    fightOverlay.hidden = false;
    fightOverlay.classList.remove('countdown-mode');
    fightOverlay.classList.add('fight-mode');
    setFightCopy('FIGHT', 'vvc-fight');
    return;
  }

  fightOverlay.hidden = true;
  fightOverlay.classList.remove('countdown-mode', 'fight-mode');
  resetFightCopy();
}

function updateMatchClock(match = net.match) {
  if (!matchClock) return;

  const live = match?.phase === MATCH_PHASES.countdown || match?.phase === MATCH_PHASES.playing;
  matchClock.hidden = !live;
  if (!live) {
    matchClock.textContent = formatClock(MATCH_DURATION_MS);
    matchClock.classList.remove('low', 'critical');
    return;
  }

  const left =
    match.phase === MATCH_PHASES.playing && Number(match.matchEndsAt) > 0 ? remainingMs(match.matchEndsAt) : MATCH_DURATION_MS;
  matchClock.textContent = formatClock(left);
  matchClock.classList.toggle('low', match.phase === MATCH_PHASES.playing && left <= 60000 && left > 10000);
  matchClock.classList.toggle('critical', match.phase === MATCH_PHASES.playing && left <= 10000);
}

function setFightCopy(text, mode) {
  if (lastFightText === text && lastFightMode === mode) return;
  lastFightText = text;
  lastFightMode = mode;
  fightCopy.className = '';
  void fightCopy.offsetWidth;
  fightCopy.textContent = text;
  fightCopy.classList.add(mode);
}

function resetFightCopy() {
  lastFightText = '';
  lastFightMode = '';
  if (fightCopy) fightCopy.className = '';
}

function triggerFightSlam() {
  if (!stage || !fightOverlay || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  stage.classList.remove('vvc-shake');
  void stage.offsetWidth;
  stage.classList.add('vvc-shake');
  window.setTimeout(() => stage.classList.remove('vvc-shake'), 540);

  const whiteout = document.createElement('div');
  whiteout.className = 'fight-whiteout';
  fightOverlay.appendChild(whiteout);
  window.setTimeout(() => whiteout.remove(), 540);
}

function initAudioDebug() {
  if (!AUDIO_DEBUG) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Test audio';
  btn.setAttribute('aria-label', 'Test audio');
  btn.textContent = '♪';
  btn.style.cssText = [
    'position:fixed',
    'right:14px',
    'bottom:14px',
    'z-index:99999',
    'width:44px',
    'height:44px',
    'border-radius:50%',
    'border:1px solid rgba(255,255,255,0.38)',
    'background:rgba(10,15,30,0.88)',
    'color:#ffd166',
    'font:700 24px/1 system-ui,sans-serif',
    'box-shadow:0 10px 30px rgba(0,0,0,0.34)',
    'cursor:pointer',
  ].join(';');
  btn.addEventListener('click', async () => {
    audio.setMuted(false);
    audio.setMasterVolume(1);
    audio.setSfxVolume(1);
    btn.textContent = '...';
    const beep = await audio.testBeep();
    console.log('audio beep status', beep);
    window.setTimeout(async () => {
      const sun = await audio.testSunFire();
      console.log('audio sunfire status', sun);
      btn.textContent = '♪';
    }, 420);
  });
  document.body.appendChild(btn);
}

function isAudioDebugFx(fx) {
  if (fx.k?.startsWith('sun_fire')) return true;
  if (fx.team === 'cleo' && (fx.k === 'sand_blast' || fx.k === 'blink' || fx.k === 'power_shield')) return true;
  if (fx.team !== 'viking') return false;
  return fx.k === 'swing' || fx.k === 'axe_throw' || fx.k === 'axe_hit' || fx.k === 'hit' || fx.k === 'combo';
}

function currentMatchPlayer(match = net.match) {
  return match?.players?.find((player) => player.id === net.sessionId) ?? null;
}

function mapName(match, mapId) {
  if (!mapId) return '';
  const map = match?.maps?.find((item) => item.id === mapId);
  return map?.name ?? mapId;
}

function currentArena(match = net.match) {
  const selectedId = match?.selectedMap ?? match?.maps?.find((map) => map.asset)?.id ?? MAPS.find((map) => map.asset)?.id;
  const config = MAPS.find((map) => map.id === selectedId) ?? MAPS.find((map) => map.asset) ?? MAPS[0];
  return {
    // Bildlosa kartor ar platshallare och lanar fjordens bild.
    asset: config?.asset ?? '/assets/arena_nordic.png',
    theme: mapThemeFor(config?.id),
    layout: mapLayoutFor(config?.id),
  };
}

function characterLabel(character) {
  if (character === 'cleo') return 'Cleo';
  if (character === 'viking') return 'Viking';
  return 'Unpicked';
}

function playerStatus(player, match) {
  const character = characterLabel(player.character);
  if (match.phase === MATCH_PHASES.matchLobby) return player.id === net.sessionId ? `${character} - you` : character;
  if (match.phase === MATCH_PHASES.mapVote) return `${character} - ${mapName(match, player.mapVote) || 'no vote'}`;
  if (match.phase === MATCH_PHASES.results) return `${character} - ready for next round`;
  return character;
}

function resultLabel(cleo, viking) {
  if (cleo === viking) return 'Draw round';
  return cleo > viking ? 'Team Cleo takes the round' : 'Team Viking takes the round';
}

function phaseLabel(phase) {
  switch (phase) {
    case 'globalLobby':
      return 'Global lobby';
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

function remainingMs(endsAt) {
  return Math.max(0, Number(endsAt || 0) - net.serverNow());
}

function characterColor(character) {
  if (character === 'cleo') return '#ff4d9d';
  if (character === 'viking') return '#4dc3ff';
  return 'rgba(255,255,255,0.22)';
}

function mapTone(mapId, index = 0) {
  return MAP_TONES[mapId] ?? ROW_ACCENTS[index % ROW_ACCENTS.length];
}

function initials(name) {
  const clean = String(name || '').trim();
  return (clean.match(/\b\w/g) ?? [clean[0] ?? '?']).slice(0, 2).join('').toUpperCase();
}

function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ hjalp

window.vvc = { net, renderer, hud, audio };

function formatPlayTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderLeaderboard(entries) {
  if (!boardBody) return;
  leaderboardEntries = new Map(entries.map((entry, index) => [entry.id, { ...entry, rank: index + 1 }]));

  if (!entries.length) {
    boardBody.innerHTML = '<div class="lb-empty">No stats yet.</div>';
    hidePlayerCard();
    if (openProfileId) closeProfile();
    return;
  }

  boardBody.innerHTML = entries
    .map((entry, index) => {
      const rank = index + 1;
      const kills = Number(entry.kills) || 0;
      const deaths = Number(entry.deaths) || 0;
      return `
        <div class="lb-row ${rank <= 3 ? 'top' : ''}" data-profile-id="${entry.id}" style="--row-accent:${fighterAccent(entry.fav)}">
          <span class="lb-rank">${rank}</span>
          <span class="lb-avatar"><img src="${fighterAsset(entry.fav)}" alt="" /></span>
          <span class="lb-id">
            <span class="lb-name">${escapeHtml(entry.n)}</span>
            <span class="lb-record">${kills}K &middot; ${deaths}D</span>
          </span>
          <span class="lb-score">
            <span class="lb-rating">${Number(entry.pts) || 0}</span>
            <span class="lb-pts">pts</span>
          </span>
        </div>`;
    })
    .join('');

  // Halla en oppen profil i synk med farsk leaderboard-data.
  if (openProfileId) {
    if (leaderboardEntries.has(openProfileId)) renderProfile(openProfileId);
    else closeProfile();
  }
}

function initPlayerCard() {
  if (!boardBody) return;

  boardBody.addEventListener('pointerover', (e) => {
    const row = e.target.closest('.lb-row');
    if (!row) return;
    clearHideCardTimer();
    showPlayerCard(Number(row.dataset.profileId), row);
  });

  boardBody.addEventListener('pointerout', (e) => {
    const row = e.target.closest('.lb-row');
    if (!row) return;
    if (row.contains(e.relatedTarget)) return;
    scheduleHidePlayerCard();
  });

  boardBody.addEventListener('click', (e) => {
    const row = e.target.closest('.lb-row');
    if (!row) return;
    openProfile(Number(row.dataset.profileId));
  });

  fighterProfileBack?.addEventListener('click', closeProfile);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openProfileId) closeProfile();
  });
  window.addEventListener('resize', () => {
    if (!hoverCardId || !playerCard || playerCard.hidden) return;
    const row = boardBody.querySelector(`[data-profile-id="${hoverCardId}"]`);
    if (row) positionPlayerCard(row);
  });
}

// Leaderboard-datan har ingen egen karaktarsflagga, sa vi harleder sida ur
// serverns favoritkaraktar ('Cleo' / 'Viking' / 'Bade ...' / 'Ingen an').
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
  if (deaths > 0) return (kills / deaths).toFixed(2);
  return kills > 0 ? '∞' : '0.00';
}

function showPlayerCard(profileId, row) {
  const entry = leaderboardEntries.get(profileId);
  if (!entry || !playerCard) return;

  clearHideCardTimer();
  hoverCardId = profileId;

  const kills = Number(entry.kills) || 0;
  const deaths = Number(entry.deaths) || 0;
  playerCard.style.setProperty('--card-accent', fighterAccent(entry.fav));
  playerCard.innerHTML = `
    <div class="pc-head">
      <span class="pc-name">${escapeHtml(entry.n)}</span>
      <span class="pc-tag">${killDeathRatio(kills, deaths)} K/D</span>
    </div>
    <div class="pc-stats">
      <div class="pc-stat"><div class="k">Points</div><div class="v">${Number(entry.pts) || 0}</div></div>
      <div class="pc-stat"><div class="k">Playtime</div><div class="v">${formatPlayTime(entry.ms)}</div></div>
      <div class="pc-stat"><div class="k">Kills</div><div class="v">${kills}</div></div>
      <div class="pc-stat"><div class="k">Deaths</div><div class="v">${deaths}</div></div>
    </div>
    <div class="pc-foot">Click for full profile &#9656;</div>`;
  playerCard.hidden = false;
  positionPlayerCard(row);
}

function hidePlayerCard() {
  clearHideCardTimer();
  hoverCardId = 0;
  if (playerCard) playerCard.hidden = true;
}

function scheduleHidePlayerCard() {
  clearHideCardTimer();
  hideCardTimer = window.setTimeout(hidePlayerCard, 90);
}

function clearHideCardTimer() {
  if (!hideCardTimer) return;
  clearTimeout(hideCardTimer);
  hideCardTimer = 0;
}

function positionPlayerCard(row) {
  if (!row || !playerCard) return;
  const rect = row.getBoundingClientRect();
  const margin = 12;
  const width = playerCard.offsetWidth || 212;
  const height = playerCard.offsetHeight || 160;

  // Ligger till vanster om raden (leaderboarden ar hogerkolumn), faller
  // tillbaka till hogersidan om det inte far plats.
  let left = rect.left - width - 10;
  if (left < margin) left = rect.right + 10;
  left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);

  const top = Math.min(Math.max(margin, rect.top), window.innerHeight - height - margin);

  playerCard.style.left = `${left}px`;
  playerCard.style.top = `${top}px`;
}

function openProfile(profileId) {
  const entry = leaderboardEntries.get(profileId);
  if (!entry || !fighterProfile) return;

  hidePlayerCard();
  openProfileId = profileId;
  renderProfile(profileId);
  fighterProfile.hidden = false;
  globalLobby.hidden = true;
}

function renderProfile(profileId) {
  const entry = leaderboardEntries.get(profileId);
  if (!entry || !fighterProfile) return;

  const kills = Number(entry.kills) || 0;
  const deaths = Number(entry.deaths) || 0;

  fighterProfile.style.setProperty('--profile-accent', fighterAccent(entry.fav));
  fighterProfileImg.src = fighterAsset(entry.fav);
  fighterProfileRank.textContent = `Rank ${entry.rank ?? '-'} · ${sideLabel(entry.fav)}`;
  fighterProfileName.textContent = entry.n;
  fighterProfileRating.textContent = String(Number(entry.pts) || 0);
  fighterProfileRecord.textContent = `${kills} kills · ${deaths} deaths`;

  const tiles = [
    { k: 'Points', v: Number(entry.pts) || 0, sub: 'this season' },
    { k: 'Kills', v: kills, sub: 'total' },
    { k: 'Deaths', v: deaths, sub: 'total' },
    { k: 'K/D', v: killDeathRatio(kills, deaths), sub: 'ratio' },
    { k: 'Play time', v: formatPlayTime(entry.ms), sub: 'in arena' },
    { k: 'Main', v: sideLabel(entry.fav), sub: 'favorite fighter' },
    { k: 'Prey', v: entry.prey?.name ?? '-', sub: entry.prey ? `${entry.prey.count} kills` : 'none yet' },
    { k: 'Nemesis', v: entry.nemesis?.name ?? '-', sub: entry.nemesis ? `${entry.nemesis.count} deaths` : 'none yet' },
  ];

  fighterProfileTiles.innerHTML = tiles
    .map(
      (t) => `
        <div class="profile-tile">
          <div class="k">${escapeHtml(t.k)}</div>
          <div class="v">${escapeHtml(String(t.v))}</div>
          <div class="sub">${escapeHtml(t.sub)}</div>
        </div>`,
    )
    .join('');
}

function closeProfile() {
  openProfileId = 0;
  if (fighterProfile) fighterProfile.hidden = true;
  if (currentView === 'lobby' && globalLobby) globalLobby.hidden = false;
}

function loadClientId() {
  const key = 'vvc.clientId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = createClientId();
    localStorage.setItem(key, id);
  }
  return id;
}

function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex || `vvc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
