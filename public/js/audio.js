import { ABILITY_TUNING, PLAYER, WORLD } from '/shared/constants.js';

const ROOM = {
  impulseSeconds: 0.82,
  decay: 2.45,
  preDelayMs: 16,
  wetGain: 0.24,
  dampingHz: 6800,
  impulseGain: 0.24,
};

const DEFAULT_ROOM_SEND = 0.08;
const DEFAULT_DISTANCE_ROOM_SEND = 0.06;
const DEFAULT_MUSIC = {
  volume: 0.58,
  fadeInMs: 900,
  fadeOutMs: 700,
};

const SOUNDS = {
  sunFireChannel: {
    urls: ['/assets/audio/cleo/cleo_sunfire_channeling.ogg'],
    volume: 0.34,
    loop: true,
    fadeInMs: 90,
    fadeOutMs: 130,
    rate: [0.98, 1.02],
    spatial: true,
    maxDistance: 1200,
    panDistance: 680,
    room: 0.09,
  },
  sunFireRelease: {
    urls: ['/assets/audio/cleo/cleo_sunfire_release.ogg'],
    volume: 0.72,
    cooldownMs: 70,
    rate: [0.96, 1.04],
    spatial: true,
    maxDistance: 1300,
    panDistance: 760,
    strengthGain: 0.28,
    room: 0.13,
  },
  sunFireHit: {
    urls: ['/assets/audio/cleo/cleo_sunfire_hit.ogg'],
    volume: 0.86,
    cooldownMs: 90,
    rate: [0.95, 1.06],
    spatial: true,
    maxDistance: 1450,
    panDistance: 820,
    strengthGain: 0.38,
    room: 0.15,
  },
  cleoSandBlast: {
    urls: ['/assets/audio/cleo/cleo_sand_blast.ogg'],
    volume: 0.72,
    cooldownMs: 70,
    rate: [0.97, 1.04],
    spatial: true,
    maxDistance: 1250,
    panDistance: 720,
    room: 0.13,
  },
  cleoBlink: {
    urls: ['/assets/audio/cleo/cleo_blink.ogg'],
    volume: 0.66,
    cooldownMs: 60,
    rate: [0.98, 1.03],
    spatial: true,
    maxDistance: 1200,
    panDistance: 700,
    room: 0.14,
  },
  cleoShield: {
    urls: ['/assets/audio/cleo/cleo_shield.ogg'],
    volume: 0.68,
    cooldownMs: 80,
    rate: [0.98, 1.03],
    spatial: true,
    maxDistance: 1150,
    panDistance: 680,
    room: 0.12,
  },
  cleoMelee: {
    urls: [
      '/assets/audio/cleo/cleo_melee_01.ogg',
      '/assets/audio/cleo/cleo_melee_02.ogg',
      '/assets/audio/cleo/cleo_melee_03.ogg',
    ],
    volume: 0.66,
    cooldownMs: 35,
    rate: [0.98, 1.04],
    lowpassHz: 4500,
    lowpassQ: 0.55,
    spatial: true,
    maxDistance: 1000,
    panDistance: 620,
    room: 0.09,
    distanceRoom: 0.035,
    interruptGroup: 'cleoMelee',
    interruptFadeMs: 12,
  },
  cleoMeleeComboEnd: {
    urls: ['/assets/audio/cleo/cleo_melee_end_combo.ogg'],
    volume: 0.82,
    cooldownMs: 80,
    rate: [0.98, 1.03],
    lowpassHz: 5200,
    lowpassQ: 0.55,
    spatial: true,
    maxDistance: 1250,
    panDistance: 720,
    room: 0.11,
    distanceRoom: 0.035,
    interruptGroup: 'cleoMelee',
    interruptFadeMs: 12,
  },
  vikingAxeFlying: {
    urls: ['/assets/audio/viking/viking_axe_throw_flying.ogg'],
    volume: 0.44,
    loop: true,
    fadeInMs: 25,
    fadeOutMs: 0,
    stopAfterMs: 1250,
    rate: [0.98, 1.02],
    spatial: true,
    maxDistance: 1300,
    panDistance: 760,
    room: 0.08,
  },
  vikingAxeHit: {
    urls: ['/assets/audio/viking/viking_axe_throw_hit.ogg'],
    volume: 0.78,
    cooldownMs: 45,
    rate: [0.97, 1.05],
    lowpassHz: 5200,
    lowpassQ: 0.55,
    spatial: true,
    maxDistance: 1350,
    panDistance: 780,
    room: 0.15,
  },
  vikingMeleeAxe1: {
    urls: ['/assets/audio/viking/viking_melee_axe_01.ogg'],
    volume: 0.62,
    cooldownMs: 35,
    rate: [0.995, 1.01],
    lowpassHz: 4300,
    lowpassQ: 0.55,
    spatial: true,
    maxDistance: 1000,
    panDistance: 620,
    room: 0.09,
    distanceRoom: 0.035,
    interruptGroup: 'vikingMelee',
    interruptFadeMs: 12,
  },
  vikingMeleeAxe2: {
    urls: ['/assets/audio/viking/viking_melee_axe_02.ogg'],
    volume: 0.66,
    cooldownMs: 35,
    rate: [0.995, 1.01],
    lowpassHz: 4300,
    lowpassQ: 0.55,
    spatial: true,
    maxDistance: 1000,
    panDistance: 620,
    room: 0.09,
    distanceRoom: 0.035,
    interruptGroup: 'vikingMelee',
    interruptFadeMs: 12,
  },
  vikingMeleeAxe3: {
    urls: ['/assets/audio/viking/viking_melee_axe_03.ogg'],
    volume: 0.7,
    cooldownMs: 35,
    rate: [0.995, 1.01],
    lowpassHz: 4300,
    lowpassQ: 0.55,
    spatial: true,
    maxDistance: 1000,
    panDistance: 620,
    room: 0.09,
    distanceRoom: 0.035,
    interruptGroup: 'vikingMelee',
    interruptFadeMs: 12,
  },
  vikingMeleeShield: {
    urls: ['/assets/audio/viking/viking_melee_shield_01.ogg'],
    volume: 0.68,
    cooldownMs: 35,
    rate: [0.995, 1.01],
    lowpassHz: 4000,
    lowpassQ: 0.5,
    spatial: true,
    maxDistance: 1000,
    panDistance: 620,
    room: 0.09,
    distanceRoom: 0.035,
    interruptGroup: 'vikingMelee',
    interruptFadeMs: 12,
  },
  vikingMeleeComboEnd: {
    urls: ['/assets/audio/viking/viking_melee_combo_end.ogg'],
    volume: 0.84,
    cooldownMs: 80,
    rate: [0.995, 1.01],
    lowpassHz: 5000,
    lowpassQ: 0.55,
    spatial: true,
    maxDistance: 1250,
    panDistance: 720,
    room: 0.11,
    distanceRoom: 0.035,
    interruptGroup: 'vikingMelee',
    interruptFadeMs: 12,
  },
  vikingShieldChargeHit: {
    urls: ['/assets/audio/viking/viking_shield_charge.ogg'],
    volume: 0.78,
    cooldownMs: 80,
    rate: [0.97, 1.04],
    lowpassHz: 4800,
    lowpassQ: 0.5,
    spatial: true,
    maxDistance: 1200,
    panDistance: 700,
    room: 0.15,
  },
  menuTransition: {
    urls: ['/assets/audio/menu/menu_transition_effect.ogg'],
    volume: 0.52,
    cooldownMs: 180,
    rate: [0.99, 1.01],
    room: 0,
    channel: 'ui',
  },
  menuClick: {
    urls: ['/assets/audio/menu/menu_click.ogg'],
    volume: 0.42,
    cooldownMs: 40,
    rate: [0.98, 1.03],
    room: 0,
    channel: 'ui',
  },
  chooseYourFighter: {
    urls: ['/assets/audio/menu/Choose_your_fighter.ogg'],
    volume: 0.78,
    cooldownMs: 900,
    rate: [0.995, 1.005],
    room: 0,
    channel: 'voice',
    interruptGroup: 'menuPrompt',
    interruptFadeMs: 90,
  },
  selectTheArena: {
    urls: ['/assets/audio/menu/select_the_arena.ogg'],
    volume: 0.78,
    cooldownMs: 900,
    rate: [0.995, 1.005],
    room: 0,
    channel: 'voice',
    interruptGroup: 'menuPrompt',
    interruptFadeMs: 90,
  },
};

