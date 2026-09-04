import {
  WORLD,
  PLAYER,
  MELEE,
  ABILITIES,
  ACTION_SLOTS,
  ABILITY_SLOTS,
  ABILITY_TUNING,
  MELEE_SLOTS,
  TEAM_IDS,
  INTERP_MS,
  LAGCOMP,
  POWERUP,
  POWERUP_SPAWNS,
  POWERUP_KIND_IDS,
  mapLayoutFor,
  DAMAGE_BUFF,
  ENRAGE,
  BACKSTAB,
  CRIT,
  COMBO,
  COMBO_MAX_LEN,
  TRAINING,
} from '../shared/constants.js';

let nextId = 1;
const baseCooldowns = () => Object.fromEntries(ACTION_SLOTS.map((slot) => [slot, 0]));
const LOW_HP_FRAC = 0.25;
const QUICK_DAMAGE_MS = 5000;
const RECENT_HIT_MS = 5000;
const HARPOON_SETUP_MS = 5000;
const LONG_RANGE_FRAC = 0.8;
const FULL_CHARGE_FRAC = 0.9;

const freshMatchStats = () => ({
  kills: 0,
  deaths: 0,
  hits: 0,
  critHits: 0,
  backstabHits: 0,
  damageDealt: 0,
  damageTaken: 0,
  powerups: 0,
  abilityUses: {},
  comboFinishers: 0,
  firstDamageAt: 0,
  quickDamageHits: 0,
});

export class Game {
  // clock och rng gar att byta ut i tester sa att tiden kan stegas exakt och
  // kritiska traffar kan tvingas fram eller stangas av.
  constructor({ clock = () => Date.now(), rng = Math.random, layout = mapLayoutFor(), mapId = null, abilityCooldownCap = 0 } = {}) {
    this.now = clock;
    this.rng = rng;
    this.layout = layout;
    this.mapId = mapId;
    // Traningslaget kapar langa cooldowns. 0 = inget tak, spelet som vanligt.
    this.abilityCooldownCap = Math.max(0, Number(abilityCooldownCap) || 0);
    this.startedAt = this.now();
    this.powerupSpawns = layout.powerupSpawns ?? POWERUP_SPAWNS;
    this.players = new Map();
    this.tick = 0;
    this.score = { cleo: 0, viking: 0 };
    this.fx = []; // visuella effekter, toms vid varje broadcast
    this.feed = []; // kill-handelser, toms vid varje broadcast
    this.events = []; // rena statistikhandelser, toms vid varje broadcast
    this.powerups = []; // powerups pa kartan just nu: { id, kind, spawn, x, y }
    this.projectiles = []; // kastade vapen: { id, ownerId, team, x, y, vx, vy, born }
    this.nextPowerupId = 1;
    this.nextProjectileId = 1;
    this.nextPowerupAt = this.now() + POWERUP.firstSpawnMs;
    this.firstKillDone = false;
  }

  reset() {
    this.players.clear();
    this.tick = 0;
    this.score = { cleo: 0, viking: 0 };
    this.fx = [];
    this.feed = [];
    this.events = [];
    this.powerups = [];
    this.projectiles = [];
    this.nextPowerupId = 1;
    this.nextProjectileId = 1;
    this.nextPowerupAt = this.now() + POWERUP.firstSpawnMs;
    this.startedAt = this.now();
    this.firstKillDone = false;
  }

  markStarted(t = this.now()) {
    this.startedAt = t;
  }

  // ---------------------------------------------------------------- spelare

  addPlayer(name, team, identity = {}) {
    const id = nextId++;
    const p = {
      id,
      name,
      clientId: identity.clientId ?? null,
      profileId: identity.profileId ?? 0,
      team,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: team === 'cleo' ? 1 : -1,
      onGround: false,
      dropThroughPlatform: null,
      dropThroughUntil: 0,
      hp: PLAYER.maxHp,
      dead: false,
      respawnAt: 0,
      kills: 0,
      deaths: 0,
      input: { left: false, right: false },
      cd: baseCooldowns(), // absoluta tidsstamplar (ms) nar formagan ar redo
      swingUntil: 0, // bara for grafiken - sager att en attack pagar
      swing: null, // slag i luften: { resolveAt, viewTime, box }
      halfRtt: 0, // halva rundtursstiden, matt med WebSocket-ping
      history: [], // { t, x, y } bakat i tiden, for traffkontrollen
      dashUntil: 0,
      chargeUntil: 0,
      chargeHits: null,
      chargeType: null,
      slamming: false,
      stunnedUntil: 0,
      stunnedBy: 0,
      stunnedCause: '',
      pulledUntil: 0, // slapas in av en harpun sa lange detta ligger i framtiden
      pulledBy: 0, // id pa vikingen som drar - reprisen siktar mot honom
      lastHarpoonedBy: 0,
      lastHarpoonedAt: 0,
      invulnUntil: 0,
      shieldCharges: 0,
      shieldSetBlocks: 0,
      channel: null, // pagaende hold-to-release-formaga, t.ex. Cleos Sun fire
      dmgBuffUntil: 0, // kebab-buffen: skadan multipliceras sa lange den varar
      berserkUntil: 0, // flugsvampen: mer utdelad OCH mer mottagen skada
      rageUntil: 0, // combo-ursinnet: en combo-dodsstot ger mer utdelad skada
      lastHitBy: 0,
      lastHitAt: 0,
      comboSeq: [], // melee-platser som traffat i rad, senaste sist
      comboAt: 0, // nar den senaste traffen i kedjan landade
      bot: false, // traningsdockan: styrs av servern, slass aldrig tillbaka
      patrol: null, // { minX, maxX, dir } - bandet boten gar fram och tillbaka i
      speedMul: 1, // permanent fartfaktor - traningsdockan gar i halvfart
      stats: freshMatchStats(),
    };
    this.spawn(p);
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) {
    this.players.delete(id);
    this.projectiles = this.projectiles.filter((pr) => pr.ownerId !== id);
  }

  /** Cooldownen som faktiskt galler - traningslaget kapar de langa. */
  abilityCooldown(ability) {
    if (!this.abilityCooldownCap) return ability.cooldown;
    return Math.min(ability.cooldown, this.abilityCooldownCap);
  }

  /**
   * Traningsdockan. Den slass aldrig tillbaka - servern satter bara gangriktning
   * varje tick sa att den vandrar fram och tillbaka i mitten av kartan.
   */
  addBot(team, { widthFrac = TRAINING.patrolWidthFrac } = {}) {
    const p = this.addPlayer(TRAINING_BOT_NAME, team, { clientId: null, profileId: 0 });
    p.bot = true;
    p.patrol = patrolBand(widthFrac);
    p.speedMul = TRAINING.botSpeedMul;
    // Boten borjar mitt i bandet i stallet for pa lagets spawn, sa att den
    // syns direkt dar man ska ova.
    p.x = (p.patrol.minX + p.patrol.maxX) / 2;
    p.history.length = 0;
    return p;
  }

  /** Gar mot bandets kant, vander, och gor ingenting annat. */
  driveBot(p, t) {
    if (!p.patrol) return;
    if (t < p.stunnedUntil || t < p.pulledUntil) {
      p.input.left = false;
      p.input.right = false;
      return;
    }
    if (p.x <= p.patrol.minX) p.patrol.dir = 1;
    else if (p.x >= p.patrol.maxX) p.patrol.dir = -1;
    p.input.left = p.patrol.dir < 0;
    p.input.right = p.patrol.dir > 0;
  }

  stat(kind, data = {}) {
    this.events.push({ k: kind, t: this.now(), ...data });
  }

  playerRef(p) {
    return {
      playerId: p?.id ?? 0,
      profileId: p?.profileId ?? 0,
      team: p?.team ?? null,
      name: p?.name ?? '',
    };
  }

  noteAbilityUse(p, abilityId, t, extra = {}) {
    p.stats.abilityUses[abilityId] = (p.stats.abilityUses[abilityId] ?? 0) + 1;
    this.stat('ability_use', {
      player: this.playerRef(p),
      abilityId,
      slot: extra.slot ?? null,
      hpBefore: Math.round(extra.hpBefore ?? p.hp),
      lowHp: (extra.hpBefore ?? p.hp) <= PLAYER.maxHp * LOW_HP_FRAC,
      ...extra,
    });
  }

