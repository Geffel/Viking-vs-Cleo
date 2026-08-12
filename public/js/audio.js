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
};

const FX_SOUND = {
  sun_fire_channel: 'sunFireChannel',
  sun_fire_release: 'sunFireRelease',
  sun_fire_hit: 'sunFireHit',
  sand_blast: 'cleoSandBlast',
  blink: 'cleoBlink',
  power_shield: 'cleoShield',
};

const STORAGE = {
  master: 'vvc.audio.master',
  sfx: 'vvc.audio.sfx',
  muted: 'vvc.audio.muted',
};

export class AudioManager {
  constructor({ getListener = null } = {}) {
    this.getListener = getListener;
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
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
    this.lastError = '';
    this.masterVolume = readNumber(STORAGE.master, 0.9);
    this.sfxVolume = readNumber(STORAGE.sfx, 1);
    this.muted = readBool(STORAGE.muted, false);

    this.unlockFromGesture = this.unlockFromGesture.bind(this);
    this.installUnlockers();
  }

  installUnlockers() {
    window.addEventListener('pointerdown', this.unlockFromGesture, { passive: true });
    window.addEventListener('keydown', this.unlockFromGesture);
    window.addEventListener('touchstart', this.unlockFromGesture, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopAllLoops();
    });
  }

  removeUnlockers() {
    window.removeEventListener('pointerdown', this.unlockFromGesture);
    window.removeEventListener('keydown', this.unlockFromGesture);
    window.removeEventListener('touchstart', this.unlockFromGesture);
  }

  unlockFromGesture() {
    this.prime();
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
    this.sfxBus = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxBus.connect(this.master);
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
    if (fx.k === 'swing' && fx.team === 'viking') {
      this.playVikingSwing(fx);
      return;
    }
    if (fx.k === 'hit') {
      this.playVikingHit(fx);
      return;
    }
    if (fx.k === 'combo' && fx.team === 'viking') {
      this.play('vikingMeleeComboEnd', fx);
      return;
    }

    const name = FX_SOUND[fx.k];
    if (!name) return;

    const sound = SOUNDS[name];
    if (!sound) return;
    if (sound.loop) this.startLoop(name, fx);
    else this.play(name, fx);
  }

  playVikingHit(fx) {
    if (fx.team !== 'viking') return;

    if (fx.abilityId === 'shieldCharge') {
      this.play('vikingShieldChargeHit', fx);
    }
  }

  playVikingSwing(fx) {
    if (fx.slot === 'm2') {
      this.play('vikingMeleeShield', fx);
      return;
    }
    if (fx.slot !== 'm1') return;

    const step = Math.round(clamp(Number(fx.axeStep ?? 1), 1, 3));
    this.play(`vikingMeleeAxe${step}`, fx);
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

    connectNodes(source, filter, gain, panner, this.sfxBus, this.roomInput, roomSend);
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

    connectNodes(source, filter, gain, panner, this.sfxBus, this.roomInput, roomSend);
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

  stopAllLoops() {
    for (const loop of [...this.activeLoops.values()]) this.stopLoop(loop.name, loop.id);
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

  setMasterVolume(value) {
    this.masterVolume = clamp(Number(value), 0, 1);
    writeStorage(STORAGE.master, this.masterVolume);
    this.applyVolumes();
  }

  setSfxVolume(value) {
    this.sfxVolume = clamp(Number(value), 0, 1);
    writeStorage(STORAGE.sfx, this.sfxVolume);
    this.applyVolumes();
  }

  setMuted(muted) {
    this.muted = !!muted;
    writeStorage(STORAGE.muted, this.muted ? '1' : '0');
    this.applyVolumes();
  }

  applyVolumes(immediate = false) {
    if (!this.ctx || !this.master || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    const master = this.muted ? 0 : this.masterVolume;
    setGain(this.master.gain, master, now, immediate);
    setGain(this.sfxBus.gain, this.sfxVolume, now, immediate);
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

  htmlVolume(sound, fx, spatial) {
    if (this.muted) return 0;
    return clamp(this.effectiveVolume(sound, fx, spatial) * this.masterVolume * this.sfxVolume, 0, 1);
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
      sfxVolume: this.sfxVolume,
      room: !!this.roomInput,
      loadedBuffers: this.buffers.size,
      loadingBuffers: this.loading.size,
      activeLoops: this.activeLoops.size,
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
    const volume = this.muted ? 0 : 0.55 * this.masterVolume * this.sfxVolume;

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
    const value = Number(localStorage.getItem(key));
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
