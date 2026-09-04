import { Net } from '/js/net.js';
import { Renderer } from '/js/render.js';
import { AudioManager } from '/js/audio.js';
import { Hud } from '/js/hud.js';
import { AchievementsUi } from '/js/achievements.js';
import { SettingsUi } from '/js/settings.js';
import { initInput } from '/js/input.js';
import { initGamepadCursor } from '/js/gamepad-cursor.js';
import { initLobbyInfo } from '/js/info.js';
import {
  ACTION_SLOTS,
  ABILITIES,
  ABILITY_BINDS,
  COMBO,
  GAMEPAD_BINDS,
  LOCAL_SEAT_IDS,
  MAPS,
  MAP_VOTE_MS,
  MATCH_DURATION_MS,
  MATCH_MODES,
  MATCH_PHASES,
  MELEE,
  MELEE_ATTACKS,
  MELEE_BINDS,
  NAME_MAX,
  TEAMS,
  TRAINING,
  mapLayoutFor,
  mapSoundtrackFor,
  mapThemeFor,
} from '/shared/constants.js';
import { keycapFor, onBindingsChange } from '/js/keybinds.js';

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
const trainingModeBtn = document.getElementById('training-mode');
const openAchievementsBtn = document.getElementById('open-achievements');
const achievementsView = document.getElementById('achievements-view');
const openSettingsBtn = document.getElementById('open-settings');
const settingsView = document.getElementById('settings-view');
const matchRoom = document.getElementById('match-room');
const matchRoomTitle = document.getElementById('match-room-title');
const matchRoomPhase = document.getElementById('match-room-phase');
const matchPlayerList = document.getElementById('match-player-list');
const characterSelect = document.getElementById('character-select');
const readyToggle = document.getElementById('ready-toggle');
const sharedScreenToggle = document.getElementById('shared-screen-toggle');
const startMatchBtn = document.getElementById('start-match');
const resetMatchBtn = document.getElementById('reset-match');
const mapVote = document.getElementById('map-vote');
const mapVoteList = document.getElementById('map-vote-list');
const mapVoteTimer = document.getElementById('map-vote-timer');
const mapVoteStep = document.getElementById('map-vote-step');
const mapVoteTitle = document.getElementById('map-vote-title');
const mapVoteClock = document.getElementById('map-vote-clock');
const mapVoteFoot = document.querySelector('.map-vote-foot');
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
const scoreboard = document.getElementById('scoreboard');
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
const openInstructionsBtn = document.getElementById('open-instructions');
const gameInstructionsBtn = document.getElementById('game-instructions');
const trainingSwitch = document.getElementById('training-switch');
const instructionsOverlay = document.getElementById('instructions-overlay');
const instructionsCloseBtn = document.getElementById('instructions-close');
const instructionsTabs = [...document.querySelectorAll('[data-help-team]')];
const instructionsBasics = document.getElementById('instructions-basics');
const instructionsCombos = document.getElementById('instructions-combos');

const TRANSITION_MS = 620;
const DEBUG_PARAMS = new URLSearchParams(location.search);
const AUDIO_DEBUG = DEBUG_PARAMS.has('audioDebug');
const NET_DEBUG = DEBUG_PARAMS.has('netDebug') || localStorage.getItem('vvc.netDebug') === '1';
const NET_LOG_SAMPLE_MS = 1000;
const NET_LOG_MAX_ROWS = 3600;
const NET_LOG_VERSION = 1;
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
const SCREEN_PROMPT_DELAY_MS = 1500;
const MENU_SOUNDTRACK = {
  id: 'mainMenuTheme',
  url: '/assets/audio/soundtracks/main_menu_theme.ogg',
  volume: 0.24,
  fadeInMs: 1400,
  fadeOutMs: 650,
  resume: true,
};
const MENU_MUSIC_PHASES = new Set([MATCH_PHASES.matchLobby, MATCH_PHASES.mapVote, MATCH_PHASES.results]);
const CHARACTER_IDS = ['cleo', 'viking'];
const HOST_SEAT_ID = LOCAL_SEAT_IDS[0] ?? 'P1';
const SHARED_PAD_DEADZONE = 0.55;
const SHARED_PAD_WAKE_DEADZONE = 0.65;
const SHARED_PAD_BUTTON_DEADZONE = 0.5;
const SHARED_CONFIRM_BUTTON = GAMEPAD_BINDS.jump.button ?? 0;
const SHARED_CANCEL_BUTTON = 1;
const SHARED_WAKE_BUTTONS = new Set([SHARED_CONFIRM_BUTTON, SHARED_CANCEL_BUTTON, 12, 13, 14, 15]);

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
let settingsReturnView = 'lobby';
let screenPromptTimer = 0;
let screenPromptKey = '';
let instructionsTeam = 'cleo';
let instructionsFocusReturn = null;
const sharedSeatInput = {
  frame: 0,
  pads: new Map(),
  cursorBySeat: new Map(),
  mapCursorBySeat: new Map(),
  pendingGamepads: new Set(),
  pendingConnections: new Set(),
};

const achievementsUi = new AchievementsUi({
  playerName: () => currentName,
  onBack: closeAchievements,
});

const settingsUi = new SettingsUi({ audio, onBack: closeSettings });
const gamepadCursor = initGamepadCursor();

introName.value = currentName;
initLobbyInfo();
initPlayerCard();
initInstructions();
initAudioDebug();
const netDebug = initNetDebug(NET_DEBUG);
initMenuClicks();
setView('intro');
syncMatchMusic(null);

introForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submitName();
});

createMatchBtn.addEventListener('click', () => {
  lobbyError.textContent = '';
  net.createMatch();
});

trainingModeBtn?.addEventListener('click', () => {
  lobbyError.textContent = '';
  net.createMatch({ training: true });
});

trainingSwitch?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-training-character]');
  if (!btn || btn.disabled) return;
  net.trainingSwitchCharacter(btn.dataset.trainingCharacter);
});

openAchievementsBtn?.addEventListener('click', () => openAchievements());
viewAchievementsResultBtn?.addEventListener('click', () => openAchievements());
openSettingsBtn?.addEventListener('click', () => openSettings());

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
  if (isSharedScreenMatch(net.match)) net.setLocalSeatCharacter(HOST_SEAT_ID, btn.dataset.character);
  else net.setCharacter(btn.dataset.character);
});

readyToggle.addEventListener('click', () => {
  const match = net.match;
  const sharedScreen = isSharedScreenMatch(match);
  const me = sharedScreen ? localSeatById(match, HOST_SEAT_ID) : currentMatchPlayer(match);
  if (!me) return;
  lobbyError.textContent = '';
  if (sharedScreen) net.setLocalSeatReady(HOST_SEAT_ID, !me.ready);
  else net.setReady(!me.ready);
});