const FX_SOUND = {
  sun_fire_channel: 'sunFireChannel',
  sun_fire_release: 'sunFireRelease',
  sun_fire_hit: 'sunFireHit',
  sand_blast: 'cleoSandBlast',
  blink: 'cleoBlink',
  power_shield: 'cleoShield',
};

// Mixern: en buss per kanal, alla under mastern. Varje ljud sager sjalvt vilken
// buss det hor hemma i (sound.channel) - sager det inget hamnar det i sfx.
// Musiken gar alltid i sin egen. Standardnivaerna kommer ur designdokumentet.
const CHANNELS = {
  music: { def: 0.7, key: 'vvc.audio.music', preview: null },
  sfx: { def: 0.85, key: 'vvc.audio.sfx', preview: 'cleoSandBlast' },
  voice: { def: 0.8, key: 'vvc.audio.voice', preview: null },
  ambience: { def: 0.55, key: 'vvc.audio.ambience', preview: null },
  ui: { def: 0.6, key: 'vvc.audio.ui', preview: 'menuClick' },
};

const CHANNEL_IDS = Object.keys(CHANNELS);
const DEFAULT_CHANNEL = 'sfx';
const MASTER_DEFAULT = 0.9;

// Kanaler utan eget ljud far en kort ton genom sin buss i stallet, sa att
// testknappen anda visar vad reglaget gor.
const PREVIEW_TONE = { hz: 620, toHz: 880, seconds: 0.28, volume: 0.5 };

const STORAGE = {
  master: 'vvc.audio.master',
  muted: 'vvc.audio.muted',
  channelMuted: (id) => `vvc.audio.muted.${id}`,
};

export class AudioManager {
  constructor({ getListener = null } = {}) {
    this.getListener = getListener;
    this.ctx = null;
    this.master = null;
    this.buses = {};
    this.sfxBus = null;
    this.musicBus = null;
    this.roomInput = null;
    this.roomPreDelay = null;
    this.roomReverb = null;
    this.roomTone = null;
    this.roomWet = null;
    this.unlocked = false;
    this.unlockPromise = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.lastPlayed = new Map();
    this.activeLoops = new Map();
    this.oneShots = new Set();
    this.oneShotGroups = new Map();
    this.htmlOneShots = new Set();
    this.htmlOneShotGroups = new Map();
    this.music = null;
    this.desiredMusic = null;
    this.musicStartingId = '';
    this.musicPositions = new Map();
    this.lastError = '';
    this.masterVolume = readNumber(STORAGE.master, MASTER_DEFAULT);
    this.muted = readBool(STORAGE.muted, false);
    this.channelVolume = {};
    this.channelMuted = {};
    for (const id of CHANNEL_IDS) {
      this.channelVolume[id] = readNumber(CHANNELS[id].key, CHANNELS[id].def);
      this.channelMuted[id] = readBool(STORAGE.channelMuted(id), false);
    }

    this.unlockFromGesture = this.unlockFromGesture.bind(this);
    this.installUnlockers();
  }