  /** Valjer den spawnpunkt som ligger langst fran narmaste fiende. */
  spawn(p) {
    const points = this.layout.spawns[p.team];
    const enemies = [...this.players.values()].filter((o) => o.team !== p.team && !o.dead);
    if (!enemies.length) {
      this.resetPlayerAt(p, points[0]);
      return;
    }

    let best = points[0];
    let bestScore = -Infinity;
    for (const pt of points) {
      let nearest = Infinity;
      for (const e of enemies) nearest = Math.min(nearest, Math.hypot(e.x - pt.x, e.y - pt.y));
      if (nearest > bestScore) {
        bestScore = nearest;
        best = pt;
      }
    }
    this.resetPlayerAt(p, best);
  }

  resetPlayerAt(p, pt) {
    p.x = pt.x;
    p.y = pt.y;
    p.vx = 0;
    p.vy = 0;
    p.hp = PLAYER.maxHp;
    p.dead = false;
    p.onGround = false;
    p.dropThroughPlatform = null;
    p.dropThroughUntil = 0;
    p.slamming = false;
    p.dashUntil = 0;
    p.chargeUntil = 0;
    p.chargeType = null;
    p.chargeHits = null;
    p.stunnedUntil = 0;
    p.stunnedBy = 0;
    p.stunnedCause = '';
    p.pulledUntil = 0; // ett rep som satt i offret slapper nar det respawnar
    p.pulledBy = 0;
    p.lastHarpoonedBy = 0;
    p.lastHarpoonedAt = 0;
    p.shieldCharges = 0;
    p.shieldSetBlocks = 0;
    p.channel = null;
    p.swingUntil = 0;
    p.swing = null;
    this.breakCombo(p); // en pagaende kedja overlever inte doden
    // Kebaben overlever inte doden - buffen far erovras pa nytt. Detsamma
    // galler berserken och combo-ursinnet: man vaknar nykter och lugn.
    p.dmgBuffUntil = 0;
    p.berserkUntil = 0;
    p.rageUntil = 0;
    // Historiken nollstalls: en spawn ar ett hopp i rummet, och att interpolera
    // over det skulle ge traffkontrollen positioner spelaren aldrig varit pa.
    p.history.length = 0;
    p.invulnUntil = this.now() + PLAYER.spawnProtectionMs;
  }

  // ------------------------------------------------------------------ input

  setMove(p, left, right) {
    p.input.left = !!left;
    p.input.right = !!right;
  }

  action(p, kind) {
    if (p.dead) return;
    if (kind === 'melee') kind = MELEE_SLOTS[0];
    const t = this.now();
    if (t < p.stunnedUntil) return;
    if (kind === 'jump') {
      if (p.onGround) {
        p.vy = PLAYER.jumpVel;
        p.onGround = false;
        this.fx.push({ k: 'jump', id: p.id, x: p.x + PLAYER.w / 2, y: p.y + PLAYER.h });
      }
      return;
    }
    if (kind === 'drop') {
      this.dropThrough(p, t);
      return;
    }
    if (MELEE_SLOTS.includes(kind)) {
      if (t < p.cd[kind]) return;
      for (const slot of MELEE_SLOTS) p.cd[slot] = t + MELEE.cooldown;
      p.swingUntil = t + MELEE.windupMs;

      // Siktet last redan nu, mot exakt den bild angriparen hade pa skarmen nar
      // han tryckte: sig sjalv utan fordrojning, motstandarna INTERP_MS bakat.
      // Halva pingen dras av bada for att kompensera resan hit.
      const rewind = Math.min(INTERP_MS + p.halfRtt, LAGCOMP.maxRewindMs);
      const from = this.positionAt(p, t - p.halfRtt);
      const box = meleeBox(from.x, from.y, p.facing);
      p.swing = { resolveAt: t + MELEE.windupMs, viewTime: t - rewind, box, slot: kind };
      const swingAudio = this.meleeSwingAudioMeta(p, kind, t);

      this.fx.push({
        k: 'swing',
        id: p.id,
        x: from.x + PLAYER.w / 2,
        y: from.y + PLAYER.h / 2,
        f: p.facing,
        team: p.team,
        slot: kind,
        comboStep: swingAudio.comboStep,
        axeStep: swingAudio.axeStep,
        // Traffytan foljer med sa att felsokningslaget kan rita ut den.
        bx: round(box.x),
        by: round(box.y),
        bw: round(box.w),
        bh: round(box.h),
      });
      return;
    }
    if (ABILITY_SLOTS.includes(kind)) {
      // Alla lag har inte alla rutor - saknas formagan gor tangenten ingenting.
      const ability = ABILITIES[p.team][kind];
      if (!ability) return;
      if (t < p.cd[kind]) return;
      if (ability.id === 'sunFire') {
        if (this.startSunFire(p, kind, t)) this.noteAbilityUse(p, ability.id, t, { slot: kind, phase: 'start' });
        return;
      }
      const used = this.useAbility(p, ability.id, t);
      if (!used) return;
      this.noteAbilityUse(p, ability.id, t, { slot: kind, ...(used === true ? {} : used) });
      p.cd[kind] = t + this.abilityCooldown(ability);
    }
  }

  releaseAction(p, kind) {
    if (p.dead) return;
    if (!ABILITY_SLOTS.includes(kind)) return;
    const ability = ABILITIES[p.team][kind];
    if (ability?.id !== 'sunFire') return;

    const t = this.now();
    const channel = p.channel;
    if (!channel || channel.id !== 'sunFire' || channel.slot !== kind) return;
    p.channel = null;

    if (t < p.stunnedUntil) return;
    this.releaseSunFire(p, channel, t);
    p.cd[kind] = t + this.abilityCooldown(ability);
  }

  dropThrough(p, t) {
    if (!p.onGround) return;
    const pl = this.platformAtFeet(p);
    if (!pl || pl.ground) return;

    p.dropThroughPlatform = pl;
    p.dropThroughUntil = t + PLAYER.dropThroughMs;
    p.onGround = false;
    p.vy = Math.max(p.vy, PLAYER.dropThroughVel);
  }

  platformAtFeet(p) {
    const feet = p.y + PLAYER.h;
    for (const pl of this.layout.platforms) {
      if (!this.overlapsPlatformX(p, pl)) continue;
      if (Math.abs(feet - pl.y) <= 1.5) return pl;
    }
    return null;
  }

  overlapsPlatformX(p, pl) {
    return p.x + PLAYER.w > pl.x && p.x < pl.x + pl.w;
  }

  ignoresLandingOn(p, pl, t, prevBottom) {
    if (p.dropThroughPlatform !== pl) return false;
    if (t < p.dropThroughUntil || prevBottom <= pl.y + pl.h + 1) return true;
    this.clearDropThrough(p);
    return false;
  }

  clearDropThroughIfDone(p) {
    const pl = p.dropThroughPlatform;
    if (!pl) return;
    if (!this.overlapsPlatformX(p, pl) || p.y + PLAYER.h > pl.y + pl.h + 1 || p.onGround) this.clearDropThrough(p);
  }

  clearDropThrough(p) {
    p.dropThroughPlatform = null;
    p.dropThroughUntil = 0;
  }

  useAbility(p, id, t) {
    const cfg = ABILITY_TUNING[id];
    const hpBefore = p.hp;
    switch (id) {
      case 'dash':
        p.vx = p.facing * cfg.speed;
        p.dashUntil = t + cfg.durationMs;
        this.fx.push({ k: 'dash', id: p.id, x: p.x + PLAYER.w / 2, y: p.y + PLAYER.h / 2, f: p.facing, team: p.team });
        return true;

      case 'heal':
        if (p.hp >= PLAYER.maxHp) return false;
        p.hp = Math.min(PLAYER.maxHp, p.hp + cfg.amount);
        this.fx.push({ k: 'heal', id: p.id, x: p.x + PLAYER.w / 2, y: p.y + PLAYER.h / 2 });
        return { hpBefore, hpAfter: p.hp };

      case 'blink':
        return this.blink(p, cfg);

      case 'powerShield':
        p.shieldCharges = cfg.charges;
        p.shieldSetBlocks = 0;
        this.fx.push({ k: 'power_shield', id: p.id, x: p.x + PLAYER.w / 2, y: p.y + PLAYER.h / 2, team: p.team, c: p.shieldCharges });
        return { charges: p.shieldCharges };

      case 'sandBlast':
        this.sandBlast(p, cfg, t);
        return true;

      case 'charge':
        p.vx = p.facing * cfg.speed;
        p.chargeUntil = t + cfg.durationMs;
        p.chargeHits = new Set();
        p.chargeType = 'charge';
        this.fx.push({ k: 'charge', id: p.id, x: p.x + PLAYER.w / 2, y: p.y + PLAYER.h / 2, f: p.facing, team: p.team });
        return true;

      case 'shieldCharge':
        p.vx = p.facing * cfg.speed;
        p.chargeUntil = t + cfg.durationMs;
        p.chargeHits = new Set();
        p.chargeType = 'shield';
        this.fx.push({ k: 'shield_charge', id: p.id, x: p.x + PLAYER.w / 2, y: p.y + PLAYER.h / 2, f: p.facing, team: p.team });
        return true;

      case 'axeThrow':
        this.throwAxe(p, cfg, t);
        return true;

      case 'mushrooms':
        p.berserkUntil = t + cfg.durationMs;
        this.fx.push({ k: 'mushrooms', id: p.id, x: p.x + PLAYER.w / 2, y: p.y + PLAYER.h / 2, team: p.team });
        return { durationMs: cfg.durationMs };

      case 'lasso':
        this.lasso(p, cfg, t);
        return true;

      case 'slam':
        if (p.onGround) return false; // maste vara i luften
        p.vy = cfg.fallSpeed;
        p.vx *= 0.3;
        p.slamming = true;
        return true;

      default:
        return false;
    }
  }