sharedScreenToggle?.addEventListener('click', () => {
  const match = net.match;
  if (!match) return;
  lobbyError.textContent = '';
  net.setSharedScreenMode(!isSharedScreenMatch(match));
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
  if (isSharedScreenMatch(match)) {
    const seat = localSeatById(match, HOST_SEAT_ID);
    const mapId = seat?.mapVote ?? match.mapVotes?.[0]?.id ?? match.maps?.[0]?.id;
    if (mapId) net.voteLocalSeatMap(HOST_SEAT_ID, mapId);
    return;
  }

  const me = currentMatchPlayer(match);
  const mapId = me?.mapVote ?? match.mapVotes?.[0]?.id ?? match.maps?.[0]?.id;
  if (mapId) net.voteMap(mapId);
});

mapVoteList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-map-id]');
  if (!btn || btn.disabled) return;
  lobbyError.textContent = '';
  if (isSharedScreenMatch(net.match)) net.voteLocalSeatMap(HOST_SEAT_ID, btn.dataset.mapId);
  else net.voteMap(btn.dataset.mapId);
});

leaveBtn.addEventListener('click', leaveCurrentMatch);

function leaveCurrentMatch() {
  const keepMenuMusic = net.match?.phase !== MATCH_PHASES.playing;
  if (net.match) net.leaveMatch();
  else net.leave();
  clearScreenPrompt();
  audio.stopAllLoops({ keepMusicIntent: keepMenuMusic, preserveMusic: keepMenuMusic });
  playWipe(WIPES.lobby, () => {
    renderMatchRoom(null);
    setView('lobby');
    syncMatchMusic(null);
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
net.on('achievementStats', (stats) => achievementsUi.setAchievementStats(stats));
net.on('achievementUnlocked', (msg) => achievementsUi.unlock(msg.achievements ?? [], msg.profile ?? null));

// Legacy-vagen finns kvar tills matchlobbyn faktiskt startar spelet.
net.on('joined', ({ team }) => {
  setView('game');
  hud.setTeam(team);
  leaveBtn.hidden = false;
  input.enable();
  document.activeElement?.blur();
});

net.on('gameReady', ({ team, match, localPlayers }) => {
  achievementsUi.clearMatch();
  const previousPhase = lastMatchPhase;
  applyMatchUpdate(match, previousPhase, () => {
    // Taket forst: setTeam laser av det nar rutornas nedrakning byggs.
    hud.setCooldownCap(isTrainingMatch(match) ? TRAINING.abilityCooldownMs : 0);
    if (localPlayers?.length) hud.setSharedMode(true);
    else hud.setTeam(team);
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
  renderer.draw(players, net.powerups, net.sampleProjectiles(), net.localPlayerIds(), dt);

  hud.updateScore(net.score);
  if (isSharedScreenMatch(net.match) && net.localPlayers.size) {
    hud.updateShared(net.localSelfPlayers(), sharedSeatsFor(net.match));
  } else {
    const me = net.self();
    if (me) {
      hud.sync(me);
      hud.updateSelf(me);
    }
  }
  hud.update(dt);
  updatePhaseTimers();
  netDebug.update(now);

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
  const changedView = currentView !== view;
  currentView = view;

  intro.classList.toggle('hidden', view !== 'intro');
  lobby.classList.toggle('hidden', view === 'intro' || view === 'game');
  globalLobby.hidden = view !== 'lobby';
  matchRoom.hidden = view !== 'matchRoom';
  if (achievementsView) achievementsView.hidden = view !== 'achievements';
  if (settingsView) settingsView.hidden = view !== 'settings';
  // Installningarna lyssnar efter tangenter medan man binder om - de maste fa
  // veta nar de inte langre ar framme.
  if (view !== 'settings') settingsUi.close();
  leaveBtn.hidden = view !== 'game';
  if (changedView) closeInstructions({ restoreFocus: false });

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

  if (view === 'lobby' || view === 'matchRoom' || view === 'achievements' || view === 'settings') {
    lobbyPlayerName.textContent = currentName ? `Connected as ${currentName}` : 'Global lobby';
  }

  if (view === 'matchRoom') {
    syncScreenPrompt(net.match);
    syncSharedSeatScanner(net.match);
  } else {
    clearScreenPrompt();
    syncSharedSeatScanner(null);
  }

  syncTrainingOverlay();
  markViewEntry(view);
  syncGamepadCursor();
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

function openSettings(section) {
  settingsReturnView = currentView === 'matchRoom' ? 'matchRoom' : 'lobby';
  hidePlayerCard();
  if (openProfileId) closeProfile();
  settingsUi.open(section);
  setView('settings');
}

function closeSettings() {
  const backTo = settingsReturnView === 'matchRoom' && net.match ? 'matchRoom' : 'lobby';
  setView(backTo);
}

function initInstructions() {
  if (!openInstructionsBtn || !instructionsOverlay) return;

  openInstructionsBtn.addEventListener('click', openInstructions);
  gameInstructionsBtn?.addEventListener('click', openInstructions);
  instructionsCloseBtn?.addEventListener('click', () => closeInstructions());
  instructionsOverlay.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-help-team]');
    if (!tab) return;
    instructionsTeam = tab.dataset.helpTeam === 'viking' ? 'viking' : 'cleo';
    renderInstructions();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || instructionsOverlay.hidden) return;
    e.preventDefault();
    closeInstructions();
  });
  onBindingsChange(() => {
    if (!instructionsOverlay.hidden) renderInstructions();
  });

  renderInstructions();
}

function openInstructions() {
  if (!instructionsOverlay) return;
  hidePlayerCard();
  instructionsFocusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // I spelvyn ligger overlayen over arenan i stallet for over lobbypanelen, och
  // tangenterna far inte lacka igenom till figuren bakom.
  instructionsOverlay.classList.toggle('in-game', currentView === 'game');
  if (currentView === 'game') input.disable();
  instructionsOverlay.hidden = false;
  renderInstructions();
  window.setTimeout(() => instructionsCloseBtn?.focus(), 0);
}

function closeInstructions({ restoreFocus = true } = {}) {
  if (!instructionsOverlay || instructionsOverlay.hidden) return;
  instructionsOverlay.hidden = true;
  instructionsOverlay.classList.remove('in-game');
  if (restoreFocus) instructionsFocusReturn?.focus?.();
  instructionsFocusReturn = null;
  syncGameAccess();
}

function renderInstructions() {
  if (!instructionsOverlay || !instructionsBasics || !instructionsCombos) return;

  const team = instructionsTeam === 'viking' ? 'viking' : 'cleo';
  const accent = TEAMS[team]?.color ?? '#ff4d9d';
  instructionsOverlay.style.setProperty('--instructions-accent', accent);

  for (const tab of instructionsTabs) {
    const on = tab.dataset.helpTeam === team;
    tab.classList.toggle('on', on);
    tab.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  instructionsBasics.innerHTML = instructionsBasicRows(team)
    .map(
      (row) => `
        <div class="instructions-row">
          <span class="instructions-keychain">${keyChainMarkup(row.tokens)}</span>
          <span class="instructions-row-copy">
            <b>${escapeHtml(row.name)}</b>
            <span>${escapeHtml(row.desc)}</span>
          </span>
        </div>`,
    )
    .join('');

  instructionsCombos.innerHTML = COMBO.list.map((combo, index) => {
    const bonus = comboBonus(combo);
    return `
      <article class="instructions-combo" style="--combo-delay:${(index * 0.05).toFixed(2)}s">
        <div class="instructions-combo-head">
          <b>${escapeHtml(combo.name)}</b>
          <span class="instructions-combo-bonus">${escapeHtml(bonus)}<small>finisher</small></span>
        </div>
        <div class="instructions-keychain combo">${keyChainFromSlots(combo.seq)}</div>
        <p>${escapeHtml(comboTip(combo, team))}</p>
      </article>`;
  }).join('');
}

function instructionsBasicRows(team) {
  const melee = MELEE_ATTACKS[team] ?? {};
  const abilities = ABILITIES[team] ?? {};
  const rows = [
    { tokens: slotTokens(['left', 'right'], '/'), name: 'Move', desc: 'Walk left or right' },
    { tokens: slotTokens(['jump']), name: 'Jump', desc: 'Leap onto platforms' },
    { tokens: slotTokens(['drop']), name: 'Drop', desc: 'Fall through one-way platforms' },
  ];

  for (const bind of MELEE_BINDS) {
    const info = melee[bind.slot];
    rows.push({
      tokens: slotTokens([bind.slot]),
      name: info?.name ?? bind.slot,
      desc: `${MELEE.damageMin}-${MELEE.damageMax} damage right in front of you`,
    });
  }

  for (const bind of ABILITY_BINDS) {
    const info = abilities[bind.slot];
    if (!info) continue;
    rows.push({
      tokens: slotTokens([bind.slot]),
      name: info.name,
      desc: info.desc,
    });
  }

  return rows;
}

function slotTokens(slots, joiner = null) {
  return slots.flatMap((slot, index) => {
    const token = { type: 'key', value: keycapFor(slot) };
    if (!joiner || index === 0) return [token];
    return [{ type: 'join', value: joiner }, token];
  });
}

function keyChainFromSlots(slots) {
  return keyChainMarkup(slotTokens(slots, '->'), true);
}

function keyChainMarkup(tokens, arrows = false) {
  return tokens
    .map((token) => {
      if (token.type === 'join') {
        const label = arrows && token.value === '->' ? '&rarr;' : escapeHtml(token.value);
        return `<span class="instructions-joiner">${label}</span>`;
      }
      return `<kbd>${escapeHtml(token.value)}</kbd>`;
    })
    .join('');
}

function comboBonus(combo) {
  if (!combo.finisherMul || combo.finisherMul === 1) return 'Ready';
  return `+${Math.round((combo.finisherMul - 1) * 100)}%`;
}

function comboTip(combo, team) {
  const chain = combo.seq.map((slot) => moveName(team, slot)).join(' -> ');
  const parts = [`Land ${chain}`];
  if (combo.finisherMul && combo.finisherMul !== 1) parts.push(`finisher deals ${comboBonus(combo)} damage`);
  if (combo.refundCooldown) parts.push('melee cooldown refreshes instantly');
  if (combo.knockback && combo.knockback.y < MELEE.knockbackY) parts.push('launches the target upward');
  if (combo.stunMs) parts.push(`stuns for ${secondsText(combo.stunMs)}`);
  if (combo.healSelf) parts.push(`heals you ${combo.healSelf} HP`);
  return `${parts.join('. ')}.`;
}

function moveName(team, slot) {
  return MELEE_ATTACKS[team]?.[slot]?.name ?? slot;
}

function secondsText(ms) {
  const seconds = ms / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} second${seconds === 1 ? '' : 's'}`;
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

  if (previousPhase === MATCH_PHASES.mapVote && match.phase === MATCH_PHASES.countdown) {
    return isTrainingMatch(match) ? null : WIPES.countdown;
  }
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
  let showsVs = false;

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
      showsVs = true;
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
  if (showsVs) audio.playMenuTransition();
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
            : view === 'settings'
              ? settingsView
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
      // Vanliga matcher kan fortfarande joinas sent; shared screen ar stangd.
      const inLobby = match.phase === MATCH_PHASES.matchLobby;
      const sharedScreen = isSharedScreenMatch(match);
      const closed = !!match.closed || sharedScreen;
      const mapLabel = match.selectedMap ? mapName(match, match.selectedMap) : '';
      const accent = ROW_ACCENTS[index % ROW_ACCENTS.length];
      const joinLabel = closed ? 'Closed' : inLobby ? 'Join' : 'Jump in';
      const joinTitle = closed ? 'Shared screen matches are local only.' : '';
      return `
        <div class="match-row ${closed ? 'closed' : ''}" data-match-id="${escapeHtml(match.id)}" style="--row-accent:${accent};--row-delay:${(index * 0.06).toFixed(2)}s">
          <div class="match-main">
            <span class="match-title">${escapeHtml(match.title)}</span>
            <span class="match-meta">
              <span>host <b>${escapeHtml(match.hostName)}</b></span>
              <span class="phase-badge ${inLobby ? '' : 'locked'}">${phaseLabel(match.phase)}</span>
              ${sharedScreen ? '<span class="phase-badge shared">Shared screen</span>' : ''}
              ${closed ? '<span class="phase-badge closed">Closed</span>' : ''}
              ${mapLabel ? `<span class="match-map">🗺 ${escapeHtml(mapLabel)}</span>` : ''}
            </span>
          </div>
          <div class="match-side">
            <span class="match-count">${match.playerCount}</span>
            <button type="button" data-join-match="${escapeHtml(match.id)}" ${closed ? 'disabled' : ''} title="${escapeHtml(joinTitle)}">${joinLabel}</button>
          </div>
        </div>`;
    })
    .join('');
}

function renderMatchRoom(match) {
  net.match = match;
  if (!match || !matchRoom) {
    if (matchRoom) {
      matchRoom.dataset.phase = '';
      matchRoom.dataset.mode = '';
    }
    if (matchPlayerList) matchPlayerList.innerHTML = '';
    if (sharedScreenToggle) sharedScreenToggle.hidden = true;
    if (mapVote) mapVote.hidden = true;
    if (roundResults) roundResults.hidden = true;
    if (leaveMatchFallback) leaveMatchFallback.hidden = true;
    renderCharacterSeatMarkers(null);
    syncSharedSeatScanner(null);
    return;
  }

  const me = currentMatchPlayer(match);
  const isHost = me?.id === match.hostId;
  const inMatchLobby = match.phase === MATCH_PHASES.matchLobby;
  const sharedScreen = isSharedScreenMatch(match);
  const training = isTrainingMatch(match);
  const localSeats = sharedScreen ? sharedSeatsFor(match) : [];
  const hostSeat = sharedScreen ? localSeatById(match, HOST_SEAT_ID) : null;
  const inResults = match.phase === MATCH_PHASES.results;
  // En sen anslutare som annu inte spawnats (ingen selfId, ingen karaktar) far
  // valja sida for att hoppa in i en match som redan startat.
  const preGame = [MATCH_PHASES.mapVote, MATCH_PHASES.countdown, MATCH_PHASES.playing].includes(match.phase);
  const joiningLive = preGame && !!me && !me.character && !net.selfId;
  const canPick = sharedScreen ? inMatchLobby && isHost : inMatchLobby || joiningLive;
  matchRoom.dataset.phase = match.phase;
  matchRoom.dataset.mode = training ? MATCH_MODES.training : sharedScreen ? MATCH_MODES.sharedScreen : MATCH_MODES.online;
  matchRoomTitle.textContent = match.title;
  const selectedMap = mapName(match, match.selectedMap);
  const modeLabel = sharedScreen ? 'Shared screen - ' : '';
  const visibleReadyCount = sharedScreen ? match.localReadyCount ?? localSeats.filter((seat) => seat.ready).length : match.readyCount;
  const visiblePlayerCount = sharedScreen ? match.localSeatCount ?? localSeats.length : match.playerCount;
  const visiblePickedCount = sharedScreen ? match.localCharactersChosenCount ?? localSeats.filter((seat) => seat.character).length : 0;
  const progressLabel = sharedScreen ? `Picked ${visiblePickedCount}/${visiblePlayerCount}` : `Ready ${visibleReadyCount}/${visiblePlayerCount}`;
  matchRoomPhase.textContent = training
    ? 'Solo practice against a training dummy' + (selectedMap ? ` - Map: ${selectedMap}` : '')
    : joiningLive
      ? 'Pick a character to jump into the match' + (selectedMap ? ` - Map: ${selectedMap}` : '')
      : `${modeLabel}${phaseLabel(match.phase)} - Host ${match.hostName} - ${progressLabel}` +
        (selectedMap ? ` - Map: ${selectedMap}` : '');

  characterSelect.hidden = !canPick;

  for (const btn of characterSelect.querySelectorAll('[data-character]')) {
    const on = btn.dataset.character === (sharedScreen ? hostSeat?.character : me?.character);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.disabled = !canPick;
  }
  renderCharacterSeatMarkers(match);
  syncSharedSeatScanner(match);

  readyToggle.hidden = !inMatchLobby || sharedScreen || training;
  const readySource = sharedScreen ? hostSeat : me;
  readyToggle.textContent = readySource?.ready ? 'Ready' : 'Ready up';
  readyToggle.classList.toggle('on', !!readySource?.ready);
  readyToggle.disabled = !inMatchLobby || sharedScreen || training || !readySource?.character;

  if (sharedScreenToggle) {
    const canToggleSharedScreen = isHost && inMatchLobby && !training;
    const blockedByGuests = canToggleSharedScreen && !sharedScreen && match.playerCount > 1;
    sharedScreenToggle.hidden = !canToggleSharedScreen;
    sharedScreenToggle.disabled = blockedByGuests;
    sharedScreenToggle.classList.toggle('on', sharedScreen);
    sharedScreenToggle.setAttribute('aria-pressed', sharedScreen ? 'true' : 'false');
    sharedScreenToggle.textContent = sharedScreen ? 'Shared screen on' : 'Shared screen';
    sharedScreenToggle.title = blockedByGuests ? 'Only available when the host is the only online player.' : '';
  }

  const canStartMatch = sharedScreen ? sharedCanStartMatch(match, localSeats) : match.allCharactersChosen;
  startMatchBtn.hidden = !isHost || !inMatchLobby || training;
  startMatchBtn.disabled = !canStartMatch;
  startMatchBtn.title = sharedScreen
    ? sharedStartTitle(match, localSeats)
    : match.allCharactersChosen
      ? ''
      : 'Everyone must pick a character first.';
  resetMatchBtn.hidden = !isHost || !inResults;
  if (leaveMatchFallback) leaveMatchFallback.hidden = inResults;
  if (leaveMatchBtn) leaveMatchBtn.hidden = !inResults;

  renderMapVote(match);
  renderRoundResults(match);

  const roster = sharedScreen ? localSeats : match.players;
  matchPlayerList.innerHTML = roster
    .map(
      (player) => {
        const character = player.character ?? '';
        const accent = characterColor(character);
        const displayName = sharedScreen ? player.name ?? player.id : player.n;
        const avatar = character
          ? `<img src="/assets/${escapeHtml(character)}/idle.png" alt="" />`
          : `<span class="avatar-empty">?</span>`;
        const isHostRow = sharedScreen ? player.id === HOST_SEAT_ID : player.id === match.hostId;
        const inputLabel = sharedScreen ? localSeatInputLabel(player) : '';
        const readyLabel = sharedScreen ? (player.character ? 'Picked' : 'Choosing') : player.ready ? 'Ready' : 'Not ready';
        return `
        <div class="match-player ${player.ready ? 'ready' : 'not-ready'} ${sharedScreen ? 'local-seat' : ''} ${
          sharedScreen && player.connected === false ? 'disconnected' : ''
        }" data-session-id="${player.id}" style="--player-accent:${accent}">
          <span class="player-avatar ${escapeHtml(character)}">${avatar}</span>
          <span class="player-copy">
            <span class="player-name-line">
              <b>${escapeHtml(displayName)}</b>
              ${isHostRow ? '<span class="host-mark">&#9819; host</span>' : ''}
              ${inputLabel ? `<span class="host-mark local-device">${escapeHtml(inputLabel)}</span>` : ''}
            </span>
            <span class="player-character">${escapeHtml(sharedScreen ? localSeatStatus(player, match) : playerStatus(player, match))}</span>
          </span>
          <span class="ready-badge ${player.ready || (sharedScreen && player.character) ? 'ready' : ''}">${readyLabel}</span>
        </div>`;
      },
    )
    .join('');
}

function routeForMatch(match, previousPhase = lastMatchPhase) {
  if (!currentName) return;
  if (!match) {
    syncMatchMusic(null);
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
  syncMatchMusic(match);

  // Sen anslutare som annu inte spawnats (ingen selfId) stannar i matchrummet
  // och valjer karaktar - forst nar de faktiskt ar med i arenan gar de till spelvyn.
  const live = match.phase === MATCH_PHASES.countdown || match.phase === MATCH_PHASES.playing;
  if (live && net.localPlayerIds().length) setView('game');
  else setView('matchRoom');

  syncGameAccess(match);
  if (enteringFight) triggerFightSlam();
}

function syncMatchMusic(match) {
  let soundtrack = MENU_SOUNDTRACK;
  if (match?.phase === MATCH_PHASES.playing) soundtrack = mapSoundtrackFor(match.selectedMap);
  else if (match && !MENU_MUSIC_PHASES.has(match.phase)) soundtrack = null;
  audio.syncMusic(soundtrack);
}

function syncScreenPrompt(match) {
  const prompt = screenPromptFor(match);
  if (!prompt) {
    clearScreenPrompt();
    return;
  }
  if (screenPromptKey === prompt.key) return;

  clearScreenPrompt();
  screenPromptKey = prompt.key;
  screenPromptTimer = window.setTimeout(() => {
    screenPromptTimer = 0;
    if (screenPromptKey !== prompt.key || currentView !== 'matchRoom') return;

    const latest = screenPromptFor(net.match);
    if (latest?.key !== prompt.key) return;
    prompt.play();
  }, SCREEN_PROMPT_DELAY_MS);
}

function clearScreenPrompt() {
  if (screenPromptTimer) window.clearTimeout(screenPromptTimer);
  screenPromptTimer = 0;
  screenPromptKey = '';
}

function screenPromptFor(match) {
  const matchId = match?.id ?? 'match';
  if (match?.phase === MATCH_PHASES.matchLobby) {
    return { key: `${matchId}:fighter`, play: () => audio.playChooseYourFighter() };
  }
  if (match?.phase === MATCH_PHASES.mapVote) {
    return { key: `${matchId}:arena:${match.voteEndsAt ?? ''}`, play: () => audio.playSelectTheArena() };
  }
  return null;
}

function syncGameAccess(match = net.match) {
  const overlayOpen = !!instructionsOverlay && !instructionsOverlay.hidden;
  if (match?.phase === MATCH_PHASES.playing && net.localPlayerIds().length && !overlayOpen) input.enable();
  else input.disable();

  syncTrainingOverlay(match);
  updateFightOverlay(match);
  updateMatchClock(match);
  syncGamepadCursor(match);
}

/** Instruktionsknappen och karaktarsvaljaren hor bara till traningsvyn. */
function syncTrainingOverlay(match = net.match) {
  const show = currentView === 'game' && isTrainingMatch(match);
  if (gameInstructionsBtn) gameInstructionsBtn.hidden = !show;
  // Karaktarsvaljaren tar scoreboardens plats - poangen sager anda ingenting
  // nar motstandet ar en docka som inte slass tillbaka.
  if (scoreboard) scoreboard.hidden = show;
  if (!trainingSwitch) return;

  trainingSwitch.hidden = !show;
  if (!show) return;

  const myTeam = net.selfTeam;
  for (const btn of trainingSwitch.querySelectorAll('[data-training-character]')) {
    const on = btn.dataset.trainingCharacter === myTeam;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.disabled = on;
  }
}

function syncGamepadCursor(match = net.match) {
  const gameInputOwnsPad = currentView === 'game' && match?.phase === MATCH_PHASES.playing && net.localPlayerIds().length;
  gamepadCursor.setEnabled(!gameInputOwnsPad);
}

function sharedCanStartMatch(match, seats = sharedSeatsFor(match)) {
  if (!isSharedScreenMatch(match)) return false;
  return seats.length >= 2 && seats.every((seat) => !!seat.character);
}

function sharedStartTitle(match, seats = sharedSeatsFor(match)) {
  if (sharedCanStartMatch(match, seats)) return '';
  if (seats.length < 2) return 'Wake at least one gamepad so shared screen has two local players.';

  const missing = seats.filter((seat) => !seat.character).map((seat) => seat.id);
  if (missing.length) return `${missing.join(', ')} must pick a fighter first.`;
  return 'Every local player must pick a fighter first.';
}

function syncSharedSeatScanner(match = net.match) {
  if (canUseSharedSeatScanner(match)) startSharedSeatScanner();
  else stopSharedSeatScanner();
}

function canUseSharedSeatScanner(match = net.match) {
  return (
    currentView === 'matchRoom' &&
    isSharedScreenMatch(match) &&
    [MATCH_PHASES.matchLobby, MATCH_PHASES.mapVote].includes(match?.phase) &&
    currentMatchPlayer(match)?.id === match.hostId &&
    !!navigator.getGamepads
  );
}

function startSharedSeatScanner() {
  if (sharedSeatInput.frame || !navigator.getGamepads) return;
  sharedSeatInput.frame = requestAnimationFrame(pollSharedSeatGamepads);
}

function stopSharedSeatScanner() {
  if (sharedSeatInput.frame) cancelAnimationFrame(sharedSeatInput.frame);
  sharedSeatInput.frame = 0;
  sharedSeatInput.pads.clear();
  sharedSeatInput.pendingGamepads.clear();
  sharedSeatInput.pendingConnections.clear();
}

function pollSharedSeatGamepads() {
  sharedSeatInput.frame = 0;
  const match = net.match;
  if (!canUseSharedSeatScanner(match)) {
    stopSharedSeatScanner();
    return;
  }

  const seen = new Set();
  const pads = [...(navigator.getGamepads?.() ?? [])];
  for (const [fallbackIndex, pad] of pads.entries()) {
    if (!pad?.connected) continue;
    const index = Number.isInteger(pad.index) ? pad.index : fallbackIndex;
    seen.add(index);
    syncSharedSeatGamepad(match, pad, index);
  }

  for (const index of [...sharedSeatInput.pads.keys()]) {
    if (seen.has(index)) continue;
    const seat = localSeatForGamepad(match, index);
    if (seat && seat.connected !== false && match.phase === MATCH_PHASES.matchLobby) {
      net.setLocalSeatConnected({ type: 'gamepad', index }, false);
    }
    sharedSeatInput.pads.delete(index);
    sharedSeatInput.pendingGamepads.delete(index);
    sharedSeatInput.pendingConnections.delete(index);
  }

  startSharedSeatScanner();
}

function syncSharedSeatGamepad(match, gamepad, index) {
  const previous = sharedSeatInput.pads.get(index) ?? {
    buttons: new Set(),
    xDir: 0,
    yDir: 0,
    wakeX: 0,
    wakeY: 0,
  };
  const buttons = pressedPadButtons(gamepad);
  const xDir = padDirection(gamepad, 0, 14, 15, SHARED_PAD_DEADZONE);
  const yDir = padDirection(gamepad, 1, 12, 13, SHARED_PAD_DEADZONE);
  const wakeX = axisDirection(axis(gamepad, 0), SHARED_PAD_WAKE_DEADZONE);
  const wakeY = axisDirection(axis(gamepad, 1), SHARED_PAD_WAKE_DEADZONE);
  const seat = localSeatForGamepad(match, index);

  if (match.phase === MATCH_PHASES.mapVote) {
    if (seat) syncSharedSeatMapVoteGamepad(match, seat, buttons, previous, xDir || yDir);
    sharedSeatInput.pads.set(index, { buttons, xDir, yDir, wakeX, wakeY });
    return;
  }

  if (!seat) {
    const wakeButton = [...SHARED_WAKE_BUTTONS].some((buttonIndex) => buttons.has(buttonIndex) && !previous.buttons.has(buttonIndex));
    const wakeAxis = (wakeX && !previous.wakeX) || (wakeY && !previous.wakeY);
    if ((wakeButton || wakeAxis) && !sharedSeatInput.pendingGamepads.has(index)) {
      sharedSeatInput.pendingGamepads.add(index);
      net.wakeLocalSeat({ type: 'gamepad', index, label: gamepad.id ?? '' });
    }
  } else {
    sharedSeatInput.pendingGamepads.delete(index);
    if (seat.connected === false && !sharedSeatInput.pendingConnections.has(index)) {
      sharedSeatInput.pendingConnections.add(index);
      net.setLocalSeatConnected({ type: 'gamepad', index, label: gamepad.id ?? '' }, true);
    } else if (seat.connected !== false) {
      sharedSeatInput.pendingConnections.delete(index);
    }
    const navDir = xDir || yDir;
    const previousNavDir = previous.xDir || previous.yDir;
    if (navDir && navDir !== previousNavDir) moveSeatCursor(seat.id, navDir);
    if (buttons.has(SHARED_CONFIRM_BUTTON) && !previous.buttons.has(SHARED_CONFIRM_BUTTON)) {
      net.setLocalSeatCharacter(seat.id, characterAtSeatCursor(seat));
    }
    if (buttons.has(SHARED_CANCEL_BUTTON) && !previous.buttons.has(SHARED_CANCEL_BUTTON)) {
      if (seat.character) net.setLocalSeatCharacter(seat.id, null);
      else if (seat.id !== HOST_SEAT_ID) net.removeLocalSeat(seat.id);
    }
  }

  sharedSeatInput.pads.set(index, { buttons, xDir, yDir, wakeX, wakeY });
}

function syncSharedSeatMapVoteGamepad(match, seat, buttons, previous, navDir) {
  const previousNavDir = previous.xDir || previous.yDir;
  if (navDir && navDir !== previousNavDir) moveSeatMapCursor(seat.id, navDir, match);

  if (buttons.has(SHARED_CONFIRM_BUTTON) && !previous.buttons.has(SHARED_CONFIRM_BUTTON)) {
    const map = mapAtSeatCursor(seat, match.mapVotes?.length ? match.mapVotes : match.maps ?? []);
    if (map?.id) net.voteLocalSeatMap(seat.id, map.id);
  }
}

function renderCharacterSeatMarkers(match = net.match) {
  if (!characterSelect) return;
  for (const btn of characterSelect.querySelectorAll('[data-character]')) {
    btn.classList.remove('has-seat-markers');
    const markerWrap = btn.querySelector('.seat-markers');
    if (markerWrap) markerWrap.innerHTML = '';
  }

  if (!isSharedScreenMatch(match)) {
    sharedSeatInput.cursorBySeat.clear();
    return;
  }

  const seats = sharedSeatsFor(match);
  const activeSeatIds = new Set(seats.map((seat) => seat.id));
  for (const seatId of [...sharedSeatInput.cursorBySeat.keys()]) {
    if (!activeSeatIds.has(seatId)) sharedSeatInput.cursorBySeat.delete(seatId);
  }

  for (const seat of seats) {
    const character = seat.character || characterAtSeatCursor(seat);
    const btn = characterSelect.querySelector(`[data-character="${character}"]`);
    const markerWrap = btn?.querySelector('.seat-markers');
    if (!btn || !markerWrap) continue;

    const marker = document.createElement('span');
    marker.className = `seat-marker ${seat.character ? 'picked' : 'cursor'}`;
    marker.textContent = seat.id;
    marker.title = `${seat.id} ${seat.character ? 'picked' : 'selecting'} ${characterLabel(character)}`;
    marker.style.setProperty('--seat-accent', characterColor(character));
    markerWrap.appendChild(marker);
    btn.classList.add('has-seat-markers');
  }
}

function pressedPadButtons(gamepad) {
  const buttons = new Set();
  for (let i = 0; i < (gamepad.buttons?.length ?? 0); i++) {
    if (padButton(gamepad, i)) buttons.add(i);
  }
  return buttons;
}

function padButton(gamepad, index) {
  const btn = gamepad?.buttons?.[index];
  return !!btn && (btn.pressed || btn.value > SHARED_PAD_BUTTON_DEADZONE);
}

function padDirection(gamepad, axisIndex, negativeButton, positiveButton, deadzone) {
  if (padButton(gamepad, negativeButton)) return -1;
  if (padButton(gamepad, positiveButton)) return 1;
  return axisDirection(axis(gamepad, axisIndex), deadzone);
}

function axisDirection(value, deadzone) {
  if (value < -deadzone) return -1;
  if (value > deadzone) return 1;
  return 0;
}

function axis(gamepad, index) {
  const value = Number(gamepad?.axes?.[index]);
  return Number.isFinite(value) ? value : 0;
}

function moveSeatCursor(seatId, dir) {
  const current = sharedSeatInput.cursorBySeat.get(seatId) ?? defaultSeatCursor(seatId);
  const next = (current + (dir > 0 ? 1 : -1) + CHARACTER_IDS.length) % CHARACTER_IDS.length;
  sharedSeatInput.cursorBySeat.set(seatId, next);
  renderCharacterSeatMarkers(net.match);
}

function characterAtSeatCursor(seat) {
  const selectedIndex = CHARACTER_IDS.indexOf(seat?.character);
  if (selectedIndex >= 0) {
    sharedSeatInput.cursorBySeat.set(seat.id, selectedIndex);
    return CHARACTER_IDS[selectedIndex];
  }

  if (!sharedSeatInput.cursorBySeat.has(seat?.id)) {
    sharedSeatInput.cursorBySeat.set(seat.id, defaultSeatCursor(seat?.id));
  }
  return CHARACTER_IDS[sharedSeatInput.cursorBySeat.get(seat.id)] ?? CHARACTER_IDS[0];
}

function defaultSeatCursor(seatId) {
  const n = Math.max(1, Number(String(seatId ?? '').replace(/\D/g, '')) || 1);
  return n % 2 === 0 ? 1 : 0;
}

function moveSeatMapCursor(seatId, dir, match = net.match) {
  const maps = match?.mapVotes?.length ? match.mapVotes : match?.maps ?? [];
  if (!maps.length) return;
  const current = sharedSeatInput.mapCursorBySeat.get(seatId) ?? defaultMapCursor(seatId, maps);
  const next = (current + (dir > 0 ? 1 : -1) + maps.length) % maps.length;
  sharedSeatInput.mapCursorBySeat.set(seatId, next);
  renderMapVote(match);
}

function mapAtSeatCursor(seat, maps) {
  if (!maps.length) return null;
  const votedIndex = maps.findIndex((map) => map.id === seat?.mapVote);
  if (votedIndex >= 0) {
    sharedSeatInput.mapCursorBySeat.set(seat.id, votedIndex);
    return maps[votedIndex];
  }

  if (!sharedSeatInput.mapCursorBySeat.has(seat?.id)) {
    sharedSeatInput.mapCursorBySeat.set(seat.id, defaultMapCursor(seat?.id, maps));
  }
  return maps[sharedSeatInput.mapCursorBySeat.get(seat.id)] ?? maps[0];
}

function defaultMapCursor(seatId, maps) {
  const n = Math.max(1, Number(String(seatId ?? '').replace(/\D/g, '')) || 1);
  return maps.length ? (n - 1) % maps.length : 0;
}

function renderMapVote(match) {
  if (!mapVote || !mapVoteList) return;
  const voting = match.phase === MATCH_PHASES.mapVote;
  mapVote.hidden = !voting;
  if (!voting) {
    mapVoteList.innerHTML = '';
    return;
  }

  const training = isTrainingMatch(match);
  mapVote.dataset.mode = training ? MATCH_MODES.training : '';
  if (mapVoteClock) mapVoteClock.hidden = training;
  if (mapVoteFoot) mapVoteFoot.hidden = training;
  if (mapVoteStep) mapVoteStep.textContent = training ? 'Training - pick a map' : 'Step 05 - Vote now';
  if (mapVoteTitle) mapVoteTitle.textContent = training ? 'Choose your practice arena' : 'Choose the arena';
  if (!training) updateMapVoteTimer(match);
  const maps = match.mapVotes?.length ? match.mapVotes : match.maps ?? [];
  const sharedScreen = isSharedScreenMatch(match);
  const seats = sharedScreen ? sharedSeatsFor(match) : [];
  const myVote = sharedScreen ? localSeatById(match, HOST_SEAT_ID)?.mapVote ?? null : currentMatchPlayer(match)?.mapVote ?? null;
  if (mapLockBtn) mapLockBtn.disabled = !maps.length;

  mapVoteList.innerHTML = maps
    .map((map, index) => {
      const voters = map.voters ?? [];
      const cursorSeats = sharedScreen
        ? seats.filter((seat) => !seat.mapVote && mapAtSeatCursor(seat, maps)?.id === map.id)
        : [];
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
                  `<span class="vote-pill ${escapeHtml(voter.character ?? '')}" title="${escapeHtml(voter.n)}">${escapeHtml(voter.seatId ?? initials(voter.n))}</span>`,
              )
              .join('')}
            ${cursorSeats
              .map(
                (seat) =>
                  `<span class="vote-pill cursor ${escapeHtml(seat.character ?? '')}" title="${escapeHtml(`${seat.id} selecting`)}">${escapeHtml(seat.id)}</span>`,
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
  const resultRoster = isSharedScreenMatch(match)
    ? sharedSeatsFor(match).map((seat) => ({ character: seat.character, n: seat.name ?? seat.id }))
    : match.players;
  const mvp = resultRoster.find((player) => player.character === winner)?.n ?? match.hostName ?? currentName;

  roundResults.style.setProperty('--winner-bg', winner ? `${winnerColor}0.14)` : 'rgba(255,209,102,0.14)');
  roundResults.style.setProperty('--winner-border', winner ? `${winnerColor}0.4)` : 'rgba(255,209,102,0.42)');
  roundResultScore.innerHTML = `
    <span class="result-side cleo"><span>Cleo</span><strong>${cleo}</strong></span>
    <span class="result-vs"><span>VS</span></span>
    <span class="result-side viking"><span>Viking</span><strong>${viking}</strong></span>`;
  if (match.resultCounts === false) {
    roundResultNote.textContent = unrankedResultLabel(match.unrankedReason);
  } else {
    roundResultNote.innerHTML = `${escapeHtml(resultLabel(cleo, viking))} - MVP <b>${escapeHtml(mvp || 'Host')}</b>`;
  }
  if (viewAchievementsResultBtn) viewAchievementsResultBtn.hidden = match.statsEnabled === false;
  achievementsUi.renderSummary(match);
  roundResults.classList.remove('vvc-enter');
  void roundResults.offsetWidth;
  roundResults.classList.add('vvc-enter');
}

function updatePhaseTimers() {
  const match = net.match;
  if (match?.phase === MATCH_PHASES.mapVote && !isTrainingMatch(match)) updateMapVoteTimer(match);
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

  if (match?.phase === MATCH_PHASES.countdown && !isTrainingMatch(match)) {
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

  const live =
    (match?.phase === MATCH_PHASES.countdown || match?.phase === MATCH_PHASES.playing) && !isTrainingMatch(match);
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

function initNetDebug(enabled = false) {
  const el = document.createElement('div');
  el.id = 'net-debug';
  el.hidden = true;
  document.body.appendChild(el);

  const api = {
    enabled: false,
    lastUpdate: 0,
    lastLogAt: 0,
    rows: [],
    droppedRows: 0,
    lastExportName: '',
    statusText: '',
    set(on) {
      this.enabled = !!on;
      el.hidden = !this.enabled;
      localStorage.setItem('vvc.netDebug', this.enabled ? '1' : '0');
      this.logEvent(this.enabled ? 'enabled' : 'disabled');
      if (this.enabled) this.sample(performance.now());
      if (this.enabled) this.update(performance.now(), true);
    },
    toggle() {
      this.set(!this.enabled);
    },
    sample(now = performance.now()) {
      const metrics = net.metricsSnapshot();
      this.lastLogAt = now;
      this.append({
        type: 'sample',
        ts: new Date().toISOString(),
        perfMs: Math.round(now),
        view: currentView,
        match: netLogMatchContext(),
        metrics: netLogMetrics(metrics),
      });
      return metrics;
    },
    logEvent(event, extra = {}) {
      this.append({
        type: 'event',
        event,
        ts: new Date().toISOString(),
        perfMs: Math.round(performance.now()),
        view: currentView,
        match: netLogMatchContext(),
        ...extra,
      });
    },
    append(row) {
      this.rows.push(row);
      while (this.rows.length > NET_LOG_MAX_ROWS) {
        this.rows.shift();
        this.droppedRows++;
      }
    },
    download() {
      if (this.enabled) this.sample(performance.now());
      const exportedAt = new Date();
      const meta = {
        type: 'meta',
        version: NET_LOG_VERSION,
        exportedAt: exportedAt.toISOString(),
        page: location.href,
        userAgent: navigator.userAgent,
        droppedRows: this.droppedRows,
        rowCount: this.rows.length,
        sampleMs: NET_LOG_SAMPLE_MS,
      };
      const text = `${[meta, ...this.rows].map((row) => JSON.stringify(row)).join('\n')}\n`;
      const filename = netLogFilename(exportedAt);
      downloadTextFile(filename, text, 'application/x-ndjson');
      this.lastExportName = filename;
      this.statusText = `saved ${formatDebugTime(exportedAt)}`;
      this.update(performance.now(), true);
      return { filename, rows: this.rows.length, bytes: text.length };
    },
    clear() {
      this.rows = [];
      this.droppedRows = 0;
      this.statusText = 'cleared';
      this.update(performance.now(), true);
    },
    update(now, force = false) {
      if (this.enabled && now - this.lastLogAt >= NET_LOG_SAMPLE_MS) this.sample(now);
      if (!this.enabled || (!force && now - this.lastUpdate < 250)) return;
      this.lastUpdate = now;
      renderNetDebug(el, net.metricsSnapshot(), this);
    },
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F8' && (e.ctrlKey || e.shiftKey)) {
      e.preventDefault();
      api.toggle();
    } else if (e.key === 'F9' && (e.ctrlKey || e.shiftKey)) {
      e.preventDefault();
      api.download();
    }
  });

  api.set(enabled);
  return api;
}

function renderNetDebug(el, m, log) {
  el.innerHTML = `
    <div class="net-debug-head">
      <span>NET</span>
      <b class="${m.connected ? 'ok' : 'bad'}">${m.connected ? 'online' : 'offline'}</b>
    </div>
    <div class="net-debug-grid">
      <span>RTT</span><b>${fmtMs(m.rttMs)} <small>last ${fmtMs(m.rttLastMs)}</small></b>
      <span>jitter</span><b>${fmtMs(m.rttJitterMs)}</b>
      <span>state</span><b>${fmtHz(m.stateHz)} <small>${fmtMs(m.stateIntervalMs)} gap</small></b>
      <span>state size</span><b>${fmtBytes(m.stateBytesAvg)} <small>last ${fmtBytes(m.stateBytesLast)}</small></b>
      <span>down</span><b>${fmtKbps(m.inKbps)} <small>${fmtRate(m.inMsgPs)} msg/s</small></b>
      <span>up</span><b>${fmtKbps(m.outKbps)} <small>${fmtRate(m.outMsgPs)} msg/s</small></b>
      <span>buffer</span><b>${fmtMs(m.bufferMs)} <small>${m.bufferFrames} frames</small></b>
      <span>ticks</span><b>${m.tick ?? '-'} <small>miss ${m.tickGaps}</small></b>
      <span>input-FX</span><b>${fmtMs(m.localFxDelayMs)} <small>last ${fmtMs(m.localFxDelayLastMs)}</small></b>
      <span>log</span><b>${log.rows.length} rows <small>${escapeHtml(log.statusText || 'ready')}</small></b>
    </div>
  `;
}

function netLogMatchContext() {
  const match = net.match;
  return {
    id: match?.id ?? null,
    phase: match?.phase ?? null,
    mode: match?.mode ?? null,
    sharedScreen: !!match?.sharedScreen,
    playerCount: match?.playerCount ?? match?.players?.length ?? null,
    localPlayerIds: net.localPlayerIds(),
  };
}

function netLogMetrics(m) {
  return {
    connected: m.connected,
    interpMs: roundMetric(m.interpMs),
    serverOffsetMs: roundMetric(m.serverOffsetMs),
    rttMs: roundMetric(m.rttMs),
    rttLastMs: roundMetric(m.rttLastMs),
    rttJitterMs: roundMetric(m.rttJitterMs),
    pingLost: m.pingLost,
    inKbps: roundMetric(m.inKbps),
    outKbps: roundMetric(m.outKbps),
    inMsgPs: roundMetric(m.inMsgPs),
    outMsgPs: roundMetric(m.outMsgPs),
    stateHz: roundMetric(m.stateHz),
    stateBytesAvg: roundMetric(m.stateBytesAvg),
    stateBytesLast: m.stateBytesLast,
    stateIntervalMs: roundMetric(m.stateIntervalMs),
    stateJitterMs: roundMetric(m.stateJitterMs),
    tick: m.tick,
    tickGaps: m.tickGaps,
    outOfOrderStates: m.outOfOrderStates,
    bufferMs: roundMetric(m.bufferMs),
    bufferFrames: m.bufferFrames,
    localFxDelayMs: roundMetric(m.localFxDelayMs),
    localFxDelayLastMs: roundMetric(m.localFxDelayLastMs),
    localFxDelayWindowMs: roundMetric(m.localFxDelayWindowMs),
    localFxSamples: m.localFxSamples,
    totals: m.totals,
    types: m.types,
  };
}

function roundMetric(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function netLogFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `vvc-netlog-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}.jsonl`;
}

function downloadTextFile(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDebugTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function fmtMs(value) {
  return value > 0 ? `${Math.round(value)}ms` : '-';
}

function fmtHz(value) {
  return value > 0 ? `${value.toFixed(1)}Hz` : '-';
}

function fmtRate(value) {
  return value > 0 ? value.toFixed(1) : '-';
}

function fmtKbps(value) {
  if (value <= 0) return '-';
  return value >= 1000 ? `${(value / 1000).toFixed(2)}Mbps` : `${Math.round(value)}kbps`;
}

function fmtBytes(value) {
  if (value <= 0) return '-';
  return value >= 1024 ? `${(value / 1024).toFixed(1)}KB` : `${Math.round(value)}B`;
}

function initMenuClicks() {
  document.addEventListener(
    'click',
    (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.disabled) return;
      if (!btn.closest('.app-view, #overlay')) return;
      audio.playMenuClick();
    },
    true,
  );
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

function sharedSeatsFor(match = net.match) {
  const seats = match?.localSeats ?? match?.seats ?? [];
  return [...seats].sort((a, b) => seatSortIndex(a.id) - seatSortIndex(b.id));
}

function seatSortIndex(seatId) {
  const index = LOCAL_SEAT_IDS.indexOf(seatId);
  return index < 0 ? LOCAL_SEAT_IDS.length : index;
}

function localSeatById(match, seatId) {
  return sharedSeatsFor(match).find((seat) => seat.id === seatId) ?? null;
}

function localSeatForGamepad(match, index) {
  const wanted = Number(index);
  return (
    sharedSeatsFor(match).find((seat) => seat.inputDevice?.type === 'gamepad' && Number(seat.inputDevice.index) === wanted) ?? null
  );
}

function isTrainingMatch(match) {
  return match?.mode === MATCH_MODES.training;
}

function isSharedScreenMatch(match) {
  return !!match?.sharedScreen || match?.mode === MATCH_MODES.sharedScreen;
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

function localSeatStatus(seat, match) {
  const character = characterLabel(seat.character);
  if (match.phase === MATCH_PHASES.matchLobby) return seat.character ? `${character} - local` : 'Choose a fighter';
  if (match.phase === MATCH_PHASES.mapVote) return `${character} - ${mapName(match, seat.mapVote) || 'no vote'}`;
  if (match.phase === MATCH_PHASES.results) return `${character} - ready for next round`;
  return character;
}

function localSeatInputLabel(seat) {
  const offline = seat.connected === false ? ' offline' : '';
  if (seat.inputDevice?.type === 'keyboard') return `keyboard${offline}`;
  if (seat.inputDevice?.type === 'gamepad') return `Pad ${Number(seat.inputDevice.index) + 1}${offline}`;
  return '';
}

function resultLabel(cleo, viking) {
  if (cleo === viking) return 'Draw round';
  return cleo > viking ? 'Team Cleo takes the round' : 'Team Viking takes the round';
}

function unrankedResultLabel(reason) {
  if (reason === 'sharedScreen') return 'Shared screen - no stats recorded';
  if (reason === 'soloTimeUp') return 'Unranked solo timeout - no win rate or faction points';
  return 'Unranked round - no win rate or faction points';
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

window.vvc = { net, renderer, hud, audio, netDebug };

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