  installUnlockers() {
    window.addEventListener('pointerdown', this.unlockFromGesture, { passive: true });
    window.addEventListener('keydown', this.unlockFromGesture);
    window.addEventListener('touchstart', this.unlockFromGesture, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopAllLoops({ keepMusicIntent: true, immediateMusic: true });
      else this.resumeDesiredMusic();
    });
  }

  removeUnlockers() {
    window.removeEventListener('pointerdown', this.unlockFromGesture);
    window.removeEventListener('keydown', this.unlockFromGesture);
    window.removeEventListener('touchstart', this.unlockFromGesture);
  }

  unlockFromGesture() {
    this.prime().then(() => this.resumeDesiredMusic());
  }

  async prime() {
    if (this.unlocked) return true;
    if (this.unlockPromise) return this.unlockPromise;

    this.unlockPromise = this.resumeContext()
      .then((ok) => {
        if (ok) {
          this.removeUnlockers();
          for (const sound of Object.values(SOUNDS)) {
            for (const url of sound.urls) this.loadBuffer(url);
          }
          this.resumeDesiredMusic();
        }
        return ok;
      })
      .finally(() => {
        this.unlockPromise = null;
      });

    return this.unlockPromise;
  }

  async resumeContext() {
    const ctx = this.ensureContext();
    if (!ctx) return false;

    try {
      if (ctx.state !== 'running') await ctx.resume();
      this.unlocked = ctx.state === 'running';
      if (this.unlocked) this.playSilentUnlockTick();
      return this.unlocked;
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      console.warn('Could not unlock game audio:', err);
      return false;
    }
  }

  ensureContext() {
    if (this.ctx) return this.ctx;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);

    for (const id of CHANNEL_IDS) {
      const bus = this.ctx.createGain();
      bus.connect(this.master);
      this.buses[id] = bus;
    }
    this.sfxBus = this.buses.sfx;
    this.musicBus = this.buses.music;

    this.setupRoomBus();
    this.applyVolumes(true);
    return this.ctx;
  }

  setupRoomBus() {
    if (!this.ctx || !this.sfxBus) return;

    try {
      this.roomInput = this.ctx.createGain();
      this.roomPreDelay = this.ctx.createDelay(0.08);
      this.roomReverb = this.ctx.createConvolver();
      this.roomTone = this.ctx.createBiquadFilter();
      this.roomWet = this.ctx.createGain();

      this.roomPreDelay.delayTime.value = msToSec(ROOM.preDelayMs);
      this.roomReverb.buffer = createRoomImpulse(this.ctx);
      this.roomTone.type = 'lowpass';
      this.roomTone.frequency.value = ROOM.dampingHz;
      this.roomTone.Q.value = 0.35;
      this.roomWet.gain.value = ROOM.wetGain;

      this.roomInput.connect(this.roomPreDelay);
      this.roomPreDelay.connect(this.roomReverb);
      this.roomReverb.connect(this.roomTone);
      this.roomTone.connect(this.roomWet);
      this.roomWet.connect(this.sfxBus);
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      console.warn('Could not set up room audio bus:', err);
      this.roomInput = null;
      this.roomPreDelay = null;
      this.roomReverb = null;
      this.roomTone = null;
      this.roomWet = null;
    }
  }

  playFx(fx) {
    if (!fx?.k) return;

    if (fx.k === 'sun_fire_release' && fx.id) this.stopLoop('sunFireChannel', fx.id);
    if (fx.k === 'axe_throw' && fx.team === 'viking') {
      this.startLoop('vikingAxeFlying', withAudioId(fx, fx.pr ?? fx.id));
      return;
    }
    if (fx.k === 'axe_hit' && fx.team === 'viking') {
      this.stopLoop('vikingAxeFlying', fx.pr ?? fx.by ?? fx.id);
      this.play('vikingAxeHit', fx);
      return;
    }
    if (fx.k === 'hit') {
      if (fx.cause === 'melee') {
        if (!fx.comboId) this.playMeleeHit(fx);
        return;
      }
      this.playVikingHit(fx);
      return;
    }
    if (fx.k === 'combo' && fx.team === 'viking') {
      this.play('vikingMeleeComboEnd', fx);
      return;
    }
    if (fx.k === 'combo' && fx.team === 'cleo') {
      this.play('cleoMeleeComboEnd', fx);
      return;
    }

    const name = FX_SOUND[fx.k];
    if (!name) return;

    const sound = SOUNDS[name];
    if (!sound) return;
    if (sound.loop) this.startLoop(name, fx);
    else this.play(name, fx);
  }

  playMenuTransition() {
    return this.play('menuTransition');
  }

  playMenuClick() {
    return this.play('menuClick');
  }

  playChooseYourFighter() {
    return this.play('chooseYourFighter');
  }

  playSelectTheArena() {
    return this.play('selectTheArena');
  }

  /** Bussen ett ljud ska spelas genom - sfx ar hemmaplanen for allt gameplay. */
  busFor(sound) {
    return this.buses[sound?.channel ?? DEFAULT_CHANNEL] ?? this.sfxBus;
  }

  playVikingHit(fx) {
    if (fx.team !== 'viking') return;

    if (fx.abilityId === 'shieldCharge') {
      this.play('vikingShieldChargeHit', fx);
    }
  }

  playMeleeHit(fx) {
    if (fx.team === 'viking') this.playVikingMeleeHit(fx);
    else if (fx.team === 'cleo') this.playCleoMeleeHit(fx);
  }

  playVikingMeleeHit(fx) {
    const slot = fx.meleeSlot ?? fx.slot;
    if (slot === 'm2') {
      this.play('vikingMeleeShield', fx);
      return;
    }
    if (slot !== 'm1') return;

    const step = Math.round(clamp(Number(fx.axeStep ?? 1), 1, 3));
    this.play(`vikingMeleeAxe${step}`, fx);
  }

  playCleoMeleeHit(fx) {
    const slot = fx.meleeSlot ?? fx.slot;
    if (!slot?.startsWith('m')) return;
    this.play('cleoMelee', fx);
  }

  async play(name, fx = {}) {
    const sound = SOUNDS[name];
    if (!sound || !this.canPlay(name, sound)) return;
    if (sound.interruptGroup) this.stopOneShotGroup(sound.interruptGroup, sound.interruptFadeMs ?? 10);
    if (!(await this.readyToPlay())) return this.playHtml(name, fx);

    const buffer = await this.pickBuffer(sound);
    if (!buffer) return this.playHtml(name, fx);
    if (sound.interruptGroup) this.stopOneShotGroup(sound.interruptGroup, sound.interruptFadeMs ?? 10);

    const source = this.ctx.createBufferSource();
    const filter = this.createToneFilter(sound);
    const gain = this.ctx.createGain();
    const panner = this.createPanner();
    const spatial = this.spatialize(fx, sound);
    const roomSend = this.createRoomSend(sound, spatial);

    source.buffer = buffer;
    source.playbackRate.value = randomRange(sound.rate);
    gain.gain.value = this.effectiveVolume(sound, fx, spatial);
    if (panner) panner.pan.value = spatial.pan;

    connectNodes(source, filter, gain, panner, this.busFor(sound), this.roomInput, roomSend);
    const voice = { source, filter, gain, panner, roomSend, group: sound.interruptGroup, stopping: false, ended: false };
    this.trackOneShot(voice);
    source.onended = () => this.finishOneShot(voice);
    source.start();
  }

  trackOneShot(voice) {
    this.oneShots.add(voice);
    if (!voice.group) return;

    let group = this.oneShotGroups.get(voice.group);
    if (!group) {
      group = new Set();
      this.oneShotGroups.set(voice.group, group);
    }
    group.add(voice);
  }

  finishOneShot(voice) {
    if (!voice || voice.ended) return;
    voice.ended = true;
    this.oneShots.delete(voice);
    this.removeOneShotFromGroup(voice);
    disconnectNodes(voice.source, voice.filter, voice.gain, voice.panner, voice.roomSend);
  }

  removeOneShotFromGroup(voice) {
    if (!voice?.group) return;
    const group = this.oneShotGroups.get(voice.group);
    if (!group) return;
    group.delete(voice);
    if (group.size === 0) this.oneShotGroups.delete(voice.group);
  }

  stopOneShotGroup(groupName, fadeMs = 10) {
    if (!groupName) return;

    const voices = [...(this.oneShotGroups.get(groupName) ?? [])];
    for (const voice of voices) this.stopOneShot(voice, fadeMs);

    const htmlVoices = [...(this.htmlOneShotGroups.get(groupName) ?? [])];
    for (const audio of htmlVoices) this.fadeOutHtml(audio, fadeMs);
  }

  stopOneShot(voice, fadeMs = 10) {
    if (!voice || voice.stopping || voice.ended) return;
    voice.stopping = true;
    if (!this.ctx || !voice.source || !voice.gain) {
      this.finishOneShot(voice);
      return;
    }

    const now = this.ctx.currentTime;
    const fade = msToSec(fadeMs);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
    if (voice.roomSend) {
      voice.roomSend.gain.cancelScheduledValues(now);
      voice.roomSend.gain.setValueAtTime(Math.max(0.0001, voice.roomSend.gain.value), now);
      voice.roomSend.gain.linearRampToValueAtTime(0.0001, now + fade);
    }

    try {
      voice.source.stop(now + fade + 0.01);
    } catch {
      this.finishOneShot(voice);
    }
  }

  async startLoop(name, fx = {}) {
    const sound = SOUNDS[name];
    if (!sound) return;

    const id = fx.audioId ?? fx.pr ?? fx.id ?? 0;
    const key = this.loopKey(name, id);
    const existing = this.activeLoops.get(key);
    if (existing) {
      this.updateLoop(existing, fx);
      return;
    }

    const loop = {
      key,
      name,
      id,
      sound,
      fx,
      source: null,
      filter: null,
      gain: null,
      panner: null,
      roomSend: null,
      timer: 0,
      stopping: false,
    };
    this.activeLoops.set(key, loop);

    if (!(await this.readyToPlay())) {
      this.activeLoops.delete(key);
      this.startHtmlLoop(name, fx);
      return;
    }

    const buffer = await this.pickBuffer(sound);
    if (!buffer || !this.activeLoops.has(key) || loop.stopping) {
      this.activeLoops.delete(key);
      if (!loop.stopping) this.startHtmlLoop(name, fx);
      return;
    }

    const source = this.ctx.createBufferSource();
    const filter = this.createToneFilter(sound);
    const gain = this.ctx.createGain();
    const panner = this.createPanner();
    const spatial = this.spatialize(fx, sound);
    const roomSend = this.createRoomSend(sound, spatial);
    const target = this.effectiveVolume(sound, fx, spatial);
    const now = this.ctx.currentTime;

    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = randomRange(sound.rate);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(target, now + msToSec(sound.fadeInMs ?? 80));
    if (panner) panner.pan.value = spatial.pan;

    loop.source = source;
    loop.filter = filter;
    loop.gain = gain;
    loop.panner = panner;
    loop.roomSend = roomSend;

    connectNodes(source, filter, gain, panner, this.busFor(sound), this.roomInput, roomSend);
    source.onended = () => disconnectNodes(source, filter, gain, panner, roomSend);
    source.start();
    this.armLoopTimeout(loop);
  }

  sync(players = []) {
    if (!this.unlocked) return;

    const channeling = new Map();
    for (const p of players) {
      if (p?.sf > 0) channeling.set(p.i, p);
    }

    for (const loop of [...this.activeLoops.values()]) {
      if (loop.name !== 'sunFireChannel') continue;
      const p = channeling.get(loop.id);
      if (!p) {
        this.stopLoop(loop.name, loop.id);
        continue;
      }
      this.updateLoop(loop, fxFromChannelPlayer(p));
    }

    for (const p of channeling.values()) {
      const key = this.loopKey('sunFireChannel', p.i);
      if (this.activeLoops.has(key)) continue;
      this.startLoop('sunFireChannel', fxFromChannelPlayer(p));
    }
  }

  updateLoop(loop, fx = {}) {
    loop.fx = fx;
    if (loop.html) {
      const spatial = this.spatialize(fx, loop.sound);
      loop.html.volume = this.htmlVolume(loop.sound, fx, spatial);
      return;
    }
    if (!this.ctx || !loop.gain) return;

    const spatial = this.spatialize(fx, loop.sound);
    const target = this.effectiveVolume(loop.sound, fx, spatial);
    const now = this.ctx.currentTime;
    loop.gain.gain.cancelScheduledValues(now);
    loop.gain.gain.setTargetAtTime(target, now, 0.06);
    if (loop.panner) loop.panner.pan.setTargetAtTime(spatial.pan, now, 0.04);
    if (loop.roomSend) loop.roomSend.gain.setTargetAtTime(spatial.roomSend, now, 0.08);
  }

  stopLoop(name, id = 0) {
    const key = this.loopKey(name, id);
    const loop = this.activeLoops.get(key);
    if (!loop) return;

    this.activeLoops.delete(key);
    loop.stopping = true;
    if (loop.timer) window.clearTimeout(loop.timer);

    if (loop.html) {
      this.fadeOutHtml(loop.html, loop.sound.fadeOutMs ?? 100);
      return;
    }

    if (!this.ctx || !loop.source || !loop.gain) return;

    const now = this.ctx.currentTime;
    const fade = msToSec(loop.sound.fadeOutMs ?? 100);
    if (fade <= 0) {
      loop.gain.gain.cancelScheduledValues(now);
      loop.gain.gain.setValueAtTime(0, now);
      try {
        loop.source.stop(now);
      } catch {
        // Already stopped.
      }
      return;
    }
    loop.gain.gain.cancelScheduledValues(now);
    loop.gain.gain.setTargetAtTime(0.0001, now, Math.max(0.01, fade / 3));
    try {
      loop.source.stop(now + fade + 0.02);
    } catch {
      // Already stopped.
    }
  }

  stopAllLoops({ keepMusicIntent = false, immediateMusic = false, preserveMusic = false } = {}) {
    for (const loop of [...this.activeLoops.values()]) this.stopLoop(loop.name, loop.id);
    if (preserveMusic) {
      if (!keepMusicIntent) this.desiredMusic = null;
      return;
    }
    this.stopMusic(immediateMusic ? 0 : DEFAULT_MUSIC.fadeOutMs, { keepDesired: keepMusicIntent });
  }

  armLoopTimeout(loop) {
    const ms = Number(loop.sound.stopAfterMs ?? 0);
    if (!ms) return;
    loop.timer = window.setTimeout(() => this.stopLoop(loop.name, loop.id), ms);
  }

  async playHtml(name, fx = {}) {
    const sound = SOUNDS[name];
    const url = sound?.urls?.[Math.floor(Math.random() * sound.urls.length)];
    if (!url) return false;
    if (sound.interruptGroup) this.stopOneShotGroup(sound.interruptGroup, sound.interruptFadeMs ?? 10);

    const spatial = this.spatialize(fx, sound);
    const audio = new Audio(url);
    audio.volume = this.htmlVolume(sound, fx, spatial);
    audio.playbackRate = randomRange(sound.rate);

    try {
      await audio.play();
      this.htmlOneShots.add(audio);
      if (sound.interruptGroup) this.trackHtmlOneShot(audio, sound.interruptGroup);
      const done = () => {
        audio.removeEventListener('ended', done);
        audio.removeEventListener('pause', done);
        this.htmlOneShots.delete(audio);
        this.removeHtmlOneShotFromGroup(audio, sound.interruptGroup);
      };
      audio.addEventListener('ended', done);
      audio.addEventListener('pause', done);
      return true;
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      console.warn(`Could not play sound ${url}:`, err);
      return false;
    }
  }

  trackHtmlOneShot(audio, groupName) {
    if (!groupName) return;
    let group = this.htmlOneShotGroups.get(groupName);
    if (!group) {
      group = new Set();
      this.htmlOneShotGroups.set(groupName, group);
    }
    group.add(audio);
  }

  removeHtmlOneShotFromGroup(audio, groupName) {
    if (!groupName) return;
    const group = this.htmlOneShotGroups.get(groupName);
    if (!group) return;
    group.delete(audio);
    if (group.size === 0) this.htmlOneShotGroups.delete(groupName);
  }

  async startHtmlLoop(name, fx = {}) {
    const sound = SOUNDS[name];
    const url = sound?.urls?.[0];
    if (!url) return false;

    const id = fx.audioId ?? fx.pr ?? fx.id ?? 0;
    const key = this.loopKey(name, id);
    const existing = this.activeLoops.get(key);
    if (existing) {
      this.updateLoop(existing, fx);
      return true;
    }

    const spatial = this.spatialize(fx, sound);
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0;
    audio.playbackRate = randomRange(sound.rate);

    const loop = { key, name, id, sound, fx, html: audio, timer: 0, stopping: false };
    this.activeLoops.set(key, loop);

    try {
      await audio.play();
      this.fadeInHtml(audio, this.htmlVolume(sound, fx, spatial), sound.fadeInMs ?? 80);
      this.armLoopTimeout(loop);
      return true;
    } catch (err) {
      this.activeLoops.delete(key);
      this.lastError = String(err?.message ?? err);
      console.warn(`Could not start loop ${url}:`, err);
      return false;
    }
  }

  syncMusic(track = null) {
    const wanted = normalizeMusicTrack(track);
    if (!wanted) {
      this.stopMusic();
      return;
    }

    this.desiredMusic = wanted;
    if (this.music?.id === wanted.id && !this.music.stopping) {
      this.music.track = wanted;
      this.updateMusicVolume();
      return;
    }
    if (!document.hidden && this.unlocked) this.startMusic(wanted);
  }

  async startMusic(track) {
    const wanted = normalizeMusicTrack(track);
    if (!wanted) return false;

    this.desiredMusic = wanted;
    if (this.music?.id === wanted.id && !this.music.stopping) {
      this.music.track = wanted;
      this.updateMusicVolume();
      return true;
    }
    if (this.musicStartingId === wanted.id) return false;

    this.musicStartingId = wanted.id;
    this.stopMusic(wanted.fadeOutMs, { keepDesired: true });
    const ready = await this.readyToPlay();
    if (!ready) {
      if (this.musicStartingId === wanted.id) this.musicStartingId = '';
      return false;
    }

    if (this.desiredMusic?.id !== wanted.id || document.hidden) {
      if (this.musicStartingId === wanted.id) this.musicStartingId = '';
      return false;
    }

    const buffer = await this.loadBuffer(wanted.url);
    if (buffer && this.desiredMusic?.id === wanted.id && !document.hidden && this.ctx && this.musicBus) {
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      const duration = buffer.duration;
      const offset = this.musicOffsetFor(wanted, duration);

      source.buffer = buffer;
      source.loop = true;
      // Bade den schemalagda kurvan och .value maste nollas. .value-getter:n som
      // fadeMusicTo laser startvarde ur uppdateras av ljudtraden, och en context
      // som legat suspendad (dold flik) har inte renderat om den - da ser faden
      // startvardet 1 och tonar *ner* till mixernivan i stallet for upp.
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, now);
      source.connect(gain);
      gain.connect(this.musicBus);

      const music = {
        id: wanted.id,
        track: wanted,
        source,
        gain,
        startedAt: now,
        offset,
        duration,
        fadeId: 0,
        stopping: false,
      };
      this.music = music;
      source.onended = () => {
        if (this.music === music) this.music = null;
        disconnectNodes(source, gain);
      };
      source.start(now, offset);
      this.fadeMusicTo(music, this.musicTargetVolume(wanted, music), wanted.fadeInMs);
      if (this.musicStartingId === wanted.id) this.musicStartingId = '';
      return true;
    }

    if (this.desiredMusic?.id !== wanted.id || document.hidden) {
      if (this.musicStartingId === wanted.id) this.musicStartingId = '';
      return false;
    }

    return this.startHtmlMusic(wanted);
  }

  async startHtmlMusic(wanted) {
    const audio = new Audio(wanted.url);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    this.seekHtmlMusic(audio, wanted);

    const music = {
      id: wanted.id,
      track: wanted,
      audio,
      fadeId: 0,
      stopping: false,
    };
    this.music = music;

    try {
      await audio.play();
      if (this.desiredMusic?.id === wanted.id && this.music === music) {
        this.fadeMusicTo(music, this.musicTargetVolume(wanted, music), wanted.fadeInMs);
        return true;
      }
      this.stopMusic(0, { keepDesired: true });
      return false;
    } catch (err) {
      if (this.music === music) this.music = null;
      this.lastError = String(err?.message ?? err);
      console.warn(`Could not start music ${wanted.url}:`, err);
      return false;
    } finally {
      if (this.musicStartingId === wanted.id) this.musicStartingId = '';
    }
  }

  musicOffsetFor(track, duration = 0) {
    if (!track?.resume) return 0;
    return wrapMusicOffset(this.musicPositions.get(track.id) ?? 0, duration);
  }

  seekHtmlMusic(audio, track) {
    const seek = () => {
      const offset = this.musicOffsetFor(track, audio.duration);
      if (!offset) return;
      try {
        audio.currentTime = offset;
      } catch {
        // Some browsers only allow seeking after metadata is available.
      }
    };

    if (audio.readyState >= 1) seek();
    else audio.addEventListener('loadedmetadata', seek, { once: true });
  }

  rememberMusicPosition(music) {
    if (!music?.track?.resume) return;
    this.musicPositions.set(music.id, this.musicPlaybackOffset(music));
  }

  musicPlaybackOffset(music) {
    if (music?.audio) return wrapMusicOffset(music.audio.currentTime, music.audio.duration);
    if (!music?.source || !this.ctx) return 0;

    const elapsed = Math.max(0, this.ctx.currentTime - (finite(music.startedAt) ? music.startedAt : this.ctx.currentTime));
    return wrapMusicOffset((finite(music.offset) ? music.offset : 0) + elapsed, music.duration);
  }

  stopMusic(fadeMs = DEFAULT_MUSIC.fadeOutMs, { keepDesired = false } = {}) {
    if (!keepDesired) this.desiredMusic = null;

    const music = this.music;
    if (!music?.audio && !music?.source) return;

    this.rememberMusicPosition(music);
    this.music = null;
    music.stopping = true;
    this.fadeMusicTo(music, 0, fadeMs, () => {
      try {
        if (music.source) music.source.stop();
        if (music.audio) {
          music.audio.pause();
          music.audio.currentTime = 0;
        }
      } catch {
        // The element may already be gone.
      } finally {
        disconnectNodes(music.source, music.gain);
      }
    });
  }

  resumeDesiredMusic() {
    if (!this.desiredMusic || document.hidden) return;
    this.startMusic(this.desiredMusic);
  }

  setMusicVolume(value) {
    this.setChannelVolume('music', value);
  }

  setSfxVolume(value) {
    this.setChannelVolume('sfx', value);
  }

  setMasterVolume(value) {
    this.masterVolume = clamp(Number(value), 0, 1);
    writeStorage(STORAGE.master, this.masterVolume);
    this.applyVolumes();
  }

  setMuted(muted) {
    this.muted = !!muted;
    writeStorage(STORAGE.muted, this.muted ? '1' : '0');
    this.applyVolumes();
  }

  setChannelVolume(id, value) {
    if (!CHANNELS[id]) return;
    this.channelVolume[id] = clamp(Number(value), 0, 1);
    writeStorage(CHANNELS[id].key, this.channelVolume[id]);
    this.applyVolumes();
  }

  setChannelMuted(id, muted) {
    if (!CHANNELS[id]) return;
    this.channelMuted[id] = !!muted;
    writeStorage(STORAGE.channelMuted(id), this.channelMuted[id] ? '1' : '0');
    this.applyVolumes();
  }

  /**
   * Hela mixern i ett svep. Installningssidan drar reglagen mot den levande
   * mixern med persist:false och skriver forst ner allt nar man sparar.
   */
  applyMix(mix = {}, { persist = true } = {}) {
    if (finite(mix.master)) {
      this.masterVolume = clamp(Number(mix.master), 0, 1);
      if (persist) writeStorage(STORAGE.master, this.masterVolume);
    }
    if (mix.masterMuted !== undefined) {
      this.muted = !!mix.masterMuted;
      if (persist) writeStorage(STORAGE.muted, this.muted ? '1' : '0');
    }

    for (const [id, channel] of Object.entries(mix.channels ?? {})) {
      if (!CHANNELS[id]) continue;
      if (finite(channel?.value)) {
        this.channelVolume[id] = clamp(Number(channel.value), 0, 1);
        if (persist) writeStorage(CHANNELS[id].key, this.channelVolume[id]);
      }
      if (channel?.muted !== undefined) {
        this.channelMuted[id] = !!channel.muted;
        if (persist) writeStorage(STORAGE.channelMuted(id), this.channelMuted[id] ? '1' : '0');
      }
    }

    this.applyVolumes();
  }

  /** Det som ligger i localStorage just nu - dit vi backar om man inte sparar. */
  storedMix() {
    const channels = {};
    for (const id of CHANNEL_IDS) {
      channels[id] = {
        value: readNumber(CHANNELS[id].key, CHANNELS[id].def),
        muted: readBool(STORAGE.channelMuted(id), false),
      };
    }
    return {
      master: readNumber(STORAGE.master, MASTER_DEFAULT),
      masterMuted: readBool(STORAGE.muted, false),
      channels,
    };
  }

  /** Nulaget i mixern, i samma form som applyMix vill ha den tillbaka. */
  mix() {
    const channels = {};
    for (const id of CHANNEL_IDS) channels[id] = { value: this.channelVolume[id], muted: this.channelMuted[id] };
    return { master: this.masterVolume, masterMuted: this.muted, channels };
  }

  /** Fabriksinstallningen, samma karta som mix() ger. */
  defaultMix() {
    const channels = {};
    for (const id of CHANNEL_IDS) channels[id] = { value: CHANNELS[id].def, muted: false };
    return { master: MASTER_DEFAULT, masterMuted: false, channels };
  }

  masterGain() {
    return this.muted ? 0 : this.masterVolume;
  }

  channelGain(id = DEFAULT_CHANNEL) {
    if (!CHANNELS[id]) return 1;
    return this.channelMuted[id] ? 0 : this.channelVolume[id];
  }

  applyVolumes(immediate = false) {
    this.updateMusicVolume(immediate ? 0 : 80);
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    setGain(this.master.gain, this.masterGain(), now, immediate);
    for (const id of CHANNEL_IDS) {
      const bus = this.buses[id];
      if (bus) setGain(bus.gain, this.channelGain(id), now, immediate);
    }
  }

  /**
   * Testknappen i ljudinstallningarna. Kanaler med ett representativt ljud
   * spelar det, ovriga far en ton - bada gar genom kanalens buss sa att man
   * hor exakt vad reglaget gor.
   */
  async previewChannel(id) {
    if (!CHANNELS[id]) return false;
    const sample = CHANNELS[id].preview;
    if (sample && SOUNDS[sample]) {
      this.lastPlayed.delete(sample);
      await this.play(sample);
      return true;
    }
    return this.playTone(id);
  }

  async playTone(channel = DEFAULT_CHANNEL) {
    if (!(await this.readyToPlay()) || !this.ctx) return false;

    const bus = this.buses[channel] ?? this.sfxBus;
    if (!bus) return false;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(PREVIEW_TONE.hz, now);
    osc.frequency.exponentialRampToValueAtTime(PREVIEW_TONE.toHz, now + PREVIEW_TONE.seconds * 0.6);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(PREVIEW_TONE.volume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + PREVIEW_TONE.seconds);

    osc.connect(gain);
    gain.connect(bus);
    const voice = { source: osc, gain };
    this.oneShots.add(voice);
    osc.onended = () => {
      this.oneShots.delete(voice);
      disconnectNodes(osc, gain);
    };
    osc.start(now);
    osc.stop(now + PREVIEW_TONE.seconds + 0.02);
    return true;
  }

  async readyToPlay() {
    if (this.unlocked) return true;
    return this.prime();
  }

  canPlay(name, sound) {
    const cooldownMs = sound.cooldownMs ?? 0;
    if (!cooldownMs) return true;

    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (now - last < cooldownMs) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  pickBuffer(sound) {
    const url = sound.urls[Math.floor(Math.random() * sound.urls.length)];
    return this.loadBuffer(url);
  }

  async loadBuffer(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    if (this.loading.has(url)) return this.loading.get(url);

    const loading = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.arrayBuffer();
      })
      .then((data) => decodeAudio(this.ctx, data))
      .then((buffer) => {
        this.buffers.set(url, buffer);
        this.loading.delete(url);
        return buffer;
      })
      .catch((err) => {
        this.loading.delete(url);
        console.warn(`Could not load sound ${url}:`, err);
        return null;
      });

    this.loading.set(url, loading);
    return loading;
  }

  createPanner() {
    return this.ctx?.createStereoPanner ? this.ctx.createStereoPanner() : null;
  }

  createToneFilter(sound) {
    const hz = Number(sound.lowpassHz ?? 0);
    if (!this.ctx || !hz) return null;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = hz;
    filter.Q.value = Number(sound.lowpassQ ?? 0.7);
    return filter;
  }

  createRoomSend(sound, spatial) {
    const amount = Number(spatial.roomSend ?? sound.room ?? 0);
    if (!this.ctx || !this.roomInput || amount <= 0) return null;

    const gain = this.ctx.createGain();
    gain.gain.value = clamp(amount, 0, 0.32);
    return gain;
  }

  playSilentUnlockTick() {
    if (!this.ctx || !this.master) return;
    try {
      const buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.master);
      source.start();
      source.onended = () => disconnectNodes(source);
    } catch {
      // Some browsers are touchy here; this is only an unlock helper.
    }
  }

  spatialize(fx, sound) {
    if (!sound.spatial || !Number.isFinite(Number(fx.x))) {
      return { pan: 0, distanceGain: 1, roomSend: roomSendFor(sound, 0) };
    }

    const listener = this.getListener?.();
    if (listener?.i && fx.id === listener.i) {
      return { pan: 0, distanceGain: 1, roomSend: roomSendFor(sound, 0) };
    }

    const listenerX = finite(listener?.x) ? listener.x + PLAYER.w / 2 : WORLD.w / 2;
    const listenerY = finite(listener?.y) ? listener.y + PLAYER.h / 2 : WORLD.h / 2;
    const dx = Number(fx.x) - listenerX;
    const dy = finite(fx.y) ? Number(fx.y) - listenerY : 0;
    const distance = Math.hypot(dx, dy);
    const maxDistance = sound.maxDistance ?? 1200;
    const panDistance = sound.panDistance ?? 700;
    const distanceRatio = clamp(distance / maxDistance, 0, 1);
    const distanceGain = clamp(1 - distanceRatio * 0.58, 0.3, 1);
    const pan = clamp((dx / panDistance) * 1.08, -1, 1);

    return { pan, distanceGain, roomSend: roomSendFor(sound, distanceRatio) };
  }

  effectiveVolume(sound, fx, spatial) {
    const strength = clamp(Number(fx.s ?? 0), 0, 1);
    const strengthGain = 1 + strength * (sound.strengthGain ?? 0);
    return clamp((sound.volume ?? 1) * spatial.distanceGain * strengthGain, 0, 1.4);
  }

  // HTML-ljuden har ingen buss att ga igenom, sa mixern raknas in i elementets
  // egen volym i stallet.
  htmlVolume(sound, fx, spatial) {
    const bus = this.masterGain() * this.channelGain(sound?.channel ?? DEFAULT_CHANNEL);
    return clamp(this.effectiveVolume(sound, fx, spatial) * bus, 0, 1);
  }

  updateMusicVolume(fadeMs = 80) {
    if ((!this.music?.audio && !this.music?.gain) || this.music.stopping) return;
    this.fadeMusicTo(this.music, this.musicTargetVolume(this.music.track, this.music), fadeMs);
  }

  musicTargetVolume(track = this.music?.track, music = this.music) {
    if (!track) return 0;
    if (music?.gain) return clamp(track.volume, 0, 1);
    return clamp(track.volume * this.masterGain() * this.channelGain('music'), 0, 1);
  }

  fadeMusicTo(music, target, ms, after = null) {
    if (!music?.audio && !music?.gain) return;

    const duration = Math.max(0, Number(ms) || 0);
    const from = musicCurrentVolume(music);
    const to = clamp(target, 0, 1);
    const fadeId = (music.fadeId ?? 0) + 1;
    music.fadeId = fadeId;

    if (duration <= 0) {
      setMusicNodeVolume(music, to);
      after?.();
      return;
    }

    const started = performance.now();
    const step = () => {
      if (music.fadeId !== fadeId) return;
      const progress = clamp((performance.now() - started) / duration, 0, 1);
      setMusicNodeVolume(music, from + (to - from) * progress);
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      after?.();
    };
    requestAnimationFrame(step);
  }

  fadeInHtml(audio, target, ms) {
    const started = performance.now();
    const step = () => {
      if (audio.paused || audio.ended) return;
      const progress = clamp((performance.now() - started) / Math.max(1, ms), 0, 1);
      audio.volume = target * progress;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  fadeOutHtml(audio, ms) {
    if (ms <= 0) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }

    const started = performance.now();
    const from = audio.volume;
    const step = () => {
      const progress = clamp((performance.now() - started) / Math.max(1, ms), 0, 1);
      audio.volume = from * (1 - progress);
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      audio.pause();
      audio.currentTime = 0;
    };
    requestAnimationFrame(step);
  }

  status() {
    return {
      unlocked: this.unlocked,
      contextState: this.ctx?.state ?? 'none',
      muted: this.muted,
      masterVolume: this.masterVolume,
      channels: { ...this.channelVolume },
      channelsMuted: { ...this.channelMuted },
      room: !!this.roomInput,
      loadedBuffers: this.buffers.size,
      loadingBuffers: this.loading.size,
      activeLoops: this.activeLoops.size,
      music: this.music?.id ?? '',
      desiredMusic: this.desiredMusic?.id ?? '',
      oneShots: this.oneShots.size,
      htmlOneShots: this.htmlOneShots.size,
      lastError: this.lastError,
    };
  }

  async testBeep() {
    if (!(await this.readyToPlay()) || !this.ctx) return this.status();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const volume = 0.55;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(990, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxBus);
    const voice = { source: osc, gain };
    this.oneShots.add(voice);
    osc.onended = () => {
      this.oneShots.delete(voice);
      disconnectNodes(osc, gain);
    };
    osc.start(now);
    osc.stop(now + 0.3);
    return this.status();
  }

  async testSunFire() {
    await this.prime();
    const listener = this.getListener?.();
    const x = finite(listener?.x) ? listener.x + PLAYER.w / 2 : WORLD.w / 2;
    const y = finite(listener?.y) ? listener.y + PLAYER.h / 2 : WORLD.h / 2;
    await this.play('sunFireRelease', { x, y, s: 1 });
    window.setTimeout(() => this.play('sunFireHit', { x, y, s: 1 }), 260);
    return this.status();
  }

  loopKey(name, id = 0) {
    return `${name}:${id ?? 0}`;
  }
}