  // ------------------------------------------------------------------- loop

  update() {
    const t = this.now();
    this.tick++;

    for (const p of this.players.values()) {
      if (p.dead) {
        if (t >= p.respawnAt) this.spawn(p);
        continue;
      }
      if (p.bot) this.driveBot(p, t);
      this.movePlayer(p, t);
    }

    // Historiken skrivs efter forflyttningen men fore traffkontrollen, sa att
    // bakatspolningen har med sig den har ticken.
    for (const p of this.players.values()) this.recordHistory(p, t);

    for (const p of this.players.values()) {
      if (p.dead) continue;
      this.resolveSwing(p, t);
      this.resolveCharge(p, t);
    }

    this.updateProjectiles(t);
    this.updatePowerups(t);
  }

  // -------------------------------------------------------------- formagor

  blink(p, cfg) {
    const fromX = p.x;
    const fromY = p.y;
    const wantedX = p.x + p.facing * cfg.distance;
    const resolved = this.resolveBlinkX(p, clamp(wantedX, 0, WORLD.w - PLAYER.w), p.facing);
    p.x = resolved.x;
    p.vx = 0;
    p.history.length = 0;

    this.fx.push({
      k: 'blink',
      id: p.id,
      x: fromX + PLAYER.w / 2,
      y: fromY + PLAYER.h / 2,
      tx: p.x + PLAYER.w / 2,
      ty: p.y + PLAYER.h / 2,
      f: p.facing,
      team: p.team,
    });
    return {
      hpBefore: p.hp,
      fromX: round(fromX),
      toX: round(p.x),
      distance: round(Math.abs(p.x - fromX)),
      throughPlayer: resolved.throughPlayer,
      clamped: resolved.clamped,
    };
  }

  resolveBlinkX(p, x, facing) {
    const gap = 0.5;
    const requested = x;
    let throughPlayer = false;

    for (let guard = 0; guard < this.players.size; guard++) {
      const blocker = this.playerOverlappingAt(p, x, p.y);
      if (!blocker) return { x, throughPlayer, clamped: x !== requested };

      throughPlayer = true;
      const nextX = facing > 0 ? blocker.x + PLAYER.w + gap : blocker.x - PLAYER.w - gap;
      const clamped = clamp(nextX, 0, WORLD.w - PLAYER.w);
      if (clamped === x) return { x: clamped, throughPlayer, clamped: clamped !== requested };
      x = clamped;
    }
    return { x, throughPlayer, clamped: x !== requested };
  }

  playerOverlappingAt(p, x, y) {
    const box = { x, y, w: PLAYER.w, h: PLAYER.h };
    for (const o of this.players.values()) {
      if (o.id === p.id || o.dead) continue;
      if (overlaps(box, { x: o.x, y: o.y, w: PLAYER.w, h: PLAYER.h })) return o;
    }
    return null;
  }

  sandBlast(p, cfg, t) {
    const cx = p.x + PLAYER.w / 2;
    const cy = p.y + PLAYER.h * 0.55;
    this.fx.push({
      k: 'sand_blast',
      id: p.id,
      x: cx,
      y: cy,
      f: p.facing,
      team: p.team,
      r: cfg.range,
      nh: cfg.nearHalfHeight,
      fh: cfg.farHalfHeight,
    });

    const target = this.findSandBlastTarget(p, cfg, cx, cy);
    if (!target) return;

    const meta = { cause: 'sandBlast', abilityId: 'sandBlast' };
    if (this.negateIncomingAttack(target, p, t, meta)) return;

    const dmg = randInt(cfg.damageMin, cfg.damageMax);
    this.stun(target, cfg.stunMs, t, { source: p, cause: 'sandBlast' });
    this.damage(target, p, dmg, p.facing * cfg.knockbackX, cfg.knockbackY, t, meta);
    this.fx.push({ k: 'stun', id: target.id, x: target.x + PLAYER.w / 2, y: target.y + PLAYER.h * 0.18 });
  }

  findSandBlastTarget(p, cfg, cx, cy) {
    let target = null;
    let best = Infinity;

    for (const o of this.players.values()) {
      if (o.id === p.id || o.team === p.team || o.dead) continue;
      const ox = o.x + PLAYER.w / 2;
      const oy = o.y + PLAYER.h / 2;
      if (!inSandCone(ox, oy, cx, cy, p.facing, cfg)) continue;

      const d = Math.abs(ox - cx);
      if (d < best) {
        best = d;
        target = o;
      }
    }
    return target;
  }

  stun(target, durationMs, t, meta = {}) {
    target.stunnedUntil = Math.max(target.stunnedUntil, t + durationMs);
    target.stunnedBy = meta.source?.id ?? target.stunnedBy ?? 0;
    target.stunnedCause = meta.cause ?? target.stunnedCause ?? '';
    target.dashUntil = 0;
    target.chargeUntil = 0;
    target.chargeHits = null;
    target.chargeType = null;
    target.slamming = false;
    target.channel = null;
  }

  /**
   * Harpunen kastas som en projektil rakt fram (kind 'harpoon'). Repet foljer
   * med ut, och forst nar harpunen traffar nagon satts kroken - da tar
   * updateProjectiles/harpoonConnect vid och slapar in offret. Bommar den blir
   * det bara ett kast, sa den langsamma harpunen gar att hinna undan.
   */
  lasso(p, cfg, t) {
    const cx = p.x + PLAYER.w / 2;
    const cy = p.y + PLAYER.h * 0.42;
    const dx = p.facing;
    const spawnX = cx + dx * cfg.spawnForward;

    this.projectiles.push({
      id: this.nextProjectileId++,
      kind: 'harpoon',
      ownerId: p.id,
      team: p.team,
      x: spawnX,
      y: cy,
      sx: spawnX,
      sy: cy,
      px: cx,
      py: cy,
      vx: dx * cfg.speed,
      vy: 0,
      f: Math.sign(dx) || p.facing,
      born: t,
      angle: 0,
    });
    this.fx.push({ k: 'lasso_throw', id: p.id, x: cx, y: cy, f: Math.sign(dx) || p.facing, team: p.team });
  }

  /** Kroken traffade: lite skada, och sedan indragning om offret overlever. */
  harpoonConnect(target, source, pr, cfg, t) {
    this.fx.push({ k: 'lasso_hit', x: pr.x, y: pr.y, team: pr.team });
    const traveled = Math.hypot(pr.x - pr.sx, pr.y - pr.sy);
    this.damage(target, source, randInt(cfg.damageMin, cfg.damageMax), 0, 0, t, {
      cause: 'harpoon',
      abilityId: 'lasso',
      range: round(traveled),
      longRange: traveled >= cfg.maxRange * LONG_RANGE_FRAC,
    });
    if (!target.dead) this.grab(target, source, t);
  }

  /** Faster repet i offret och bryter dess egna utfall - nu slapas det. */
  grab(target, source, t) {
    const cfg = ABILITY_TUNING.lasso;
    target.pulledUntil = t + cfg.durationMs;
    target.pulledBy = source.id;
    target.lastHarpoonedBy = source.id;
    target.lastHarpoonedAt = t;
    target.dashUntil = 0;
    target.chargeUntil = 0;
    target.chargeHits = null;
    target.chargeType = null;
    target.slamming = false;
    target.channel = null;
    this.stat('harpoon_pull', {
      player: this.playerRef(source),
      target: this.playerRef(target),
      durationMs: cfg.durationMs,
    });
  }

  /**
   * Drar ett fangat offer mot vikingen. Kors varje tick sa lange repet sitter i:
   * farten pekas om mot fangaren tills offret ar framme eller repet slapper
   * (fangaren borta, dod eller sjalv stunnad). Returnerar true sa lange offret
   * fortfarande dras - da later movePlayer reprisen aga farten.
   */
  applyPull(p, t) {
    const puller = this.players.get(p.pulledBy);
    const cfg = ABILITY_TUNING.lasso;
    if (!puller || puller.dead || t < puller.stunnedUntil) {
      p.pulledUntil = 0;
      return false;
    }
    const dx = puller.x + PLAYER.w / 2 - (p.x + PLAYER.w / 2);
    if (Math.abs(dx) <= cfg.releaseDist) {
      p.pulledUntil = 0;
      return false;
    }
    p.vx = Math.sign(dx) * cfg.reelSpeed;
    p.facing = Math.sign(dx) || p.facing; // slapas med ansiktet mot fangaren
    return true;
  }

  // -------------------------------------------------------------- projektiler

  startSunFire(p, slot, t) {
    if (p.channel?.id === 'sunFire') return false;
    const cfg = ABILITY_TUNING.sunFire;
    const cx = p.x + PLAYER.w / 2;
    const cy = p.y + PLAYER.h * 0.4 + cfg.channelUp;
    p.channel = { id: 'sunFire', slot, started: t };
    this.fx.push({ k: 'sun_fire_channel', id: p.id, x: cx + p.facing * cfg.channelForward, y: cy, f: p.facing, team: p.team });
    return true;
  }

  releaseSunFire(p, channel, t) {
    const cfg = ABILITY_TUNING.sunFire;
    const strength = clamp((t - channel.started) / cfg.channelMaxMs, 0, 1);
    const cx = p.x + PLAYER.w / 2;
    const cy = p.y + PLAYER.h * 0.4 + cfg.channelUp;
    const dx = p.facing;
    const dy = 0;
    const speed = lerp(cfg.speedMin, cfg.speedMax, strength);
    const w = lerp(cfg.wMin, cfg.wMax, strength);
    const h = lerp(cfg.hMin, cfg.hMax, strength);
    const damage = Math.round(lerp(cfg.damageMin, cfg.damageMax, strength));
    const knockbackX = lerp(cfg.knockbackXMin, cfg.knockbackXMax, strength);
    const spawnX = cx + dx * cfg.spawnForward;

    this.projectiles.push({
      id: this.nextProjectileId++,
      kind: 'sun_fire',
      ownerId: p.id,
      team: p.team,
      x: spawnX,
      y: cy,
      sx: spawnX,
      sy: cy,
      px: cx,
      py: cy,
      vx: dx * speed,
      vy: dy * speed,
      f: Math.sign(dx) || p.facing,
      born: t,
      angle: 0,
      strength,
      w,
      h,
      lifeMs: cfg.lifeMs,
      maxRange: lerp(cfg.maxRangeMin, cfg.maxRangeMax, strength),
      damageMin: damage,
      damageMax: damage,
      knockbackX,
      knockbackY: cfg.knockbackY,
      rotationSpeed: cfg.rotationSpeed,
    });
    this.fx.push({ k: 'sun_fire_release', id: p.id, x: cx, y: cy, f: Math.sign(dx) || p.facing, team: p.team, s: strength });
    this.stat('ability_release', {
      player: this.playerRef(p),
      abilityId: 'sunFire',
      chargeMs: Math.max(0, t - channel.started),
      strength: round(strength),
      fullCharge: strength >= FULL_CHARGE_FRAC,
    });
  }

  throwAxe(p, cfg, t) {
    const cx = p.x + PLAYER.w / 2;
    const cy = p.y + PLAYER.h * 0.42;
    const dx = p.facing;
    const dy = 0;
    const projectileId = this.nextProjectileId++;

    this.projectiles.push({
      id: projectileId,
      ownerId: p.id,
      team: p.team,
      x: cx + dx * cfg.spawnForward,
      y: cy + dy * cfg.spawnForward,
      sx: cx + dx * cfg.spawnForward,
      sy: cy + dy * cfg.spawnForward,
      px: cx,
      py: cy,
      vx: dx * cfg.speed,
      vy: dy * cfg.speed,
      f: Math.sign(dx) || p.facing,
      born: t,
      angle: 0,
    });
    this.fx.push({ k: 'axe_throw', id: p.id, pr: projectileId, x: cx, y: cy, f: Math.sign(dx) || p.facing, team: p.team });
  }

  updateProjectiles(t) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const cfg = projectileConfig(pr);
      const source = this.players.get(pr.ownerId);
      if (!source) {
        this.projectiles.splice(i, 1);
        continue;
      }

      pr.px = pr.x;
      pr.py = pr.y;
      pr.x += pr.vx;
      pr.y += pr.vy;
      pr.angle += (cfg.rotationSpeed ?? 0) * (Math.sign(pr.vx) || pr.f || 1);
      const traveled = Math.hypot(pr.x - pr.sx, pr.y - pr.sy);

      const expired =
        t - pr.born > cfg.lifeMs ||
        traveled >= cfg.maxRange ||
        pr.x < -cfg.w ||
        pr.x > WORLD.w + cfg.w ||
        pr.y < -cfg.h ||
        pr.y > WORLD.h + cfg.h;
      if (expired) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const hit = this.projectileHit(pr, cfg);
      if (!hit) continue;

      this.projectiles.splice(i, 1);
      const projectileMeta = {
        cause: pr.kind === 'sun_fire' ? 'sunFire' : pr.kind === 'harpoon' ? 'harpoon' : 'axeThrow',
        abilityId: pr.kind === 'sun_fire' ? 'sunFire' : pr.kind === 'harpoon' ? 'lasso' : 'axeThrow',
        range: round(traveled),
        longRange: traveled >= cfg.maxRange * LONG_RANGE_FRAC,
        strength: pr.strength ? round(pr.strength) : 0,
        fullCharge: (pr.strength ?? 0) >= FULL_CHARGE_FRAC,
      };

      if (this.negateIncomingAttack(hit, source, t, projectileMeta)) continue;

      // Harpunen skadar inte bara - den satter kroken och slapar in offret.
      if (pr.kind === 'harpoon') {
        this.harpoonConnect(hit, source, pr, cfg, t);
        continue;
      }