function fxFromChannelPlayer(p) {
  const cfg = ABILITY_TUNING.sunFire;
  return {
    k: 'sun_fire_channel',
    id: p.i,
    x: p.x + PLAYER.w / 2 + p.f * cfg.channelForward,
    y: p.y + PLAYER.h * 0.4 + cfg.channelUp,
    f: p.f,
    team: p.tm,
    s: p.sf,
  };
}

function withAudioId(fx, audioId) {
  return { ...fx, audioId };
}

function normalizeMusicTrack(track) {
  if (!track?.url) return null;
  return {
    id: String(track.id ?? track.url),
    url: String(track.url),
    volume: finite(track.volume) ? clamp(Number(track.volume), 0, 1) : DEFAULT_MUSIC.volume,
    fadeInMs: finite(track.fadeInMs) ? Math.max(0, Number(track.fadeInMs)) : DEFAULT_MUSIC.fadeInMs,
    fadeOutMs: finite(track.fadeOutMs) ? Math.max(0, Number(track.fadeOutMs)) : DEFAULT_MUSIC.fadeOutMs,
    resume: !!track.resume,
  };
}

function wrapMusicOffset(value, duration = 0) {
  const offset = Number(value);
  if (!Number.isFinite(offset) || offset <= 0) return 0;

  const length = Number(duration);
  if (!Number.isFinite(length) || length <= 0) return offset;
  return offset % length;
}