      const dmg = randInt(cfg.damageMin, cfg.damageMax);
      const hitFx =
        pr.kind === 'sun_fire'
          ? { k: 'sun_fire_hit', x: pr.x, y: pr.y, team: pr.team, s: pr.strength ?? 0 }
          : { k: 'axe_hit', id: hit.id, by: pr.ownerId, pr: pr.id, x: pr.x, y: pr.y, team: pr.team };
      this.fx.push(hitFx);
      this.damage(hit, source, dmg, Math.sign(pr.vx) * cfg.knockbackX, cfg.knockbackY, t, projectileMeta);
    }
  }

  projectileHit(pr, cfg) {
    const box = sweptProjectileBox(pr, cfg);
    let target = null;
    let shielded = null;
    let best = Infinity;

    for (const o of this.players.values()) {
      if (o.team === pr.team || o.dead) continue;
      if (!overlaps(box, { x: o.x, y: o.y, w: PLAYER.w, h: PLAYER.h })) continue;

      const d = Math.hypot(o.x + PLAYER.w / 2 - pr.px, o.y + PLAYER.h / 2 - pr.py);
      if (this.now() < o.invulnUntil) {
        if (d < best) {
          best = d;
          shielded = o;
        }
        continue;
      }
      if (d < best) {
        best = d;
        target = o;
      }
    }
    return target ?? shielded;
  }

  // ----------------------------------------------------------------- powerups

  /** Spawnar nya powerups i takt och delar ut effekten till den som springer in. */
  updatePowerups(t) {
    while (t >= this.nextPowerupAt) {
      if (this.powerups.length < POWERUP.maxActive) this.spawnPowerup();
      this.nextPowerupAt += POWERUP.spawnIntervalMs;
    }

    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      const box = { x: pu.x - POWERUP.w / 2, y: pu.y - POWERUP.h / 2, w: POWERUP.w, h: POWERUP.h };
      for (const p of this.players.values()) {
        if (p.dead || !this.wantsPowerup(p, pu)) continue;
        if (!overlaps(box, { x: p.x, y: p.y, w: PLAYER.w, h: PLAYER.h })) continue;
        this.applyPowerup(p, pu, t);
        this.powerups.splice(i, 1);
        break;
      }
    }
  }

  /** Pizzan sparas at nagon skadad; kebaben plockas alltid (och laddar om tiden). */
  wantsPowerup(p, pu) {
    if (pu.kind === 'kebab') return true;
    return p.hp < PLAYER.maxHp;
  }

  applyPowerup(p, pu, t) {
    const hpBefore = p.hp;
    if (pu.kind === 'kebab') {
      p.dmgBuffUntil = t + DAMAGE_BUFF.durationMs;
      this.fx.push({ k: 'kebab', id: p.id, x: pu.x, y: pu.y });
      p.stats.powerups++;
      this.stat('powerup', {
        player: this.playerRef(p),
        kind: pu.kind,
        spawn: pu.spawn,
        x: pu.x,
        y: pu.y,
        hpBefore: Math.round(hpBefore),
        hpAfter: Math.round(p.hp),
        lowHp: hpBefore <= PLAYER.maxHp * LOW_HP_FRAC,
        center: isCenterPowerup(pu),
        durationMs: DAMAGE_BUFF.durationMs,
      });
      return;
    }
    p.hp = Math.min(PLAYER.maxHp, p.hp + POWERUP.heal);
    this.fx.push({ k: 'pizza', id: p.id, x: pu.x, y: pu.y });
    p.stats.powerups++;
    this.stat('powerup', {
      player: this.playerRef(p),
      kind: pu.kind,
      spawn: pu.spawn,
      x: pu.x,
      y: pu.y,
      hpBefore: Math.round(hpBefore),
      hpAfter: Math.round(p.hp),
      healed: Math.round(p.hp - hpBefore),
      lowHp: hpBefore <= PLAYER.maxHp * LOW_HP_FRAC,
      center: isCenterPowerup(pu),
    });
  }

  /** Valjer en ledig spawnpunkt sa att tva powerups aldrig hamnar pa samma stalle. */
  spawnPowerup() {
    const taken = new Set(this.powerups.map((p) => p.spawn));
    const free = this.powerupSpawns.map((_, i) => i).filter((i) => !taken.has(i));
    if (!free.length) return;
    const idx = free[Math.floor(Math.random() * free.length)];
    const pt = this.powerupSpawns[idx];
    const kind = POWERUP_KIND_IDS[Math.floor(Math.random() * POWERUP_KIND_IDS.length)];
    this.powerups.push({ id: this.nextPowerupId++, kind, spawn: idx, x: pt.x, y: pt.y });
  }

  recordHistory(p, t) {
    const h = p.history;
    h.push({ t, x: p.x, y: p.y });
    while (h.length > 1 && t - h[0].t > LAGCOMP.historyMs) h.shift();
  }

  /** Var spelaren stod vid en given tidpunkt. Grunden i traffkontrollen. */
  positionAt(p, when) {
    const h = p.history;
    if (!h.length) return { x: p.x, y: p.y };
    if (when >= h[h.length - 1].t) return { x: p.x, y: p.y };
    if (when <= h[0].t) return { x: h[0].x, y: h[0].y };

    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1];
      if (when < a.t) continue;
      const b = h[i];
      const span = b.t - a.t;
      const k = span > 0 ? (when - a.t) / span : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    return { x: h[0].x, y: h[0].y };
  }

  movePlayer(p, t) {
    const dashing = t < p.dashUntil;
    const charging = t < p.chargeUntil;
    const stunned = t < p.stunnedUntil;
    // Reprisen satter farten mot fangaren och gar fore allt annat: den som
    // slapas in kan varken springa emot eller bromsas av stun-friktionen.
    const pulled = t < p.pulledUntil && this.applyPull(p, t);
    const locked = dashing || charging || stunned || pulled;

    if (pulled) {
      // applyPull har redan satt vx och facing mot fangaren - ror dem inte.
    } else if (!locked) {
      const dir = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      const channelMul = p.channel?.id === 'sunFire' ? ABILITY_TUNING.sunFire.moveSpeedMul : 1;
      const speedMul = channelMul * (p.speedMul ?? 1);
      const maxSpeed = PLAYER.maxSpeed * speedMul;
      if (dir !== 0) {
        p.vx += dir * PLAYER.accel * speedMul;
        p.vx = Math.max(-maxSpeed, Math.min(maxSpeed, p.vx));
        p.facing = dir;
      } else {
        p.vx *= p.onGround ? PLAYER.groundFriction : PLAYER.airFriction;
        if (Math.abs(p.vx) < 0.05) p.vx = 0;
      }
    } else if (stunned) {
      p.vx *= p.onGround ? 0.5 : 0.88;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }

    if (!p.slamming) {
      p.vy += PLAYER.gravity;
      if (p.vy > PLAYER.maxFall) p.vy = PLAYER.maxFall;
    }

    // X
    p.x += p.vx;
    if (p.x < 0) {
      p.x = 0;
      p.vx = 0;
    }
    if (p.x + PLAYER.w > WORLD.w) {
      p.x = WORLD.w - PLAYER.w;
      p.vx = 0;
    }

    // Y - alla plattformar ar one-way, man landar bara uppifran
    const prevBottom = p.y + PLAYER.h;
    p.y += p.vy;
    const bottom = p.y + PLAYER.h;
    p.onGround = false;

    if (p.vy >= 0) {
      for (const pl of this.layout.platforms) {
        if (!this.overlapsPlatformX(p, pl)) continue;
        if (this.ignoresLandingOn(p, pl, t, prevBottom)) continue;
        if (prevBottom <= pl.y + 0.5 && bottom >= pl.y) {
          p.y = pl.y - PLAYER.h;
          p.vy = 0;
          p.onGround = true;
          this.clearDropThrough(p);
          if (p.slamming) this.landSlam(p, t);
          break;
        }
      }
    }

    this.clearDropThroughIfDone(p);

    if (p.y > WORLD.h + 200) {
      this.kill(p, p.lastHitBy && t - p.lastHitAt < 5000 ? p.lastHitBy : 0);
    }
  }

  landSlam(p, t) {
    p.slamming = false;
    const cfg = ABILITY_TUNING.slam;
    const cx = p.x + PLAYER.w / 2;
    const cy = p.y + PLAYER.h;
    this.fx.push({ k: 'slam', id: p.id, x: cx, y: cy, r: cfg.radius, team: p.team });

    for (const o of this.players.values()) {
      if (o.id === p.id || o.team === p.team || o.dead) continue;
      const ox = o.x + PLAYER.w / 2;
      const oy = o.y + PLAYER.h / 2;
      const d = Math.hypot(ox - cx, oy - cy);
      if (d > cfg.radius) continue;
      const dir = ox < cx ? -1 : 1;
      const meta = { cause: 'slam', abilityId: 'slam', range: round(d) };
      if (this.negateIncomingAttack(o, p, t, meta)) continue;
      this.damage(o, p, cfg.damage, dir * cfg.knockbackX, cfg.knockbackY, t, meta);
    }
  }

  /**
   * Slaget landar. Traffytan och tidpunkten bestamdes redan nar tangenten
   * trycktes, sa det som avgors har ar bara vem som stod i vagen - matt pa
   * angriparens bild av spelet, inte pa nuet.
   */
  resolveSwing(p, t) {
    const s = p.swing;
    if (!s || t < s.resolveAt) return;
    p.swing = null;

    const cx = s.box.x + s.box.w / 2;
    let target = null;
    let bestDist = Infinity;
    let shielded = null;

    for (const o of this.players.values()) {
      if (o.id === p.id || o.team === p.team || o.dead) continue;
      const at = this.positionAt(o, s.viewTime);
      if (!overlaps(s.box, { x: at.x, y: at.y, w: PLAYER.w, h: PLAYER.h })) continue;

      // Nyss respawnad motstandare gar inte att skada. Visa det i stallet for
      // att sluka slaget tyst - annars ser det ut som en missad traff.
      if (t < o.invulnUntil || o.shieldCharges > 0) {
        shielded = o;
        continue;
      }
      const d = Math.abs(at.x + PLAYER.w / 2 - cx);
      if (d < bestDist) {
        bestDist = d;
        target = o;
      }
    }

    if (target) {
      // Kedjan raknas forst - blev det har slaget finishern i en combo far det
      // sin bonus innan resten av multiplikatorerna laggs pa i damage().
      const combo = this.advanceCombo(p, s.slot, t);
      let amount = this.rollDamage(MELEE.damageMin, MELEE.damageMax);
      let kx = p.facing * MELEE.knockbackX;
      let ky = MELEE.knockbackY;

      if (combo) {
        amount = Math.round(amount * combo.finisherMul);
        if (combo.knockback) {
          kx = p.facing * combo.knockback.x;
          ky = combo.knockback.y;
        }
        this.finisherEffects(p, target, combo, t);
      }
      const meleeAudio = this.meleeAudioMeta(p, s.slot, combo, t);
      const hitMeta = {
        cause: 'melee',
        meleeSlot: s.slot,
        comboId: combo?.id ?? null,
        comboName: combo?.name ?? null,
        comboStep: meleeAudio.comboStep,
        axeStep: meleeAudio.axeStep,
      };
      this.damage(target, p, amount, kx, ky, t, hitMeta);
      if (combo) this.noteCombo(p, target, combo, t, target.dead);
      // Blev finishern en dodsstot gar angriparen in i ursinne. Kollas efter
      // damage() - da har target.dead just satts om slaget tog livet av offret.
      if (combo && target.dead) this.enrage(p, t);
      return;
    }

    // Bommat eller blockerat slag - kedjan borjar om.
    this.breakCombo(p);
    if (shielded) this.negateIncomingAttack(shielded, p, t, { cause: 'melee', meleeSlot: s.slot });
  }

  // ----------------------------------------------------------------- combos

  /**
   * Allt utom skadan som en finisher gor. Skadan sjalv delas ut direkt efterat
   * av resolveSwing - offret ar redan bortsorterat om det ar oskadbart, sa det
   * som gors har kan inte hamna i tomma luften.
   */
  finisherEffects(p, target, combo, t) {
    if (combo.stunMs) {
      this.stun(target, combo.stunMs, t, { source: p, cause: `combo:${combo.id}` });
      this.fx.push({ k: 'stun', id: target.id, x: target.x + PLAYER.w / 2, y: target.y + PLAYER.h * 0.18 });
    }

    if (combo.healSelf && p.hp < PLAYER.maxHp) {
      p.hp = Math.min(PLAYER.maxHp, p.hp + combo.healSelf);
      this.fx.push({ k: 'heal', id: p.id, x: p.x + PLAYER.w / 2, y: p.y + PLAYER.h / 2 });
    }

    // Melee redo direkt: kedjan nollstalls anda, sa det ar nasta kedja man far
    // borja pa - inte en gratis finisher till.
    if (combo.refundCooldown) for (const slot of MELEE_SLOTS) p.cd[slot] = t;

    this.fx.push({
      k: 'combo',
      // Offrets id, precis som 'hit': da fordrojs effekten lika mycket som
      // kroppen den ska sitta pa. Angriparen skickas med separat sa att bada
      // tva kan fa den fulla smallen pa sin skarm.
      id: target.id,
      by: p.id,
      x: target.x + PLAYER.w / 2,
      y: target.y + PLAYER.h / 2,
      team: p.team,
      name: combo.name,
      up: combo.knockback && combo.knockback.y < MELEE.knockbackY ? 1 : 0, // kastad uppat
    });
  }

  noteCombo(p, target, combo, t, killed) {
    p.stats.comboFinishers = (p.stats.comboFinishers ?? 0) + 1;
    this.stat('combo', {
      player: this.playerRef(p),
      target: this.playerRef(target),
      comboId: combo.id,
      comboName: combo.name,
      length: combo.seq.length,
      exact: !!combo.exact,
      killed: !!killed,
      healed: combo.healSelf ?? 0,
      refundedCooldown: !!combo.refundCooldown,
      launched: !!(combo.knockback && combo.knockback.y < MELEE.knockbackY),
    });
  }

  meleeAudioMeta(p, slot, combo, t) {
    const progress = combo ? { steps: combo.seq.length, seq: combo.seq } : this.comboProgress(p, t);
    const seq = combo ? combo.seq : progress ? COMBO.list[progress.index]?.seq.slice(0, progress.steps) : [slot];
    return {
      comboStep: progress?.steps ?? 1,
      axeStep: slot === 'm1' ? Math.min(3, seq.filter((item) => item === 'm1').length || 1) : 0,
    };
  }

  meleeSwingAudioMeta(p, slot, t) {
    const recent = p.comboSeq.length && t - p.comboAt <= COMBO.windowMs ? [...p.comboSeq] : [];
    recent.push(slot);
    if (recent.length > COMBO_MAX_LEN) recent.splice(0, recent.length - COMBO_MAX_LEN);

    let best = null;
    for (let i = 0; i < COMBO.list.length; i++) {
      const combo = COMBO.list[i];
      const steps = matchedSteps(recent, combo.seq);
      if (!steps) continue;
      const left = combo.seq.length - steps;
      if (!best || steps > best.steps || (steps === best.steps && left < best.left)) best = { index: i, steps, left };
    }

    const seq = best ? COMBO.list[best.index].seq.slice(0, best.steps) : [slot];
    return {
      comboStep: best?.steps ?? 1,
      axeStep: slot === 'm1' ? Math.min(3, seq.filter((item) => item === 'm1').length || 1) : 0,
    };
  }

  /**
   * Lagger till en landad traff i spelarens kedja. Returnerar combon om just
   * det har slaget avslutade en - da ar slaget finishern.
   */
  advanceCombo(p, slot, t) {
    if (!slot) {
      this.breakCombo(p);
      return null;
    }
    // For lang paus sedan forra traffen: kedjan hann rinna ut.
    if (p.comboSeq.length && t - p.comboAt > COMBO.windowMs) p.comboSeq.length = 0;

    p.comboSeq.push(slot);
    p.comboAt = t;
    if (p.comboSeq.length > COMBO_MAX_LEN) p.comboSeq.splice(0, p.comboSeq.length - COMBO_MAX_LEN);

    // Skulle tva combos ga av pa samma slag vinner den langsta - den var svarast
    // att fa till.
    let done = null;
    for (const combo of COMBO.list) {
      if (matchedSteps(p.comboSeq, combo.seq) !== combo.seq.length) continue;
      if (!done || combo.seq.length > done.seq.length) done = combo;
    }
    if (done) {
      const exact = p.comboSeq.length === done.seq.length && matchedSteps(p.comboSeq, done.seq) === done.seq.length;
      this.breakCombo(p); // klart - nasta slag borjar en ny kedja
      return { ...done, exact };
    }
    return null;
  }

  breakCombo(p) {
    p.comboSeq.length = 0;
    p.comboAt = 0;
  }

  /**
   * Ursinne: angriparen blir enraged och delar ut ENRAGE.mul mer skada i
   * ENRAGE.durationMs. En ny combo-dodsstot laddar om tiden. Global buff -
   * galler bada lagen, raknas in i damage() och forsvinner nar man dor.
   */
  enrage(p, t) {
    p.rageUntil = t + ENRAGE.durationMs;
    this.fx.push({ k: 'enrage', id: p.id, x: p.x + PLAYER.w / 2, y: p.y + PLAYER.h / 2, team: p.team });
    this.stat('enrage', {
      player: this.playerRef(p),
      durationMs: ENRAGE.durationMs,
    });
  }

  /**
   * Vilken combo HUD:en ska visa just nu: den som sitter langst in, och vid
   * lika den som har minst kvar till sin finisher.
   */
  comboProgress(p, t) {
    if (!p.comboSeq.length || t - p.comboAt > COMBO.windowMs) return null;

    let best = null;
    for (let i = 0; i < COMBO.list.length; i++) {
      const combo = COMBO.list[i];
      const steps = matchedSteps(p.comboSeq, combo.seq);
      if (!steps) continue;
      const left = combo.seq.length - steps;
      if (!best || steps > best.steps || (steps === best.steps && left < best.left)) {
        best = { index: i, steps, left };
      }
    }
    return best && { index: best.index, steps: best.steps };
  }

  resolveCharge(p, t) {
    if (!p.chargeHits) return;
    if (t < p.stunnedUntil) {
      p.chargeUntil = 0;
      p.chargeHits = null;
      p.chargeType = null;
      return;
    }
    if (t > p.chargeUntil) {
      p.chargeHits = null;
      p.chargeType = null;
      return;
    }
    const shield = p.chargeType === 'shield';
    const cfg = shield ? ABILITY_TUNING.shieldCharge : ABILITY_TUNING.charge;
    const box = shield ? shieldChargeBox(p, cfg) : { x: p.x, y: p.y, w: PLAYER.w, h: PLAYER.h };

    for (const o of this.players.values()) {
      if (o.team === p.team || o.dead || p.chargeHits.has(o.id)) continue;
      if (!overlaps(box, { x: o.x, y: o.y, w: PLAYER.w, h: PLAYER.h })) continue;
      p.chargeHits.add(o.id);
      const damage = shield ? randInt(cfg.damageMin, cfg.damageMax) : cfg.damage;
      const meta = { cause: shield ? 'shieldCharge' : 'charge', abilityId: shield ? 'shieldCharge' : 'charge' };
      if (shield) {
        if (this.negateIncomingAttack(o, p, t, meta)) {
          p.chargeUntil = 0;
          p.chargeHits = null;
          p.chargeType = null;
          p.vx *= 0.35;
          break;
        }
        this.stun(o, cfg.stunMs, t, { source: p, cause: 'shieldCharge' });
        this.damage(o, p, damage, p.facing * cfg.knockbackX, cfg.knockbackY, t, meta);
        this.fx.push({ k: 'stun', id: o.id, x: o.x + PLAYER.w / 2, y: o.y + PLAYER.h * 0.18 });
        p.chargeUntil = 0;
        p.chargeHits = null;
        p.chargeType = null;
        p.vx *= 0.35;
        break;
      }
      this.damage(o, p, damage, p.facing * cfg.knockbackX, cfg.knockbackY, t, meta);
    }

  }

  negateIncomingAttack(target, source, t, meta = {}) {
    if (target.dead) return true;
    if (t < target.invulnUntil) {
      this.fx.push({ k: 'block', id: target.id, x: target.x + PLAYER.w / 2, y: target.y + PLAYER.h / 2 });
      this.stat('protected_hit', {
        player: this.playerRef(source),
        target: this.playerRef(target),
        cause: meta.cause ?? 'unknown',
        abilityId: meta.abilityId ?? null,
      });
      return true;
    }
    if (!source || source.team === target.team || target.shieldCharges <= 0) return false;

    target.shieldCharges--;
    target.shieldSetBlocks++;
    this.fx.push({
      k: 'power_shield_hit',
      id: target.id,
      x: target.x + PLAYER.w / 2,
      y: target.y + PLAYER.h / 2,
      team: target.team,
      left: target.shieldCharges,
    });
    this.stat('shield_block', {
      player: this.playerRef(target),
      source: this.playerRef(source),
      cause: meta.cause ?? 'unknown',
      abilityId: meta.abilityId ?? null,
      blocksInSet: target.shieldSetBlocks,
      fullSet: target.shieldSetBlocks >= ABILITY_TUNING.powerShield.charges,
      left: target.shieldCharges,
    });
    return true;
  }

  // Slumpad skada i [min, max] via den seedbara rng:n, sa att tester kan pinna
  // utfallet. Rullas bara nar ett slag faktiskt landar - blockerade och bommade
  // slag konsumerar ingen slump.
  rollDamage(min, max) {
    return Math.floor(min + this.rng() * (max - min + 1));
  }

  damage(target, source, amount, kx, ky, t, meta = {}) {
    if (!source) return;
    if (this.negateIncomingAttack(target, source, t, meta)) return;

    const hpBefore = target.hp;
    const targetWasStunned = t < target.stunnedUntil;
    const sourceHadKebab = t < source.dmgBuffUntil;
    const sourceHadEnrage = t < source.rageUntil;
    const sourceHadBerserk = t < source.berserkUntil;
    const targetHadBerserk = t < target.berserkUntil;
    const retaliation = source.lastHitBy === target.id && t - source.lastHitAt <= RECENT_HIT_MS;

    // Kebab-buffen: allt angriparen delar ut gor 15% mer skada sa lange den varar.
    if (sourceHadKebab) amount = Math.round(amount * DAMAGE_BUFF.mul);

    // Combo-ursinnet: en combo-dodsstot gor angriparen enraged - all utdelad
    // skada okar en kort stund. Global buff, staplas ovanpa kebaben.
    if (sourceHadEnrage) amount = Math.round(amount * ENRAGE.mul);

    // Flugsvampen: den som ar berserk slar hardare - och tar mer stryk sjalv.
    const berserk = ABILITY_TUNING.mushrooms;
    if (sourceHadBerserk) amount = Math.round(amount * berserk.dealtMul);
    if (targetHadBerserk) amount = Math.round(amount * berserk.takenMul);

    // Traff i ryggen (angriparen ar pa targetens baksida) gor extra skada.
    const fromBehind = (source.x - target.x) * target.facing < 0;
    if (fromBehind) amount = Math.round(amount * BACKSTAB.mul);

    // Kritisk traff sist av allt, sa att den forstarker allt annat.
    const crit = this.rng() < CRIT.chance;
    if (crit) amount = Math.round(amount * CRIT.mul);

    target.hp -= amount;
    const hpAfter = Math.max(0, target.hp);
    const actualDamage = Math.max(0, Math.min(hpBefore, amount));
    const killed = target.hp <= 0;
    const buffCount = [sourceHadKebab, sourceHadEnrage, sourceHadBerserk].filter(Boolean).length;
    const quickDamage = t - this.startedAt <= QUICK_DAMAGE_MS;
    const harpoonSetupKill = killed && target.lastHarpoonedBy === source.id && t - target.lastHarpoonedAt <= HARPOON_SETUP_MS;

    source.stats.hits++;
    source.stats.damageDealt += actualDamage;
    if (crit) source.stats.critHits++;
    if (fromBehind) source.stats.backstabHits++;
    if (!source.stats.firstDamageAt) source.stats.firstDamageAt = t;
    if (quickDamage) source.stats.quickDamageHits++;
    target.stats.damageTaken += actualDamage;

    target.vx = kx;
    target.vy = ky;
    target.onGround = false;
    target.slamming = false;
    target.lastHitBy = source.id;
    target.lastHitAt = t;

    this.fx.push({
      k: 'hit',
      id: target.id,
      by: source.id,
      x: target.x + PLAYER.w / 2,
      y: target.y + PLAYER.h / 2,
      f: Math.sign(kx) || 1,
      team: source.team,
      dmg: amount, // klienten visar siffran sa att man ser att traffen gick fram
      cr: crit ? 1 : 0,
      cause: meta.cause ?? 'unknown',
      abilityId: meta.abilityId ?? null,
      meleeSlot: meta.meleeSlot ?? null,
      comboId: meta.comboId ?? null,
      comboName: meta.comboName ?? null,
      comboStep: meta.comboStep ?? 0,
      axeStep: meta.axeStep ?? 0,
    });

    this.stat('hit', {
      player: this.playerRef(source),
      target: this.playerRef(target),
      cause: meta.cause ?? 'unknown',
      abilityId: meta.abilityId ?? null,
      meleeSlot: meta.meleeSlot ?? null,
      amount,
      actualDamage,
      hpBefore: Math.round(hpBefore),
      hpAfter: Math.round(hpAfter),
      killed,
      crit,
      backstab: fromBehind,
      targetWasStunned,
      targetStunnedBy: target.stunnedBy,
      targetStunnedCause: target.stunnedCause,
      sourceHadKebab,
      sourceHadEnrage,
      sourceHadBerserk,
      targetHadBerserk,
      buffStack: buffCount >= 2,
      retaliation,
      quickDamage,
      surviveUnder10Hp: !killed && hpAfter <= 10,
      lowHpKill: killed && source.hp <= 10,
      harpoonSetupKill,
      range: meta.range ?? 0,
      longRange: !!meta.longRange,
      strength: meta.strength ?? 0,
      fullCharge: !!meta.fullCharge,
      comboId: meta.comboId ?? null,
      comboName: meta.comboName ?? null,
    });

    if (killed) {
      this.kill(target, source.id, {
        cause: meta.cause ?? 'unknown',
        abilityId: meta.abilityId ?? null,
        meleeSlot: meta.meleeSlot ?? null,
        targetWasStunned,
        targetStunnedBy: target.stunnedBy,
        targetStunnedCause: target.stunnedCause,
        sourceHadKebab,
        sourceHadEnrage,
        sourceHadBerserk,
        targetHadBerserk,
        retaliation,
        lowHpKill: source.hp <= 10,
        harpoonSetupKill,
        comboId: meta.comboId ?? null,
        comboName: meta.comboName ?? null,
      });
    }
  }

  kill(victim, killerId, meta = {}) {
    if (victim.dead) return;
    const t = this.now();
    const victimHadBerserk = t < victim.berserkUntil;
    victim.dead = true;
    victim.hp = 0;
    victim.deaths++;
    victim.stats.deaths++;
    victim.respawnAt = this.now() + PLAYER.respawnMs;
    victim.slamming = false;
    victim.swing = null;
    victim.stunnedUntil = 0;
    victim.channel = null;

    const killer = killerId ? this.players.get(killerId) : null;
    this.fx.push({ k: 'death', id: victim.id, x: victim.x + PLAYER.w / 2, y: victim.y + PLAYER.h / 2, team: victim.team });

    if (killer && killer.team !== victim.team) {
      killer.kills++;
      killer.stats.kills++;
      this.score[killer.team]++;
    }
    const credited = !!(killer && killer.team !== victim.team);
    const firstInMatch = credited && !this.firstKillDone;
    if (firstInMatch) this.firstKillDone = true;
    this.feed.push({
      killer: killer ? killer.name : null,
      killerTeam: killer ? killer.team : null,
      killerProfileId: killer ? killer.profileId : 0,
      cause: meta.cause ?? null,
      abilityId: meta.abilityId ?? null,
      meleeSlot: meta.meleeSlot ?? null,
      comboId: meta.comboId ?? null,
      victim: victim.name,
      victimTeam: victim.team,
      victimProfileId: victim.profileId ?? 0,
    });
    this.stat('kill', {
      player: this.playerRef(killer),
      victim: this.playerRef(victim),
      credited,
      firstInMatch,
      cause: meta.cause ?? 'unknown',
      abilityId: meta.abilityId ?? null,
      targetWasStunned: !!meta.targetWasStunned,
      targetStunnedBy: meta.targetStunnedBy ?? 0,
      targetStunnedCause: meta.targetStunnedCause ?? '',
      sourceHadKebab: !!meta.sourceHadKebab,
      sourceHadEnrage: !!meta.sourceHadEnrage,
      sourceHadBerserk: !!meta.sourceHadBerserk,
      victimHadBerserk,
      retaliation: !!meta.retaliation,
      lowHpKill: !!meta.lowHpKill,
      harpoonSetupKill: !!meta.harpoonSetupKill,
      comboId: meta.comboId ?? null,
      comboName: meta.comboName ?? null,
    });
  }

  // ------------------------------------------------------------- ognapsbild

  snapshot() {
    const t = this.now();
    const players = [];
    for (const p of this.players.values()) {
      const combo = p.dead ? null : this.comboProgress(p, t);
      players.push({
        i: p.id,
        n: p.name,
        tm: p.team,
        x: round(p.x),
        y: round(p.y),
        vx: round(p.vx),
        vy: round(p.vy),
        f: p.facing,
        hp: Math.max(0, Math.round(p.hp)),
        d: p.dead ? 1 : 0,
        g: p.onGround ? 1 : 0,
        sw: p.swingUntil > t ? 1 : 0,
        iv: p.invulnUntil > t ? 1 : 0,
        sl: p.slamming ? 1 : 0,
        st: p.stunnedUntil > t ? 1 : 0,
        gb: p.pulledUntil > t ? p.pulledBy : 0, // slapas in av harpun: id pa den som drar
        ps: p.shieldCharges,
        sc: p.chargeType === 'shield' && p.chargeUntil > t ? 1 : 0,
        ds: p.dashUntil > t || p.chargeUntil > t ? 1 : 0,
        db: Math.max(0, Math.round(p.dmgBuffUntil - t)), // ms kvar pa kebab-buffen, 0 = ingen
        bz: Math.max(0, Math.round(p.berserkUntil - t)), // ms kvar pa flugsvampen, 0 = nykter
        rg: Math.max(0, Math.round(p.rageUntil - t)), // ms kvar pa combo-ursinnet, 0 = lugn
        sf: p.channel?.id === 'sunFire' ? Math.max(0.01, clamp((t - p.channel.started) / ABILITY_TUNING.sunFire.channelMaxMs, 0, 1)) : 0,
        cb: combo ? combo.index : -1, // pagaende combo, index i COMBO.list
        cs: combo ? combo.steps : 0, // hur manga steg som sitter
        cw: combo ? Math.max(0, Math.round(p.comboAt + COMBO.windowMs - t)) : 0, // ms kvar att fortsatta
        k: p.kills,
        de: p.deaths,
        rs: p.dead ? Math.max(0, p.respawnAt - t) : 0,
        cd: cooldownSnapshot(p, t),
      });
    }

    const pu = this.powerups.map((p) => ({ i: p.id, x: p.x, y: p.y, k: p.kind }));
    const pr = this.projectiles.map((p) => ({
      i: p.id,
      k: p.kind ?? 'axe',
      o: p.ownerId,
      tm: p.team,
      x: round(p.x),
      y: round(p.y),
      vx: round(p.vx),
      vy: round(p.vy),
      f: p.f,
      a: round(p.angle),
      w: p.w ? round(p.w) : undefined,
      h: p.h ? round(p.h) : undefined,
      s: p.strength ? round(p.strength) : undefined,
    }));
    const snap = { t: 'state', tick: this.tick, players, score: this.score, fx: this.fx, feed: this.feed, events: this.events, pu, pr };
    this.fx = [];
    this.feed = [];
    this.events = [];
    return snap;
  }

  teamCounts() {
    const counts = { cleo: 0, viking: 0 };
    for (const p of this.players.values()) counts[p.team]++;
    return counts;
  }

  /** Lag med farre spelare, for "auto"-valet i lobbyn. */
  suggestTeam() {
    const c = this.teamCounts();
    if (c.cleo === c.viking) return TEAM_IDS[Math.floor(Math.random() * 2)];
    return c.cleo < c.viking ? 'cleo' : 'viking';
  }
}

/**
 * Traffytan for ett slag. Stracker sig MELEE.reach framat fran kroppens mitt -
 * ungefar sa langt som yxan syns na - och bakat till egen bakkant, sa att nagon
 * som star mitt ovanpa en alltid raknas. Hojden ar hela kroppen: traffar man
 * kroppen sa traffar man.
 */
function meleeBox(x, y, facing) {
  const cx = x + PLAYER.w / 2;
  const front = cx + facing * MELEE.reach;
  const back = cx - facing * (PLAYER.w / 2);
  return {
    x: Math.min(front, back),
    y: y + (PLAYER.h - MELEE.height) / 2,
    w: Math.abs(front - back),
    h: MELEE.height,
  };
}

function sweptProjectileBox(pr, cfg) {
  const halfW = cfg.w / 2;
  const halfH = cfg.h / 2;
  return {
    x: Math.min(pr.px, pr.x) - halfW,
    y: Math.min(pr.py, pr.y) - halfH,
    w: Math.abs(pr.x - pr.px) + cfg.w,
    h: Math.abs(pr.y - pr.py) + cfg.h,
  };
}

function projectileConfig(pr) {
  const base =
    pr.kind === 'sun_fire' ? ABILITY_TUNING.sunFire : pr.kind === 'harpoon' ? ABILITY_TUNING.lasso : ABILITY_TUNING.axeThrow;
  return {
    lifeMs: pr.lifeMs ?? base.lifeMs,
    maxRange: pr.maxRange ?? base.maxRange,
    w: pr.w ?? base.w,
    h: pr.h ?? base.h,
    damageMin: pr.damageMin ?? base.damageMin,
    damageMax: pr.damageMax ?? base.damageMax,
    knockbackX: pr.knockbackX ?? base.knockbackX,
    knockbackY: pr.knockbackY ?? base.knockbackY,
    rotationSpeed: pr.rotationSpeed ?? base.rotationSpeed ?? 0,
  };
}