function musicCurrentVolume(music) {
  if (music?.gain) return clamp(Number(music.gain.gain.value), 0, 1);
  return clamp(Number(music?.audio?.volume ?? 0), 0, 1);
}

function setMusicNodeVolume(music, value) {
  const volume = clamp(value, 0, 1);
  if (music?.gain) music.gain.gain.value = volume;
  if (music?.audio) music.audio.volume = volume;
}

function connectNodes(source, filter, gain, panner, destination, roomDestination = null, roomSend = null) {
  if (filter) {
    source.connect(filter);
    filter.connect(gain);
  } else {
    source.connect(gain);
  }

  const output = panner ?? gain;
  if (panner) {
    gain.connect(panner);
  }

  output.connect(destination);
  if (roomDestination && roomSend) {
    output.connect(roomSend);
    roomSend.connect(roomDestination);
  }
}

function disconnectNodes(...nodes) {
  for (const node of nodes) {
    try {
      node?.disconnect();
    } catch {
      // Already disconnected.
    }
  }
}

function createRoomImpulse(ctx) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * ROOM.impulseSeconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const earlyReflections = Math.floor(ctx.sampleRate * 0.045);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    let smoothed = 0;

    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      const envelope = Math.pow(1 - t, ROOM.decay);
      const noise = Math.random() * 2 - 1;
      smoothed = smoothed * 0.62 + noise * 0.38;
      const early = i < earlyReflections ? 0.52 : 1;
      data[i] = smoothed * envelope * ROOM.impulseGain * early;
    }
  }

  return buffer;
}