function isCenterPowerup(pu) {
  return Math.abs(pu.x - WORLD.w / 2) <= 90 && Math.abs(pu.y - WORLD.h / 2) <= 360;
}

function shieldChargeBox(p, cfg) {
  const cx = p.x + PLAYER.w / 2;
  const front = cx + p.facing * cfg.hitW;
  const back = cx - p.facing * (PLAYER.w / 2);
  return {
    x: Math.min(front, back),
    y: p.y + (PLAYER.h - cfg.hitH) / 2,
    w: Math.abs(front - back),
    h: cfg.hitH,
  };
}

function inSandCone(x, y, cx, cy, facing, cfg) {
  const forward = (x - cx) * facing;
  if (forward < 0 || forward > cfg.range) return false;
  const k = forward / cfg.range;
  const halfH = cfg.nearHalfHeight + (cfg.farHalfHeight - cfg.nearHalfHeight) * k;
  return Math.abs(y - cy) <= halfH;
}

/**
 * Hur manga steg av combon som sitter just nu. Matchar bakifran: de senaste
 * traffarna jamfors mot combons borjan, sa att en kedja som inleds med nagra
 * "fel" slag anda kan bli en combo langre fram.
 */
function matchedSteps(recent, seq) {
  for (let k = Math.min(recent.length, seq.length); k > 0; k--) {
    let ok = true;
    for (let i = 0; i < k; i++) {
      if (recent[recent.length - k + i] !== seq[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return k;
  }
  return 0;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function round(v) {
  return Math.round(v * 100) / 100;
}

const TRAINING_BOT_NAME = 'Training dummy';

/** Bandet mitt pa kartan som traningsdockan patrullerar i. */
function patrolBand(widthFrac) {
  const width = clamp(widthFrac, 0.1, 1) * WORLD.w;
  const half = width / 2;
  const center = WORLD.w / 2;
  return {
    minX: Math.max(0, center - half),
    maxX: Math.min(WORLD.w - PLAYER.w, center + half),
    dir: 1,
  };
}

function cooldownSnapshot(p, t) {
  const out = {};
  for (const slot of ACTION_SLOTS) {
    const left = Math.max(0, Math.round(p.cd[slot] - t));
    if (left > 0) out[slot] = left;
  }
  return out;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