function roomSendFor(sound, distanceRatio = 0) {
  const base = Number(sound.room ?? DEFAULT_ROOM_SEND);
  const distance = Number(sound.distanceRoom ?? DEFAULT_DISTANCE_ROOM_SEND);
  return clamp(base + clamp(distanceRatio, 0, 1) * distance, 0, 0.32);
}

function decodeAudio(ctx, data) {
  const copy = data.slice(0);
  try {
    const maybePromise = ctx.decodeAudioData(copy);
    if (maybePromise?.then) return maybePromise;
  } catch {
    // Older WebKit needs callbacks below.
  }

  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(data.slice(0), resolve, reject);
  });
}

function setGain(param, value, now, immediate) {
  param.cancelScheduledValues(now);
  if (immediate) param.setValueAtTime(value, now);
  else param.setTargetAtTime(value, now, 0.03);
}

function readNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
  } catch {
    return fallback;
  }
}

function readBool(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value === '1' || value === 'true';
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage can be unavailable in strict privacy modes.
  }
}

function randomRange(range) {
  if (!Array.isArray(range)) return 1;
  const min = Number(range[0]);
  const max = Number(range[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 1;
  return min + Math.random() * (max - min);
}

function msToSec(ms) {
  return Math.max(0, Number(ms) || 0) / 1000;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
