import {
  WORLD,
  PLAYER,
  MAP,
  TEAMS,
  SPRITE_ANIM,
  POWERUP,
  POWERUP_KINDS,
  DAMAGE_BUFF,
  ENRAGE,
  ABILITY_TUNING,
} from '/shared/constants.js';

// Lag som har riktig sprite-grafik. Ovriga ritas med de inbyggda figurerna.
const SPRITE_SETS = { viking: '/assets/viking', cleo: '/assets/cleo' };
const DEFAULT_ARENA_ASSET = '/assets/arena_nordic.png';

// Namnskylten: namnet overst, halsomataren under. Matten ar ~30 % storre an
// forsta versionen sa att den gar att lasa nar hela kartan ar nedskalad.
const PLATE = {
  height: 26, // total hojd, styr hur hogt over figuren skylten hamnar
  gap: 8, // luft mellan skylt och figur
  nameBaseline: 13,
  font: '700 16px "Segoe UI", system-ui, sans-serif',
  barTop: 18,
  barW: 55,
  barH: 8,
};

// Halsomatarens eftersladdning: hur snabbt den vita resten krymper (andel/s)
// och hur lange den star still forst.
const HP_TRAIL = { holdMs: 280, drainPerSec: 0.9 };

// Plattformsmarkering. Arenabilden ar detaljrik och dess ledger ligger inte
// alltid dar kollisionen ligger, sa varje gabar yta far en egen markering
// ovanpa bakgrunden: ljust sken over ytan, morknad kant under och tydliga
// andmarkeringar sa att man ser var man kan halla pa att ramla av.
const GUIDE = {
  glowUp: 16, // hur hogt skenet over ytan nar
  plateH: 15, // minsta hojd pa den morknade plattan under kanten
  lineW: 4, // tjocklek pa sjalva kantlinjen
  capH: 12, // langd pa andmarkeringarna nedat
  inset: 2, // sa att de rundade andarna hamnar innanfor plattformen
  light: '255,251,235', // varmvit grundton, justeras per karta i renderingen
  pulseMs: 2600, // langsam andning, tillrackligt trog for att inte stora
};

// Finishern i en combo ska kannas. Skylten slar in i bild, skarmen skakar till
// och traffen far ett blixtras - allt hanger pa samma siffror har.
const COMBO_FX = {
  bannerMs: 1200,
  fontPx: 38,
  slamIn: 0.09, // andel av tiden skylten faller in pa
  settle: 0.17, // ... och ar framme och studsar klart
  holdTo: 0.6, // ... star still fram till
  shake: 13, // skarmskak nar man sjalv slog eller tog emot
  shakeOther: 4.5, // ... och nar det var tva andra som gjorde upp
  shakeDecay: 0.86, // per bildruta a 16 ms
  liftHold: 12, // hur hogt skylten dras medan den star still
  liftOut: 40, // ... och nar den tonar bort
  edgePad: 190, // skylten halls innanfor kanterna
  topPad: 74,
};

const SUN_FIRE_CHANNEL_META = {
  worldWidth: 74,
  worldHeight: 74,
  anchorX: 0.34,
  anchorY: 0.91,
  facing: 'right',
};

const SMOKE_STACKS = [
  { x: 255, y: 236, rise: 155, drift: 28, size: 22, alpha: 0.18, speed: 0.00012, phase: 0.2 },
  { x: 1518, y: 120, rise: 175, drift: 34, size: 25, alpha: 0.2, speed: 0.0001, phase: 0.58 },
  { x: 1235, y: 710, rise: 86, drift: 18, size: 16, alpha: 0.14, speed: 0.00016, phase: 0.84 },
];

const BANNERS = [
  { x: 215, y: 348, w: 32, h: 130, tone: '#1c64a4', trim: '#d8f4ff', phase: 0.1 },
  { x: 1103, y: 338, w: 28, h: 106, tone: '#1d6ca8', trim: '#d8f4ff', phase: 1.6 },
  { x: 1418, y: 430, w: 34, h: 146, tone: '#194f91', trim: '#d8f4ff', phase: 2.4 },
];

const WARM_GLOWS = [
  { x: 153, y: 285, r: 58 },
  { x: 213, y: 328, r: 66 },
  { x: 1482, y: 178, r: 76 },
  { x: 1240, y: 735, r: 86 },
  { x: 762, y: 715, r: 38 },
  { x: 909, y: 699, r: 34 },
];

const FOREST_GLOWS = [
  { x: 112, y: 645, r: 68, color: '255,199,73' },
  { x: 450, y: 313, r: 46, color: '255,213,96' },
  { x: 792, y: 544, r: 64, color: '180,255,166' },
  { x: 1165, y: 700, r: 58, color: '255,196,72' },
  { x: 1436, y: 302, r: 52, color: '218,151,255' },
  { x: 1510, y: 690, r: 58, color: '218,151,255' },
];

const FOREST_VINES = [
  { x: 552, y: 188, len: 135, phase: 0.2 },
  { x: 690, y: 188, len: 160, phase: 1.4 },
  { x: 823, y: 188, len: 138, phase: 2.7 },
  { x: 1012, y: 188, len: 118, phase: 3.6 },
  { x: 426, y: 585, len: 120, phase: 1.9 },
  { x: 1180, y: 585, len: 118, phase: 0.8 },
  { x: 1358, y: 300, len: 160, phase: 2.2 },
];

const FOREST_TROLL = {
  sprite: '/assets/deep_forest_troll_walk_8.png',
  columns: 4,
  rows: 2,
  frameSequence: [0, 1, 2, 3, 4, 5, 6, 7],
  frameMs: 160,
  firstDelayMs: 55000,
  firstJitterMs: 35000,
  intervalMs: 5 * 60 * 1000,
  intervalJitterMs: 45000,
  durationMs: 42000,
  scaleMin: 0.43,
  scaleJitter: 0.04,
  leftRoute: { startX: -290, endX: WORLD.w + 290 },
  rightRoute: { startX: WORLD.w + 290, endX: -290 },
  groundY: 876,
};

// ------------------------------------------------------------ Ivory city
// Kartan ar en malning (arena_ivory_city.png). Allt harinne ar bara det som
// ror sig OVANPA den, och det maste sitta dar bilden sager: solen uppe till
// vanster, diset i dalen och vid stadens fot, lovtraden i bada forgrundshornen.
// Siffrorna nedan ar alltsa avlasta ur malningen, inte hittade pa.
const IVORY = {
  // Ljuskallan i bilden: bakom molnen uppe till vanster. Stralarna gar ut harifran.
  sun: { x: 118, y: 318, r: 340 },
  // Dimslojorna i malningen ligger i tva hojder: dalgangen bakom staden och
  // bandet langs stadens fot. Diset laggs i samma band sa att det smalter in.
  mistBands: [
    { y: 350, spread: 60 },
    { y: 470, spread: 70 },
    { y: 545, spread: 45 },
  ],
};

// Nazgul: en sallsynt overflygning, samma upplagg som skogstrollet. Den ska
// komma sa sallan att den fortfarande kanns nar den kommer.

// Nazgul: en sallsynt overflygning, samma upplagg som skogstrollet. Den ska
// komma sa sallan att den fortfarande kanns nar den kommer.
const NAZGUL = {
  firstDelayMs: 70000,
  firstJitterMs: 40000,
  intervalMs: 150000,
  intervalJitterMs: 50000,
  durationMs: 13000,
  flapMs: 900,
  startX: -320,
  endX: WORLD.w + 320,
  baseY: 200,
  waveAmp: 46,
  scale: 1,
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.effects = [];
    this.scale = 1;
    this.dt = 16;
    this.stars = makeStars(90);
    this.snow = {
      far: makeSnowflakes(95, 0.55),
      mid: makeSnowflakes(85, 0.85),
      near: makeSnowflakes(38, 1.25),
    };
    this.fogWisps = makeFogWisps(10);
    this.forest = {
      fog: makeForestFog(11),
      fireflies: makeFireflies(75),
      leaves: makeLeaves(42),
      troll: { img: null, active: null, nextAt: Infinity },
    };
    this.city = {
      mist: makeIvoryMist(7),
      leaves: makeIvoryLeaves(54),
      motes: makeIvoryMotes(40),
      flocks: makeCityFlocks(3),
      nazgul: { active: null, nextAt: Infinity },
    };
    this.sprites = {};
    this.attackAnims = new Map(); // spelar-id -> { started, slot } for attackanimationen
    this.hpTrails = new Map(); // spelar-id -> eftersladdning pa halsomataren
    this.buffs = new Map(); // spelar-id -> starttid for upplocks-effekten (blink + vaxt)
    this.arena = null; // bakgrundsbilden, laddas asynkront
    this.arenaAsset = '';
    this.theme = ''; // satts av setArena, se MAPS[].theme
    this.arenaLoadId = 0;
    this.platforms = MAP.platforms;
    this.platformGuides = true; // window.vvc.renderer.platformGuides = false stanger av markeringarna
    this.powerupSprites = {}; // sort -> bild, laddas asynkront
    this.axe = null; // Vikings kastade yxa
    this.harpoon = null; // Vikings kastade harpun (kroken pa a4)
    this.sandBlast = []; // Cleos sandblast-animation
    this.shieldIcon = null; // Cleos Power shield-ikon
    this.sunFireBall = null; // Cleos laddade Sun fire-boll
    this.sunFireChanneling = null; // Cleos pose medan Sun fire laddas
    this.sunFireProjectile = null; // Cleos flygande Sun fire-projektil
    this.mushroom = null; // Vikings flugsvamp
    this.silhouettes = new Map(); // bild -> farg -> fardig rod hinna (byggs en gang)
    this.shake = { amp: 0, x: 0, y: 0 }; // skarmskak, se punch()
    this.selfId = 0; // satts vid varje draw()
    this.comboHit = { id: 0, until: 0 }; // vems nasta skadesiffra som ar en finisher
    this.debug = false; // window.vvc.renderer.debug = true ritar ut traffytorna
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loadSprites();
    this.setArena(DEFAULT_ARENA_ASSET, 'nordic');
    for (const kind of Object.values(POWERUP_KINDS)) {
      loadImage(kind.sprite)
        .then((img) => (this.powerupSprites[kind.id] = img))
        .catch((err) => console.warn(`Kunde inte ladda ${kind.id}:`, err.message));
    }
    loadImage('/assets/viking/axe_throw.png')
      .then((img) => (this.axe = img))
      .catch((err) => console.warn('Kunde inte ladda yxa:', err.message));
    loadImage('/assets/viking_harpoon_projectile.png')
      .then((img) => (this.harpoon = img))
      .catch((err) => console.warn('Kunde inte ladda harpun:', err.message));
    Promise.all([1, 2, 3].map((n) => loadImage(`/assets/cleo/sand_blast${n}.png`)))
      .then((imgs) => (this.sandBlast = imgs))
      .catch((err) => console.warn('Kunde inte ladda sandblast:', err.message));
    loadImage('/assets/cleo_shield_icon.png')
      .then((img) => (this.shieldIcon = img))
      .catch((err) => console.warn('Kunde inte ladda shield-ikon:', err.message));
    loadImage('/assets/cleo/sun_fire_ball.png')
      .then((img) => (this.sunFireBall = img))
      .catch((err) => console.warn('Kunde inte ladda Sun fire-boll:', err.message));
    loadImage('/assets/cleo/sun_fire_channeling.png')
      .then((img) => (this.sunFireChanneling = img))
      .catch((err) => console.warn('Kunde inte ladda Sun fire-channeling:', err.message));
    loadImage('/assets/cleo/sun_fire_projectile.png')
      .then((img) => (this.sunFireProjectile = img))
      .catch((err) => console.warn('Kunde inte ladda Sun fire-projektil:', err.message));
    loadImage('/assets/mushroom.png')
      .then((img) => (this.mushroom = img))
      .catch((err) => console.warn('Kunde inte ladda flugsvamp:', err.message));
    loadImage(FOREST_TROLL.sprite)
      .then((img) => (this.forest.troll.img = img))
      .catch((err) => console.warn('Kunde inte ladda skogstroll:', err.message));
  }

  /**
   * Kartans bakgrund. `asset` ar bilden (tom strang for kartor som ritar hela
   * bakgrunden sjalva) och `theme` avgor vilka levande lager som laggs pa -
   * snon i fjorden, trollet i skogen, faglarna over Ivory city. Anropas varje
   * bildruta, sa allt arbete ligger bakom en jamforelse.
   */
  setArena(asset = DEFAULT_ARENA_ASSET, theme = 'nordic') {
    if (asset === this.arenaAsset && theme === this.theme) return;
    const wasForest = this.isForestArena();
    const wasIvoryCity = this.isIvoryCityArena();
    const loadId = ++this.arenaLoadId;
    this.arenaAsset = asset;
    this.theme = theme;
    this.arena = null;

    if (this.isForestArena()) this.primeForestTroll(performance.now(), wasForest);
    else this.forest.troll.active = null;
    if (this.isIvoryCityArena()) this.primeNazgul(performance.now(), wasIvoryCity);
    else this.city.nazgul.active = null;

    if (!asset) return;
    loadImage(asset)
      .then((img) => {
        if (loadId === this.arenaLoadId) this.arena = img;
      })
      .catch((err) => {
        if (loadId === this.arenaLoadId) console.warn('Kunde inte ladda arena:', err.message);
      });
  }

  isNordicArena() {
    return this.theme === 'nordic';
  }

  isForestArena() {
    return this.theme === 'forest';
  }

  isIvoryCityArena() {
    return this.theme === 'ivoryCity';
  }

  setMapLayout(layout = MAP) {
    this.platforms = layout.platforms ?? MAP.platforms;
  }

  guideLight() {
    if (this.isForestArena()) return '185,255,190';
    if (this.isNordicArena()) return '210,245,255';
    if (this.isIvoryCityArena()) return '255,226,158'; // guld mot vit sten
    return GUIDE.light;
  }

  primeForestTroll(now, alreadyForest = false) {
    if (alreadyForest) return;
    this.forest.troll.active = null;
    this.forest.troll.nextAt = now + FOREST_TROLL.firstDelayMs + Math.random() * FOREST_TROLL.firstJitterMs;
  }

  spawnForestTroll(now = performance.now()) {
    const fromLeft = Math.random() < 0.5;
    this.forest.troll.active = {
      started: now,
      fromLeft,
      route: fromLeft ? FOREST_TROLL.leftRoute : FOREST_TROLL.rightRoute,
      groundY: FOREST_TROLL.groundY + (Math.random() * 2 - 1) * 12,
      scale: FOREST_TROLL.scaleMin + Math.random() * FOREST_TROLL.scaleJitter,
      phase: Math.random() * Math.PI * 2,
    };
    this.forest.troll.nextAt = Infinity;
  }

  /**
   * En fargad kopia av en bild, klippt mot bildens egen form: allt som ar
   * genomskinligt forblir genomskinligt. Anvands for att lagga en rod hinna
   * over hela figuren utan att fargen smetar ut over bakgrunden. Resultatet
   * cachas - bilderna byts aldrig.
   */
  silhouette(img, color) {
    let byColor = this.silhouettes.get(img);
    if (!byColor) {
      byColor = new Map();
      this.silhouettes.set(img, byColor);
    }
    let canvas = byColor.get(color);
    if (canvas) return canvas;

    canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, canvas.width, canvas.height);
    byColor.set(color, canvas);
    return canvas;
  }

  async loadSprites() {
    for (const [team, dir] of Object.entries(SPRITE_SETS)) {
      try {
        const manifest = await fetch(`${dir}/manifest.json`).then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json();
        });
        // En melee-plats ar antingen bara en lista med rutor, eller en lista
        // plus egna matt for just de rutorna. Skoldsmallen behover det senare:
        // skolden skjuts langre fram an yxan nar och far inte plats pa samma duk.
        const attackSpec = manifest.attack;
        const attackEntries = (Array.isArray(attackSpec) ? [['default', attackSpec]] : Object.entries(attackSpec ?? {})).map(
          ([slot, spec]) => [slot, Array.isArray(spec) ? { files: spec, meta: null } : { files: spec.files, meta: spec }],
        );
        const [idle, attackSets, stunned, stunnedAboveHead, shieldCharge] = await Promise.all([
          loadImage(`${dir}/${manifest.idle}`),
          Promise.all(
            attackEntries.map(async ([slot, { files, meta }]) => [
              slot,
              { frames: await Promise.all(files.map((f) => loadImage(`${dir}/${f}`))), meta },
            ]),
          ),
          manifest.stunned ? loadImage(`${dir}/${manifest.stunned.file}`) : Promise.resolve(null),
          manifest.stunnedAboveHead ? loadImage(`${dir}/${manifest.stunnedAboveHead}`) : Promise.resolve(null),
          manifest.shieldCharge ? loadImage(`${dir}/${manifest.shieldCharge.file}`) : Promise.resolve(null),
        ]);
        this.sprites[team] = { manifest, idle, attackSets: Object.fromEntries(attackSets), stunned, stunnedAboveHead, shieldCharge };
      } catch (err) {
        // Utan sprites faller laget tillbaka pa den ritade figuren.
        console.warn(`Kunde inte ladda sprites for ${team}:`, err.message);
      }
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || WORLD.w;
    const h = this.canvas.clientHeight || WORLD.h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.scale = this.canvas.width / WORLD.w;
  }

  // --------------------------------------------------------------- effekter

  addFx(fx) {
    const t = performance.now();
    const color = fx.team ? TEAMS[fx.team].color : '#ffffff';

    switch (fx.k) {
      case 'swing':
        // Startar attackanimationen for den spelare som slog. Lag med egen
        // grafik svingar redan sitt vapen - da vore den ritade bagen dubbelt.
        if (fx.id) this.attackAnims.set(fx.id, { started: t, slot: fx.slot ?? 'default' });
        if (this.debug && fx.bw) {
          // Exakt den ruta servern provade traffen mot.
          this.effects.push({ kind: 'box', x: fx.bx, y: fx.by, w: fx.bw, h: fx.bh, born: t, life: 450, color: '#ff5f8f' });
        }
        if (!this.sprites[fx.team]) {
          this.effects.push({ kind: 'swing', x: fx.x, y: fx.y, f: fx.f, born: t, life: 170, color });
        }
        break;
      case 'axe_throw':
        if (fx.id) this.attackAnims.set(fx.id, { started: t, slot: fx.slot ?? 'default' });
        this.burst(fx.x + fx.f * 14, fx.y, 8, '#d8e2f0', 3.2, fx.f * 2, -1);
        break;
      case 'axe_hit':
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 180, r0: 3, r1: 26, color: '#d8e2f0' });
        this.burst(fx.x, fx.y, 10, '#d8e2f0', 4.4, 0, -1.5);
        break;
      case 'sun_fire_channel':
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 360, r0: 6, r1: 38, color: '#ffd166' });
        this.burst(fx.x, fx.y, 12, '#ffd166', 3.2, 0, -1.4);
        break;
      case 'sun_fire_release':
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 300, r0: 8, r1: 52 + (fx.s ?? 0) * 28, color: '#ff9f1c' });
        this.burst(fx.x + fx.f * 18, fx.y, 18, '#ff9f1c', 4.8, fx.f * 2.4, -1.2);
        break;
      case 'sun_fire_hit':
        this.effects.push({ kind: 'flash', x: fx.x, y: fx.y, born: t, life: 260, r: 220 + (fx.s ?? 0) * 160, color: '#ff8a00' });
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 280, r0: 8, r1: 46 + (fx.s ?? 0) * 42, color: '#ffd166' });
        this.burst(fx.x, fx.y, 20, '#ff9f1c', 6.2, 0, -1.8);
        this.burst(fx.x, fx.y, 10, '#fff2a8', 4.2, 0, -2.4);
        break;
      case 'sand_blast':
        if (fx.id) this.attackAnims.set(fx.id, { started: t, slot: fx.slot ?? 'default' });
        this.effects.push({
          kind: 'sand_blast',
          x: fx.x,
          y: fx.y,
          f: fx.f,
          born: t,
          life: 260,
          range: fx.r,
          nearHalfHeight: fx.nh,
          farHalfHeight: fx.fh,
        });
        this.burst(fx.x + fx.f * 24, fx.y + 18, 12, '#f7c66a', 4.2, fx.f * 2, -1);
        break;
      case 'mushrooms': {
        // Svampen sticker upp och tonar bort medan raseriet slar ut i rott.
        this.effects.push({ kind: 'mushroom', x: fx.x, y: fx.y - 10, born: t, life: 900 });
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 420, r0: 10, r1: 66, color: '#ff3c28' });
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 620, r0: 14, r1: 96, color: '#ff7a4d' });
        this.burst(fx.x, fx.y, 20, '#ff3c28', 4.6, 0, -1.6);
        this.burst(fx.x, fx.y, 10, '#ffd0c2', 3.4, 0, -2.2);
        this.effects.push({
          kind: 'float',
          x: fx.x,
          y: fx.y - 26,
          born: t,
          life: 950,
          text: 'BERSERK',
          size: 22,
          color: '#ff5a3c',
        });
        break;
      }
      case 'power_shield':
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 520, r0: 16, r1: 70, color: '#ffe8a3' });
        this.burst(fx.x, fx.y, 14, '#ffe8a3', 3.3, 0, -1.5);
        break;
      case 'power_shield_hit':
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 260, r0: 12, r1: 42, color: '#ffe8a3' });
        this.burst(fx.x, fx.y, 10, '#fff2bf', 3.8, 0, -0.8);
        if (typeof fx.left === 'number') {
          this.effects.push({
            kind: 'float',
            x: fx.x,
            y: fx.y - 18,
            born: t,
            life: 720,
            text: `${fx.left}`,
            size: 18,
            color: '#ffe8a3',
          });
        }
        break;
      case 'stun':
        this.effects.push({ kind: 'stun', x: fx.x, y: fx.y, born: t, life: 2000, color: '#ffe08a' });
        break;
      case 'hit': {
        // Kritisk traff far starkare farg, storre siffra och en egen etikett -
        // man ska se skillnaden utan att lasa siffran.
        const crit = !!fx.cr;
        // Finishern i en combo skickas precis fore sin traff, sa siffran som
        // hor till den vaxer den ocksa.
        const finisher = this.comboHit.id === fx.id && t < this.comboHit.until;
        this.effects.push({
          kind: 'ring',
          x: fx.x,
          y: fx.y,
          born: t,
          life: crit ? 300 : 220,
          r0: 4,
          r1: crit ? 46 : 34,
          color: crit ? '#ff8a3c' : '#fff2a8',
        });
        this.burst(fx.x, fx.y, crit ? 18 : 12, crit ? '#ff8a3c' : '#ffd166', crit ? 6.5 : 5, fx.f);
        // Siffran gor det synligt att traffen faktiskt gick fram - viktigt nar
        // ett slag bara tar 10 av 100.
        if (fx.dmg) {
          this.effects.push({
            kind: 'float',
            x: fx.x + (Math.random() * 14 - 7),
            y: fx.y - 12,
            born: t,
            life: crit || finisher ? 850 : 750,
            text: `-${fx.dmg}`,
            size: finisher ? (crit ? 38 : 34) : crit ? 30 : 21,
            color: crit ? '#ffab3d' : finisher ? '#ffffff' : '#ffe08a',
            pop: finisher, // slar in stort och krymper pa plats
          });
          if (crit) {
            this.effects.push({
              kind: 'float',
              x: fx.x,
              y: fx.y - 40,
              born: t,
              life: 800,
              text: 'CRIT!',
              size: 18,
              color: '#ff7a3c',
            });
          }
        }
        break;
      }
      case 'combo': {
        // Sista slaget i en combo landade. Det har ar kvallens hardaste traff -
        // den ska kannas i hela rutan, inte bara synas som en siffra. Var man
        // inte med sjalv racker en darring: annars skakar skarmen hela matchen.
        const mine = fx.id === this.selfId || fx.by === this.selfId;
        this.punch(mine ? COMBO_FX.shake : COMBO_FX.shakeOther);
        // Skadesiffran som kommer strax efter far finisher-behandling.
        this.comboHit = { id: fx.id, until: t + 120 };

        this.effects.push({ kind: 'flash', x: fx.x, y: fx.y, born: t, life: 300, r: 460, color });
        this.effects.push({
          kind: 'streaks',
          x: fx.x,
          y: fx.y,
          born: t,
          life: 460,
          color,
          lines: Array.from({ length: 16 }, (_, i) => ({
            a: (i / 16) * Math.PI * 2 + Math.random() * 0.3,
            r: 40 + Math.random() * 70,
            len: 40 + Math.random() * 90,
          })),
        });
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 340, r0: 8, r1: 58, color });
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 480, r0: 12, r1: 84, color: '#ffffff' });
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 620, r0: 16, r1: 150, color });
        this.burst(fx.x, fx.y, 26, color, 6.5, 0, -1.4);
        this.burst(fx.x, fx.y, 14, '#ffffff', 4.5, 0, -2);
        // Uppercut: gnistorna foljer med offret rakt upp.
        if (fx.up) {
          this.burst(fx.x, fx.y + 12, 16, '#ffffff', 3.2, 0, -7);
          this.burst(fx.x, fx.y + 12, 10, color, 2.4, 0, -9);
        }

        this.effects.push({
          kind: 'banner',
          // Skylten halls innanfor kanterna sa att namnet aldrig hamnar halvt
          // utanfor rutan nar combon landar i ett horn.
          x: clamp(fx.x, COMBO_FX.edgePad, WORLD.w - COMBO_FX.edgePad),
          y: Math.max(COMBO_FX.topPad, fx.y - 74),
          born: t,
          life: COMBO_FX.bannerMs,
          text: String(fx.name ?? 'combo').toUpperCase(),
          color,
        });
        break;
      }
      case 'block':
        // Traffade, men motstandaren hade kvar sitt spawnskydd.
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 300, r0: 8, r1: 30, color: '#a9bdd4' });
        this.effects.push({
          kind: 'float',
          x: fx.x,
          y: fx.y - 12,
          born: t,
          life: 700,
          text: 'skyddad',
          size: 15,
          color: '#cbd5e1',
        });
        break;
      case 'slam':
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 420, r0: 10, r1: fx.r, color });
        this.burst(fx.x, fx.y - 6, 22, '#cbd5e1', 6, 0, -3);
        break;
      case 'heal':
        this.burst(fx.x, fx.y, 16, '#7bf1a8', 2.5, 0, -4);
        break;
      case 'blink':
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 220, r0: 5, r1: 34, color });
        this.effects.push({ kind: 'ring', x: fx.tx, y: fx.ty, born: t, life: 260, r0: 6, r1: 42, color });
        this.effects.push({ kind: 'blink_line', x: fx.x, y: fx.y, tx: fx.tx, ty: fx.ty, born: t, life: 220, color });
        this.burst(fx.x, fx.y, 12, color, 3.2, -fx.f, -1);
        this.burst(fx.tx, fx.ty, 16, color, 3.8, fx.f, -1);
        break;
      case 'pizza':
        // Startar blink/vaxt-effekten pa spelaren som at pizzan.
        if (fx.id) this.buffs.set(fx.id, t);
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 400, r0: 8, r1: 48, color: '#ffd166' });
        this.burst(fx.x, fx.y, 18, '#7bf1a8', 3.5, 0, -3);
        this.burst(fx.x, fx.y, 10, '#ffd166', 3, 0, -2);
        this.effects.push({
          kind: 'float',
          x: fx.x,
          y: fx.y - 10,
          born: t,
          life: 800,
          text: `+${POWERUP.heal}`,
          size: 22,
          color: '#7bf1a8',
        });
        break;
      case 'kebab':
        // Samma upplocks-puls som pizzan, men i kebabens fargton. Sjalva
        // skadebuffen syns sedan som ett blink pa figuren, styrt av db-faltet.
        if (fx.id) this.buffs.set(fx.id, t);
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 400, r0: 8, r1: 48, color: '#ff9f43' });
        this.burst(fx.x, fx.y, 18, '#ff9f43', 3.5, 0, -3);
        this.burst(fx.x, fx.y, 10, '#ffe8b0', 3, 0, -2);
        this.effects.push({
          kind: 'float',
          x: fx.x,
          y: fx.y - 10,
          born: t,
          life: 900,
          text: `+${Math.round((DAMAGE_BUFF.mul - 1) * 100)}% SKADA`,
          size: 20,
          color: '#ff9f43',
        });
        break;
      case 'enrage': {
        // Combo-dodsstot: angriparen gar in i ursinne. Eld slar ut ur figuren
        // och "ENRAGED!" stampas in - buffen syns sedan som ett blink och en
        // aura, styrt av rg-faltet.
        const c = ENRAGE.color;
        this.effects.push({ kind: 'flash', x: fx.x, y: fx.y, born: t, life: 320, r: 300, color: c });
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 420, r0: 10, r1: 72, color: c });
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 620, r0: 14, r1: 108, color: ENRAGE.spark });
        this.burst(fx.x, fx.y, 22, c, 5.4, 0, -1.5);
        this.burst(fx.x, fx.y, 12, ENRAGE.spark, 3.8, 0, -2.2);
        this.effects.push({
          kind: 'float',
          x: fx.x,
          y: fx.y - 30,
          born: t,
          life: 950,
          text: `ENRAGED! +${Math.round((ENRAGE.mul - 1) * 100)}%`,
          size: 22,
          color: c,
          pop: true,
        });
        break;
      }
      case 'death':
        this.burst(fx.x, fx.y, 34, color, 7, 0, -2);
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 380, r0: 6, r1: 70, color });
        break;
      case 'jump':
        this.burst(fx.x, fx.y, 6, '#9aa4bf', 2, 0, -1);
        break;
      case 'dash':
      case 'charge':
        this.effects.push({ kind: 'trail', x: fx.x, y: fx.y, f: fx.f, born: t, life: 280, color });
        break;
      case 'shield_charge':
        this.effects.push({ kind: 'trail', x: fx.x, y: fx.y, f: fx.f, born: t, life: 360, color });
        this.burst(fx.x - fx.f * 18, fx.y + PLAYER.h * 0.35, 10, '#d8e2f0', 2.8, -fx.f, -0.6);
        break;
      case 'lasso_throw':
        // Samma kastrorelse som yxan spelas nar harpunen slungas ivag. Sjalva
        // harpunen och repet ritas sedan lopande ur ognapsbilden.
        if (fx.id) this.attackAnims.set(fx.id, { started: t, slot: fx.slot ?? 'default' });
        this.burst(fx.x + fx.f * 14, fx.y, 7, '#e8ddc8', 3.0, fx.f * 2, -1);
        break;
      case 'lasso_hit':
        // Kroken satt: en liten fangst-stot dar harpunen traffade.
        this.effects.push({ kind: 'ring', x: fx.x, y: fx.y, born: t, life: 240, r0: 4, r1: 26, color: '#e6c78a' });
        this.burst(fx.x, fx.y, 10, '#e6c78a', 3.4, 0, -1);
        break;
    }
  }

  burst(x, y, n, color, speed, dirX = 0, dirY = 0) {
    const t = performance.now();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.85);
      this.effects.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * s + dirX * 2,
        vy: Math.sin(a) * s + dirY,
        born: t,
        life: 330 + Math.random() * 320,
        color,
        size: 1.6 + Math.random() * 2.6,
      });
    }
  }

  // ------------------------------------------------------------------ rita

  /** Skakar bilden. Storsta smallen vinner - de staplas inte pa varandra. */
  punch(amp) {
    this.shake.amp = Math.max(this.shake.amp, amp);
  }

  /**
   * Skaket ligger i sjalva transformen, sa hela varlden rors med. Bakgrunden
   * ritas nagra pixlar for stor sa lange det pagar - annars skulle kanten den
   * lamnar efter sig synas som en svart remsa.
   */
  updateShake(dt) {
    const s = this.shake;
    if (s.amp < 0.4) {
      s.amp = 0;
      s.x = 0;
      s.y = 0;
      return 0;
    }
    s.x = (Math.random() * 2 - 1) * s.amp;
    s.y = (Math.random() * 2 - 1) * s.amp;
    s.amp *= Math.pow(COMBO_FX.shakeDecay, Math.min(dt, 50) / 16.67);
    return s.amp;
  }

  draw(players, powerups, projectiles, selfId, dt) {
    const ctx = this.ctx;
    this.dt = dt;
    this.selfId = selfId; // effekterna behover veta vem som ar man sjalv
    this.updateShake(dt);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.shake.x * this.scale, this.shake.y * this.scale);
    const pad = this.shake.amp > 0 ? COMBO_FX.shake : 0;
    ctx.clearRect(-pad, -pad, WORLD.w + pad * 2, WORLD.h + pad * 2);

    // Animationer for spelare som hann lamna mitt i ett slag stadas har.
    if (this.attackAnims.size) {
      const cutoff = performance.now() - 2000;
      for (const [id, anim] of this.attackAnims) {
        const started = typeof anim === 'number' ? anim : anim.started;
        if (started < cutoff) this.attackAnims.delete(id);
      }
    }
    if (this.hpTrails.size) {
      const live = new Set(players.map((p) => p.i));
      for (const id of this.hpTrails.keys()) {
        if (!live.has(id)) this.hpTrails.delete(id);
      }
    }
    if (this.buffs.size) {
      const t = performance.now();
      for (const [id, started] of this.buffs) {
        if (t - started > POWERUP.buffMs) this.buffs.delete(id);
      }
    }

    this.drawBackground(ctx);
    if (this.debug && this.arena) this.drawPlatforms(ctx, true);
    else if (!this.arena || this.solidPlatforms()) this.drawPlatforms(ctx, false);
    if (this.platformGuides) this.drawPlatformGuides(ctx);
    this.drawPowerups(ctx, powerups);

    for (const p of players) {
      if (!p.d) this.drawPlayer(ctx, p, p.i === selfId);
    }

    this.drawReelRopes(ctx, players, projectiles);
    this.drawProjectiles(ctx, projectiles);
    this.drawEffects(ctx, dt);
    if (this.isNordicArena()) this.drawSnowLayer(ctx, this.snow.near, performance.now(), 0.55);
    if (this.isForestArena()) this.drawForestForeground(ctx, performance.now());
    if (this.isIvoryCityArena()) this.drawIvoryCityForeground(ctx, performance.now());
  }

  drawBackground(ctx) {
    // Overskott medan skarmen skakar, sa att ingen tom kant blottas.
    const o = this.shake.amp > 0 ? COMBO_FX.shake : 0;
    const t = performance.now();
    if (this.arena) {
      ctx.drawImage(this.arena, -o, -o, WORLD.w + o * 2, WORLD.h + o * 2);
      if (this.isNordicArena()) this.drawNordicDepth(ctx, t);
      if (this.isForestArena()) this.drawForestDepth(ctx, t);
      if (this.isIvoryCityArena()) this.drawIvoryCityDepth(ctx, t);
      return;
    }

    const sky = ctx.createLinearGradient(0, 0, 0, WORLD.h);
    sky.addColorStop(0, '#101a3a');
    sky.addColorStop(0.55, '#1b1030');
    sky.addColorStop(1, '#2a1126');
    ctx.fillStyle = sky;
    ctx.fillRect(-o, -o, WORLD.w + o * 2, WORLD.h + o * 2);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const s of this.stars) {
      ctx.globalAlpha = s.a;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // Manen
    ctx.fillStyle = 'rgba(255,244,214,0.9)';
    ctx.beginPath();
    ctx.arc(1340, 140, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,244,214,0.08)';
    ctx.beginPath();
    ctx.arc(1340, 140, 90, 0, Math.PI * 2);
    ctx.fill();

    // Berg i fjarran
    ctx.fillStyle = 'rgba(9,12,28,0.75)';
    ctx.beginPath();
    ctx.moveTo(-50, 900);
    const peaks = [
      [80, 620],
      [300, 760],
      [470, 560],
      [700, 730],
      [900, 590],
      [1150, 740],
      [1380, 600],
      [1650, 780],
    ];
    for (const [x, y] of peaks) ctx.lineTo(x, y);
    ctx.lineTo(1650, 900);
    ctx.closePath();
    ctx.fill();

    if (this.isForestArena()) this.drawForestDepth(ctx, t);
    else this.drawNordicDepth(ctx, t);
  }

  drawNordicDepth(ctx, t) {
    this.drawAuroraPulse(ctx, t);
    this.drawFjordMist(ctx, t);
    this.drawDistantLongship(ctx, t);
    this.drawWarmGlows(ctx, t);
    this.drawSmoke(ctx, t);
    this.drawBannerSway(ctx, t);
    this.drawSnowLayer(ctx, this.snow.far, t, 0.28);
    this.drawSnowLayer(ctx, this.snow.mid, t, 0.38);
  }

  drawForestDepth(ctx, t) {
    this.drawMoonbeamPulse(ctx, t);
    this.drawForestTroll(ctx, t);
    this.drawForestMist(ctx, t);
    this.drawForestGlows(ctx, t);
    this.drawFireflies(ctx, t, 0.48);
    this.drawVines(ctx, t, 0.42);
  }

  drawForestForeground(ctx, t) {
    this.drawLeafDrift(ctx, t);
    this.drawFireflies(ctx, t, 0.82);
    this.drawVines(ctx, t, 0.22);
  }

  drawForestTroll(ctx, t) {
    const troll = this.forest.troll;
    if (!troll.img) return;
    if (!troll.active && t >= troll.nextAt) this.spawnForestTroll(t);
    if (!troll.active) return;

    const age = t - troll.active.started;
    if (age > FOREST_TROLL.durationMs) {
      const jitter = (Math.random() * 2 - 1) * FOREST_TROLL.intervalJitterMs;
      troll.active = null;
      troll.nextAt = t + FOREST_TROLL.intervalMs + jitter;
      return;
    }

    const p = clamp(age / FOREST_TROLL.durationMs, 0, 1);
    const move = p * p * (3 - 2 * p);
    const fade = clamp(Math.min(p / 0.12, (1 - p) / 0.18), 0, 1);
    const route = troll.active.route;
    const x = lerp(route.startX, route.endX, move);
    const cycleMs = FOREST_TROLL.frameMs * FOREST_TROLL.frameSequence.length;
    const step = Math.sin((age / cycleMs) * Math.PI * 4 + troll.active.phase);
    const y = troll.active.groundY + step * 7;
    const facing = troll.active.fromLeft ? 1 : -1;
    const img = troll.img;
    const frameW = img.width / FOREST_TROLL.columns;
    const frameH = img.height / FOREST_TROLL.rows;
    const frame = FOREST_TROLL.frameSequence[Math.floor(age / FOREST_TROLL.frameMs) % FOREST_TROLL.frameSequence.length];
    const sx = (frame % FOREST_TROLL.columns) * frameW;
    const sy = Math.floor(frame / FOREST_TROLL.columns) * frameH;
    const shade = this.silhouette(img, 'rgba(4,12,8,0.92)');

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(step * 0.012 * facing);
    ctx.scale(troll.active.scale * facing, troll.active.scale);

    ctx.globalAlpha = 0.4 * fade;
    ctx.drawImage(shade, sx, sy, frameW, frameH, -frameW * 0.5, -frameH, frameW, frameH);

    ctx.globalAlpha = 0.16 * fade;
    ctx.drawImage(img, sx, sy, frameW, frameH, -frameW * 0.5, -frameH, frameW, frameH);

    const eyeX = frameW * 0.2;
    const eyeY = -frameH + frameH * 0.25;
    const pulse = 0.75 + Math.sin(t * 0.006 + troll.active.phase) * 0.25;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.44 * fade * pulse;
    const glow = ctx.createRadialGradient(eyeX, eyeY, 0, eyeX, eyeY, 34);
    glow.addColorStop(0, 'rgba(183,255,134,0.95)');
    glow.addColorStop(0.38, 'rgba(96,255,128,0.32)');
    glow.addColorStop(1, 'rgba(96,255,128,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.12 * fade;
    const mist = ctx.createLinearGradient(x - 190, y - 18, x + 190, y - 18);
    mist.addColorStop(0, 'rgba(170,230,202,0)');
    mist.addColorStop(0.5, 'rgba(170,230,202,0.55)');
    mist.addColorStop(1, 'rgba(170,230,202,0)');
    ctx.fillStyle = mist;
    ctx.beginPath();
    ctx.ellipse(x, y - 18, 190, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawMoonbeamPulse(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.18 + Math.sin(t * 0.00075) * 0.035;
    const beam = ctx.createLinearGradient(700, 90, 920, 660);
    beam.addColorStop(0, 'rgba(190,232,255,0.35)');
    beam.addColorStop(0.48, 'rgba(136,220,255,0.12)');
    beam.addColorStop(1, 'rgba(136,220,255,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(790, 66);
    ctx.lineTo(1010, 66);
    ctx.lineTo(900, 640);
    ctx.lineTo(620, 640);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawForestMist(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const w of this.forest.fog) {
      const x = wrap(w.x + t * w.speed, -w.w, WORLD.w + w.w);
      const y = w.y + Math.sin(t * 0.00036 + w.phase) * 9;
      const g = ctx.createLinearGradient(x - w.w, y, x + w.w, y);
      g.addColorStop(0, 'rgba(165,230,210,0)');
      g.addColorStop(0.5, `rgba(165,230,210,${w.alpha})`);
      g.addColorStop(1, 'rgba(165,230,210,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, w.w, w.h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawForestGlows(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const g of FOREST_GLOWS) {
      const pulse = 0.82 + Math.sin(t * 0.0038 + g.x * 0.02) * 0.16 + Math.sin(t * 0.011 + g.y) * 0.05;
      const r = g.r * pulse;
      const glow = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
      glow.addColorStop(0, `rgba(${g.color},0.18)`);
      glow.addColorStop(0.38, `rgba(${g.color},0.075)`);
      glow.addColorStop(1, `rgba(${g.color},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFireflies(ctx, t, alphaMul) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const f of this.forest.fireflies) {
      const x = wrap(f.x + Math.sin(t * f.wobble + f.phase) * f.sway + t * f.drift, -30, WORLD.w + 30);
      const y = f.y + Math.sin(t * f.float + f.phase * 1.7) * f.bob;
      const pulse = 0.55 + Math.sin(t * f.pulse + f.phase) * 0.45;
      const r = f.r * (1 + pulse * 0.55);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      ctx.globalAlpha = 1;
      glow.addColorStop(0, `rgba(255,220,92,${0.35 * f.alpha * alphaMul})`);
      glow.addColorStop(0.28, `rgba(180,255,152,${0.18 * f.alpha * alphaMul})`);
      glow.addColorStop(1, 'rgba(180,255,152,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = f.alpha * alphaMul * pulse;
      ctx.fillStyle = '#fff2a6';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawVines(ctx, t, alphaMul) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const v of FOREST_VINES) {
      const sway = Math.sin(t * 0.0017 + v.phase) * 11;
      ctx.globalAlpha = alphaMul;
      ctx.strokeStyle = '#1b5f36';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.quadraticCurveTo(v.x + sway, v.y + v.len * 0.45, v.x + sway * 0.35, v.y + v.len);
      ctx.stroke();

      ctx.globalAlpha = alphaMul * 0.7;
      ctx.strokeStyle = '#76b86f';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(v.x - 1.5, v.y + 8);
      ctx.quadraticCurveTo(v.x + sway - 1.5, v.y + v.len * 0.45, v.x + sway * 0.35 - 1.5, v.y + v.len - 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLeafDrift(ctx, t) {
    ctx.save();
    for (const l of this.forest.leaves) {
      const x = wrap(l.x + t * l.vx + Math.sin(t * l.wave + l.phase) * l.sway, -24, WORLD.w + 24);
      const y = wrap(l.y + t * l.vy, -30, WORLD.h + 30);
      const rot = t * l.spin + l.phase;
      ctx.save();
      ctx.globalAlpha = l.alpha;
      ctx.fillStyle = l.color;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, l.w, l.h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawAuroraPulse(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.rect(0, 0, WORLD.w, 335);
    ctx.clip();

    for (let band = 0; band < 3; band++) {
      const baseY = 62 + band * 42 + Math.sin(t * 0.00055 + band) * 9;
      const grad = ctx.createLinearGradient(0, baseY - 45, 0, baseY + 210);
      grad.addColorStop(0, 'rgba(88,255,221,0)');
      grad.addColorStop(0.3, band === 1 ? 'rgba(117,98,255,0.12)' : 'rgba(85,255,220,0.16)');
      grad.addColorStop(0.64, 'rgba(81,224,255,0.08)');
      grad.addColorStop(1, 'rgba(88,255,221,0)');

      ctx.globalAlpha = 0.55 + Math.sin(t * 0.0008 + band * 1.7) * 0.1;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-80, baseY + 70);
      for (let x = -80; x <= WORLD.w + 80; x += 70) {
        const wave = Math.sin(x * 0.012 + t * 0.00032 + band * 2) * 20;
        const curl = Math.sin(x * 0.026 - t * 0.00018 + band) * 8;
        ctx.lineTo(x, baseY + wave + curl);
      }
      ctx.lineTo(WORLD.w + 80, baseY + 220);
      ctx.lineTo(-80, baseY + 220);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  drawFjordMist(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const w of this.fogWisps) {
      const x = wrap(w.x + t * w.speed, -w.w, WORLD.w + w.w);
      const y = w.y + Math.sin(t * 0.00045 + w.phase) * 7;
      const g = ctx.createLinearGradient(x - w.w, y, x + w.w, y);
      g.addColorStop(0, 'rgba(210,235,255,0)');
      g.addColorStop(0.5, `rgba(210,235,255,${w.alpha})`);
      g.addColorStop(1, 'rgba(210,235,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, w.w, w.h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawDistantLongship(ctx, t) {
    const x = 612 + Math.sin(t * 0.00022) * 34;
    const y = 694 + Math.sin(t * 0.0004) * 2;

    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#061427';
    ctx.strokeStyle = 'rgba(170,210,235,0.35)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(x - 76, y + 14);
    ctx.quadraticCurveTo(x - 46, y + 28, x + 45, y + 24);
    ctx.quadraticCurveTo(x + 70, y + 22, x + 86, y + 4);
    ctx.lineTo(x + 58, y + 14);
    ctx.lineTo(x - 58, y + 10);
    ctx.lineTo(x - 86, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(170,210,235,0.45)';
    strokeLine(ctx, x, y + 6, x, y - 46);
    ctx.fillStyle = 'rgba(185,216,236,0.22)';
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 42);
    ctx.quadraticCurveTo(x + 38 + Math.sin(t * 0.0011) * 6, y - 24, x + 4, y - 6);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#c9ecff';
    ctx.fillRect(x - 72, y + 30, 130, 2);
    ctx.restore();
  }

  drawWarmGlows(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const g of WARM_GLOWS) {
      const pulse = 0.8 + Math.sin(t * 0.006 + g.x * 0.01) * 0.14 + Math.sin(t * 0.017 + g.y) * 0.06;
      const r = g.r * pulse;
      const glow = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
      glow.addColorStop(0, 'rgba(255,205,102,0.23)');
      glow.addColorStop(0.36, 'rgba(255,133,50,0.09)');
      glow.addColorStop(1, 'rgba(255,133,50,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSmoke(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const stack of SMOKE_STACKS) {
      for (let i = 0; i < 7; i++) {
        const age = (stack.phase + i / 7 + t * stack.speed) % 1;
        const x = stack.x + age * stack.drift + Math.sin(age * 7 + stack.phase * 8 + t * 0.001) * 13;
        const y = stack.y - age * stack.rise;
        const r = stack.size * (0.55 + age * 1.2);
        const alpha = stack.alpha * Math.pow(1 - age, 1.5);
        const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
        puff.addColorStop(0, `rgba(225,237,246,${alpha})`);
        puff.addColorStop(0.62, `rgba(162,184,204,${alpha * 0.55})`);
        puff.addColorStop(1, 'rgba(162,184,204,0)');
        ctx.fillStyle = puff;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBannerSway(ctx, t) {
    ctx.save();
    for (const b of BANNERS) {
      const sway = Math.sin(t * 0.002 + b.phase) * 4;
      const flutter = Math.sin(t * 0.006 + b.phase) * 2.2;
      const notch = b.h * 0.14;

      ctx.globalAlpha = 0.26;
      ctx.fillStyle = b.tone;
      ctx.strokeStyle = 'rgba(220,245,255,0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + b.w, b.y + sway * 0.2);
      ctx.lineTo(b.x + b.w + sway + flutter, b.y + b.h - notch);
      ctx.lineTo(b.x + b.w / 2 + sway * 0.35, b.y + b.h);
      ctx.lineTo(b.x - sway * 0.2, b.y + b.h - notch);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.globalAlpha = 0.33;
      ctx.strokeStyle = b.trim;
      ctx.lineWidth = 2;
      strokeLine(ctx, b.x + b.w * 0.5 + sway * 0.15, b.y + 14, b.x + b.w * 0.5 + sway * 0.55, b.y + b.h - 24);
      strokeLine(ctx, b.x + 6, b.y + 14, b.x + b.w - 6 + sway * 0.45, b.y + 14);
    }
    ctx.restore();
  }

  drawSnowLayer(ctx, flakes, t, alphaMul) {
    ctx.save();
    ctx.fillStyle = '#f7fbff';
    for (const f of flakes) {
      const drift = t * f.vx + Math.sin(t * f.wave + f.phase) * f.sway;
      const x = wrap(f.x + drift, -20, WORLD.w + 20);
      const y = wrap(f.y + t * f.vy, -30, WORLD.h + 30);
      const twinkle = 0.75 + Math.sin(t * f.twinkle + f.phase) * 0.25;
      ctx.globalAlpha = f.alpha * alphaMul * twinkle;
      ctx.beginPath();
      ctx.arc(x, y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --------------------------------------------------------- Ivory city

  /**
   * Levande lager OVANPA arenamalningen. Malningen ager kompositionen; det har
   * ar bara det som ror sig. Darfor ar allt harinne placerat efter vad som
   * faktiskt finns i bilden - solen uppe till vanster, diset i dalen och vid
   * stadens fot, traden i for- och mellangrunden - och allt ligger pa lag
   * genomskinlighet. Blir nagot av det tydligt nog att marka som ett eget lager
   * har det gatt for langt.
   */
  drawIvoryCityDepth(ctx, t) {
    this.drawIvorySunGlow(ctx, t);
    this.drawIvoryLightShafts(ctx, t);
    this.drawIvoryMist(ctx, t);
    this.drawCityBirds(ctx, t);
    this.drawNazgul(ctx, t);
  }

  /** Framfor spelarna: lov som blaser forbi och pollen i motljuset. */
  drawIvoryCityForeground(ctx, t) {
    this.drawIvoryMotes(ctx, t);
    this.drawIvoryLeaves(ctx, t);
  }

  /**
   * Solen ligger bakom molnen uppe till vanster i malningen. Ett andande sken
   * pa samma stalle far ljuset i bilden att kannas levande i stallet for
   * intryckt. Det ar den enda effekt som ror bildens ljuskalla, sa den halls
   * svag - malningen har redan sin exponering.
   */
  drawIvorySunGlow(ctx, t) {
    const sun = IVORY.sun;
    const pulse = 0.82 + Math.sin(t * 0.00035) * 0.18;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.5 * pulse;
    const g = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sun.r * pulse);
    g.addColorStop(0, 'rgba(255,238,196,0.4)');
    g.addColorStop(0.35, 'rgba(255,212,150,0.14)');
    g.addColorStop(1, 'rgba(255,196,130,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, sun.r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Ljusstralar ut ur solen, ned over dalen. Bilden har redan ljuset - det har
   * ska bara rora sig i det, sa vinklarna foljer malningens egen ljusriktning
   * (uppe till vanster, ned mot hoger).
   */
  drawIvoryLightShafts(ctx, t) {
    const sun = IVORY.sun;
    const len = 1700;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(sun.x, sun.y);
    for (let i = 0; i < 4; i++) {
      const a = 0.12 + i * 0.17 + Math.sin(t * 0.00007 + i * 1.7) * 0.03;
      const spread = 0.028 + Math.sin(t * 0.00021 + i * 2.3) * 0.012;
      const alpha = Math.max(0, 0.05 + Math.sin(t * 0.0003 + i * 1.1) * 0.028);
      const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      g.addColorStop(0, `rgba(255,236,190,${alpha})`);
      g.addColorStop(0.45, `rgba(255,214,150,${alpha * 0.4})`);
      g.addColorStop(1, 'rgba(255,206,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - spread) * len, Math.sin(a - spread) * len);
      ctx.lineTo(Math.cos(a + spread) * len, Math.sin(a + spread) * len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Dis som driver i dalen och langs stadens fot. Malningen har redan
   * dimslojor pa just de hojderna, sa de har lagger sig i samma band och
   * smalter in - det ar darfor de placeras i hojdled och inte slumpas fritt.
   */
  drawIvoryMist(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const w of this.city.mist) {
      const x = wrap(w.x + t * w.speed, -w.w, WORLD.w + w.w);
      const y = w.y + Math.sin(t * 0.0003 + w.phase) * 7;
      const g = ctx.createLinearGradient(x - w.w, y, x + w.w, y);
      g.addColorStop(0, 'rgba(236,240,246,0)');
      g.addColorStop(0.5, `rgba(236,240,246,${w.alpha})`);
      g.addColorStop(1, 'rgba(236,240,246,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, w.w, w.h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Loven. Bilden har stora lovtrad i bada forgrundshornen, sa vinden bar loven
   * tvars over rutan. Djupet ligger i farten: de nara loven ar storre, snabbare
   * och mer genomskinliga an de bortre, vilket ar det som gor att de laser som
   * lov i luften och inte som prickar pa en skiva.
   */
  drawIvoryLeaves(ctx, t) {
    ctx.save();
    for (const l of this.city.leaves) {
      const x = wrap(l.x + t * l.vx, -30, WORLD.w + 30);
      const y = wrap(l.y + t * l.vy + Math.sin(t * l.wave + l.phase) * l.sway, -30, WORLD.h + 30);
      const rot = t * l.spin + l.phase;
      // Bladet vrider sig runt sin egen axel: bredden andas medan det snurrar.
      const flip = Math.abs(Math.cos(t * l.flip + l.phase));

      ctx.save();
      ctx.globalAlpha = l.alpha;
      ctx.fillStyle = l.color;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, l.w * (0.25 + flip * 0.75), l.h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /** Pollen och damm som star och lyser i motljuset. */
  drawIvoryMotes(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const m of this.city.motes) {
      const y = wrap(m.y - t * m.rise, -20, WORLD.h + 20);
      const x = wrap(m.x + Math.sin(t * m.wobble + m.phase) * m.sway + t * m.drift, -20, WORLD.w + 20);
      const pulse = 0.55 + Math.sin(t * m.pulse + m.phase) * 0.45;
      ctx.globalAlpha = m.alpha * pulse;
      ctx.fillStyle = '#fff0cd';
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Faglarna. Varje flock foljer en atta-formad bana och faglarna haller sina
   * platser i den - det ar sammanhanget som gor att de laser som faglar och
   * inte som prickar pa skarmen.
   */
  drawCityBirds(ctx, t) {
    ctx.save();
    ctx.strokeStyle = '#3d4152';
    ctx.lineCap = 'round';
    for (const flock of this.city.flocks) {
      const a = t * flock.speed + flock.phase;
      const fx = flock.cx + Math.cos(a) * flock.rx;
      const fy = flock.cy + Math.sin(a * 2) * flock.ry;
      const dir = Math.sin(a) > 0 ? -1 : 1;

      ctx.globalAlpha = flock.alpha;
      for (const b of flock.birds) {
        const x = fx + b.dx * dir;
        const y = fy + b.dy + Math.sin(t * 0.0009 + b.phase) * 5;
        const flap = Math.sin(t * b.flap + b.phase);
        const s = b.size;

        ctx.lineWidth = s * 0.36;
        ctx.beginPath();
        ctx.moveTo(x - s * dir, y + flap * s * 0.5);
        ctx.quadraticCurveTo(x - s * 0.35 * dir, y - flap * s * 0.35, x, y);
        ctx.quadraticCurveTo(x + s * 0.35 * dir, y - flap * s * 0.35, x + s * dir, y + flap * s * 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  primeNazgul(now, alreadyIvoryCity = false) {
    if (alreadyIvoryCity) return;
    this.city.nazgul.active = null;
    this.city.nazgul.nextAt = now + NAZGUL.firstDelayMs + Math.random() * NAZGUL.firstJitterMs;
  }

  spawnNazgul(now) {
    const fromLeft = Math.random() < 0.5;
    this.city.nazgul.active = {
      started: now,
      fromLeft,
      baseY: NAZGUL.baseY + Math.random() * 90,
      phase: Math.random() * Math.PI * 2,
    };
  }

  /**
   * Nazgulen. Sallsynt overflygning, samma monster som skogstrollet: den ska
   * hinna glommas bort mellan gangerna sa att den fortfarande skrammer.
   */
  drawNazgul(ctx, t) {
    const nz = this.city.nazgul;
    if (!nz.active && t >= nz.nextAt) this.spawnNazgul(t);
    if (!nz.active) return;

    const age = t - nz.active.started;
    if (age > NAZGUL.durationMs) {
      nz.active = null;
      nz.nextAt = t + NAZGUL.intervalMs + (Math.random() * 2 - 1) * NAZGUL.intervalJitterMs;
      return;
    }

    const p = clamp(age / NAZGUL.durationMs, 0, 1);
    const fade = clamp(Math.min(p / 0.1, (1 - p) / 0.15), 0, 1);
    const dir = nz.active.fromLeft ? 1 : -1;
    const x = nz.active.fromLeft ? lerp(NAZGUL.startX, NAZGUL.endX, p) : lerp(NAZGUL.endX, NAZGUL.startX, p);
    const y = nz.active.baseY + Math.sin(p * Math.PI * 3 + nz.active.phase) * NAZGUL.waveAmp;
    const flap = Math.sin((age / NAZGUL.flapMs) * Math.PI * 2 + nz.active.phase);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir * NAZGUL.scale, NAZGUL.scale);
    ctx.globalAlpha = 0.8 * fade;
    ctx.fillStyle = '#141119';

    // Vingarna: samma kurva speglad, med slaget i kontrollpunkten.
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * 34, -18 - flap * 32, side * 84, -6 - flap * 40);
      ctx.quadraticCurveTo(side * 60, 10 - flap * 12, side * 30, 12);
      ctx.closePath();
      ctx.fill();
    }

    ctx.beginPath(); // kropp, hals och svans
    ctx.ellipse(0, 4, 20, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.quadraticCurveTo(34, -2, 42, -12);
    ctx.lineTo(38, -2);
    ctx.quadraticCurveTo(30, 6, 14, 8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-16, 2);
    ctx.quadraticCurveTo(-44, 10, -62, 22);
    ctx.lineTo(-52, 8);
    ctx.quadraticCurveTo(-34, 2, -16, -2);
    ctx.closePath();
    ctx.fill();

    ctx.fillRect(-6, -14, 9, 14); // ryttaren
    ctx.restore();
  }

  /**
   * Kartor med LJUS bakgrundsbild far solida plattformar, inte bara
   * markeringar. Mot fjordens morka bild racker en ljus kantlinje, men mot en
   * solbelyst malning forsvinner den i detaljerna - och var man kan sta far
   * aldrig vara en gissning.
   */
  solidPlatforms() {
    return this.isIvoryCityArena();
  }

  drawPlatforms(ctx, overlay = false) {
    const stone = this.solidPlatforms();
    ctx.save();
    for (const pl of this.platforms) {
      if (overlay) {
        ctx.fillStyle = pl.ground ? 'rgba(255,209,102,0.16)' : 'rgba(77,195,255,0.18)';
        ctx.strokeStyle = pl.ground ? 'rgba(255,209,102,0.88)' : 'rgba(77,195,255,0.82)';
        ctx.lineWidth = 3;
        roundRect(ctx, pl.x, pl.y, pl.w, pl.h, pl.ground ? 0 : 4);
        ctx.fill();
        ctx.stroke();
        continue;
      }

      if (stone) {
        // Marken ar 114 px hog men bara ovankanten ar kollision. Som solid
        // skiva lagger den en blek vagg over hela forgrunden i malningen, sa
        // den tonar ut nedat - kanten man landar pa ar lika tydlig anda.
        const depth = pl.ground ? 34 : pl.h;
        const face = ctx.createLinearGradient(0, pl.y, 0, pl.y + depth);
        face.addColorStop(0, pl.ground ? '#c6bdac' : '#cdc5b4');
        face.addColorStop(0.45, pl.ground ? '#8b8375' : '#9d9587');
        face.addColorStop(1, pl.ground ? 'rgba(58,50,42,0)' : '#5d564b');
        ctx.fillStyle = face;
        roundRect(ctx, pl.x, pl.y, pl.w, pl.ground ? depth : pl.h, pl.ground ? 0 : 4);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,250,236,0.85)';
        ctx.fillRect(pl.x, pl.y, pl.w, 3);
        if (!pl.ground) {
          ctx.fillStyle = 'rgba(28,22,18,0.45)';
          ctx.fillRect(pl.x, pl.y + pl.h - 3, pl.w, 3);
        }

        // Skarvar i murverket, sa att en 300 px lang avsats inte blir en list.
        ctx.strokeStyle = 'rgba(60,54,46,0.28)';
        ctx.lineWidth = 1.5;
        const seamTo = pl.y + (pl.ground ? 16 : pl.h);
        for (let x = pl.x + 34; x < pl.x + pl.w - 12; x += 40) strokeLine(ctx, x, pl.y + 4, x, seamTo);
        continue;
      }

      ctx.fillStyle = pl.ground ? '#2b2036' : '#332742';
      roundRect(ctx, pl.x, pl.y, pl.w, pl.h, pl.ground ? 0 : 6);
      ctx.fill();

      ctx.fillStyle = pl.ground ? '#4a3a5c' : '#584571';
      roundRect(ctx, pl.x, pl.y, pl.w, 5, pl.ground ? 0 : 3);
      ctx.fill();

      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(pl.x, pl.y + pl.h - 3, pl.w, 3);
    }
    ctx.restore();
  }

  /**
   * Markerar var man faktiskt kan sta. Ritas alltid ovanpa bakgrunden, aven
   * nar arenabilden ar laddad, eftersom kollisionsytorna annars gommer sig i
   * detaljerna. Den ljusa linjen ligger exakt pa den kant spelaren landar pa.
   */
  drawPlatformGuides(ctx) {
    const pulse = 0.86 + Math.sin((performance.now() / GUIDE.pulseMs) * Math.PI * 2) * 0.14;
    const light = this.guideLight();

    ctx.save();
    ctx.lineCap = 'round';

    for (const pl of this.platforms) {
      const y = pl.y + 0.5; // halv pixel: linjen blir skarp i stallet for suddig
      const x0 = pl.x + GUIDE.inset;
      const x1 = pl.x + pl.w - GUIDE.inset;

      if (pl.ground) {
        // Golvet gar inte att missa, det behover bara en tunn markering av
        // exakt var ytan borjar.
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 5;
        strokeLine(ctx, pl.x, y + 2.5, pl.x + pl.w, y + 2.5);
        ctx.strokeStyle = `rgba(${light},${0.5 * pulse})`;
        ctx.lineWidth = 2.5;
        strokeLine(ctx, pl.x, y, pl.x + pl.w, y);
        continue;
      }

      // Svagt sken ovanfor ytan - antyder att ytan ar upplyst uppifran.
      const up = ctx.createLinearGradient(0, y - GUIDE.glowUp, 0, y);
      up.addColorStop(0, `rgba(${light},0)`);
      up.addColorStop(1, `rgba(${light},${0.22 * pulse})`);
      ctx.fillStyle = up;
      ctx.fillRect(pl.x, y - GUIDE.glowUp, pl.w, GUIDE.glowUp);

      // Morknad platta over hela kollisionsrutan. Den ar det som gor att
      // plattformen loser ut sig ur bakgrunden var den an ligger - men pa
      // kartor med solida plattformar ar kroppen redan markeringen, och da
      // skulle plattan bara smutsa ned stenen.
      if (!this.solidPlatforms()) {
        ctx.fillStyle = 'rgba(14,9,26,0.42)';
        roundRect(ctx, pl.x, y, pl.w, Math.max(pl.h, GUIDE.plateH), 4);
        ctx.fill();
      }

      // Sjalva kanten: morkt streck underst, ljust ovanpa.
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = GUIDE.lineW + 3;
      strokeLine(ctx, x0, y + 2, x1, y + 2);
      ctx.strokeStyle = `rgba(${light},${0.95 * pulse})`;
      ctx.lineWidth = GUIDE.lineW;
      strokeLine(ctx, x0, y, x1, y);

      // Andmarkeringar: hakar nedat sa att man ser var kanten tar slut. De
      // hoppas over dar plattformen gar ut ur bilden - dar finns ingen kant.
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(${light},${0.8 * pulse})`;
      if (pl.x > 0) strokeLine(ctx, x0, y + 1, x0, y + GUIDE.capH);
      if (pl.x + pl.w < WORLD.w) strokeLine(ctx, x1, y + 1, x1, y + GUIDE.capH);
    }

    ctx.restore();
  }

  drawPowerups(ctx, powerups = []) {
    const t = performance.now();

    for (const pu of powerups) {
      const kind = POWERUP_KINDS[pu.k] ?? POWERUP_KINDS.pizza;
      const bob = Math.sin((t / POWERUP.bobMs + pu.i * 0.19) * Math.PI * 2) * POWERUP.bobAmp;
      const x = pu.x;
      const y = pu.y + bob;
      const size = POWERUP.w * 1.18;

      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.beginPath();
      ctx.ellipse(x, pu.y + POWERUP.hover, POWERUP.w * 0.42, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.45 + Math.sin(t / 180 + pu.i) * 0.12;
      ctx.strokeStyle = kind.ring;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const sprite = this.powerupSprites[kind.id];
      if (sprite) {
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      } else if (kind.id === 'kebab') {
        drawFallbackKebab(ctx, x, y);
      } else {
        drawFallbackPizza(ctx, x, y);
      }

      if (this.debug) {
        ctx.strokeStyle = '#7bf1a8';
        ctx.lineWidth = 2;
        ctx.strokeRect(pu.x - POWERUP.w / 2, pu.y - POWERUP.h / 2, POWERUP.w, POWERUP.h);
      }
      ctx.restore();
    }
  }

  drawProjectiles(ctx, projectiles = []) {
    const cfg = ABILITY_TUNING.axeThrow;
    const t = performance.now();

    for (const pr of projectiles) {
      const vx = pr.vx ?? pr.f ?? 1;
      const vy = pr.vy ?? 0;
      const len = Math.hypot(vx, vy) || 1;
      const nx = vx / len;
      const ny = vy / len;
      const dir = pr.f || Math.sign(vx) || 1;
      const spin = (pr.a ?? 0) + (t / 48) * dir;

      if (pr.k === 'sun_fire') {
        this.drawSunFireProjectile(ctx, pr);
        continue;
      }

      if (pr.k === 'harpoon') {
        this.drawHarpoonProjectile(ctx, pr);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = 'rgba(216,226,240,0.5)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pr.x - nx * 14, pr.y - ny * 14);
      ctx.lineTo(pr.x - nx * 62, pr.y - ny * 62);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(spin);
      if (this.axe) {
        const h = 70;
        const w = h * (this.axe.width / this.axe.height);
        ctx.drawImage(this.axe, -w / 2, -h / 2, w, h);
      } else {
        drawFallbackAxe(ctx);
      }
      ctx.restore();

      if (this.debug) {
        ctx.save();
        ctx.strokeStyle = '#d8e2f0';
        ctx.lineWidth = 2;
        ctx.strokeRect(pr.x - cfg.w / 2, pr.y - cfg.h / 2, cfg.w, cfg.h);
        ctx.restore();
      }
    }
  }

  drawSunFireProjectile(ctx, pr) {
    const vx = pr.vx ?? pr.f ?? 1;
    const vy = pr.vy ?? 0;
    const len = Math.hypot(vx, vy) || 1;
    const nx = vx / len;
    const ny = vy / len;
    const dir = pr.f || Math.sign(vx) || 1;
    const strength = clamp(pr.s ?? 0, 0, 1);
    const hitW = pr.w ?? lerp(ABILITY_TUNING.sunFire.wMin, ABILITY_TUNING.sunFire.wMax, strength);
    const hitH = pr.h ?? lerp(ABILITY_TUNING.sunFire.hMin, ABILITY_TUNING.sunFire.hMax, strength);
    const spriteSize = Math.max(hitW * 2.05, hitH * 1.85);

    ctx.save();
    ctx.globalAlpha = 0.72 + strength * 0.18;
    ctx.strokeStyle = 'rgba(255, 159, 28, 0.62)';
    ctx.lineWidth = 8 + strength * 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pr.x - nx * spriteSize * 0.25, pr.y - ny * spriteSize * 0.25);
    ctx.lineTo(pr.x - nx * spriteSize * 0.85, pr.y - ny * spriteSize * 0.85);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.2 + strength * 0.18;
    const glow = ctx.createRadialGradient(pr.x, pr.y, spriteSize * 0.12, pr.x, pr.y, spriteSize * 0.75);
    glow.addColorStop(0, '#fff6bf');
    glow.addColorStop(0.42, '#ff9f1c');
    glow.addColorStop(1, 'rgba(255, 159, 28, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, spriteSize * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(pr.x, pr.y);
    if (dir > 0) ctx.scale(-1, 1);
    if (this.sunFireProjectile) {
      ctx.drawImage(this.sunFireProjectile, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
    } else {
      drawFallbackSunFireProjectile(ctx, spriteSize);
    }
    ctx.restore();

    if (this.debug) {
      ctx.save();
      ctx.strokeStyle = '#ff9f1c';
      ctx.lineWidth = 2;
      ctx.strokeRect(pr.x - hitW / 2, pr.y - hitH / 2, hitW, hitH);
      ctx.restore();
    }
  }

  /**
   * Vikings kastade harpun. Bilden pekar hoger; spegla nar den flyger vanster.
   * Repet ritas i drawReelRopes sa att det kan folja aven efter traffen.
   */
  drawHarpoonProjectile(ctx, pr) {
    const dir = pr.f || Math.sign(pr.vx ?? 0) || 1;
    const len = HARPOON_LEN;
    const h = len * (HARPOON_SPRITE.sh / HARPOON_SPRITE.sw);

    ctx.save();
    ctx.translate(pr.x, pr.y);
    if (dir < 0) ctx.scale(-1, 1);
    if (this.harpoon) {
      const s = HARPOON_SPRITE;
      ctx.drawImage(this.harpoon, s.sx, s.sy, s.sw, s.sh, -len / 2, -h / 2, len, h);
    } else {
      drawFallbackHarpoon(ctx, len, h);
    }
    ctx.restore();

    if (this.debug) {
      const cfg = ABILITY_TUNING.lasso;
      ctx.save();
      ctx.strokeStyle = '#c9a36a';
      ctx.lineWidth = 2;
      ctx.strokeRect(pr.x - cfg.w / 2, pr.y - cfg.h / 2, cfg.w, cfg.h);
      ctx.restore();
    }
  }

  /**
   * Harpunrepet i tva skeden. Medan harpunen flyger spanns repet fran vikingens
   * hand ut till projektilens bakande (o = agarens id i ognapsbilden). Nar kroken
   * sitter forsvinner projektilen och offret bar i stallet fangarens id (gb) - da
   * slapas det in, och repet foljer bada kropparna hela vagen.
   */
  drawReelRopes(ctx, players, projectiles = []) {
    let byId = null;
    const lookup = (id) => {
      if (!byId) {
        byId = new Map();
        for (const q of players) byId.set(q.i, q);
      }
      return byId.get(id);
    };

    for (const pr of projectiles) {
      if (pr.k !== 'harpoon') continue;
      const owner = lookup(pr.o);
      if (!owner) continue;
      const dir = pr.f || Math.sign(pr.vx ?? 0) || 1;
      const hx = owner.x + PLAYER.w / 2 + owner.f * (PLAYER.w * 0.42);
      const hy = owner.y + PLAYER.h * 0.42;
      // Fast i harpunens bakande sa att repet moter skaftet, inte spetsen.
      const rx = pr.x - dir * (HARPOON_LEN * 0.42);
      drawRope(ctx, hx, hy, rx, pr.y, 0.95);
    }

    for (const p of players) {
      if (!p.gb) continue;
      const puller = lookup(p.gb);
      if (!puller) continue;
      const hx = puller.x + PLAYER.w / 2 + puller.f * (PLAYER.w * 0.42);
      const hy = puller.y + PLAYER.h * 0.42;
      const tx = p.x + PLAYER.w / 2;
      const ty = p.y + PLAYER.h * 0.45;
      drawRope(ctx, hx, hy, tx, ty, 0.95);
    }
  }

  drawPlayer(ctx, p, isSelf) {
    const team = TEAMS[p.tm];
    const cx = p.x + PLAYER.w / 2;
    const feetY = p.y + PLAYER.h;
    const sprite = this.sprites[p.tm];

    ctx.save();

    const buffStarted = this.buffs.get(p.i);
    if (buffStarted !== undefined) {
      const elapsed = performance.now() - buffStarted;
      if (elapsed <= POWERUP.buffMs) {
        const pulse = (Math.sin(elapsed / 55) + 1) / 2;
        const scale = 1 + POWERUP.buffScale * pulse;
        ctx.translate(cx, feetY);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -feetY);
        if (Math.floor(elapsed / 90) % 2 === 0) ctx.globalAlpha *= 0.58;
      }
    }

    // Kebab-buffen: figuren blinkar lugnt sa lange den varar, och snabbare de
    // sista sekunderna sa att man hinner se att den haller pa att ta slut.
    if (p.db > 0) {
      const period = p.db <= DAMAGE_BUFF.warnMs ? DAMAGE_BUFF.warnBlinkMs : DAMAGE_BUFF.blinkMs;
      const pulse = (Math.sin((performance.now() / period) * Math.PI * 2) + 1) / 2;
      ctx.globalAlpha *= DAMAGE_BUFF.minAlpha + (1 - DAMAGE_BUFF.minAlpha) * pulse;
    }

    // Combo-ursinnet: figuren blinkar argt sa lange buffen varar, och snabbare
    // de sista sekunderna - samma sprak som kebaben, men i eldfargen.
    if (p.rg > 0) {
      const period = p.rg <= ENRAGE.warnMs ? ENRAGE.warnBlinkMs : ENRAGE.blinkMs;
      const pulse = (Math.sin((performance.now() / period) * Math.PI * 2) + 1) / 2;
      ctx.globalAlpha *= ENRAGE.minAlpha + (1 - ENRAGE.minAlpha) * pulse;
    }

    if (p.iv) {
      ctx.globalAlpha *= 0.55 + Math.sin(performance.now() / 90) * 0.25;
    }

    // Skugga
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, feetY + 3, PLAYER.w * 0.45, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (p.ps > 0) this.drawPowerShield(ctx, p, cx, p.y + PLAYER.h * 0.54);

    // Combo-ursinnet: en pulserande eldaura bakom figuren sa att man ser vem
    // som ar enraged aven pa avstand. Ligger som ett sken runtom, till skillnad
    // fran berserkens tunga roda hinna over hela kroppen.
    if (p.rg > 0) this.drawEnrageAura(ctx, cx, feetY);

    // Flugsvampen: figuren vaxer och far ett rasande sken. Skenet ligger under
    // figuren, sjalva hinnan laggs ovanpa inne i drawSprite/drawFigure.
    const rage = ABILITY_TUNING.mushrooms;
    const berserk = p.bz > 0;
    if (berserk) {
      this.drawRageGlow(ctx, p, cx, feetY, rage);
      ctx.translate(cx, feetY);
      ctx.scale(rage.scale, rage.scale);
      ctx.translate(-cx, -feetY);
    }

    // Returnerar var namnskylten ska borja, som skiljer sig mellan sprite och
    // ritad figur.
    let plateTop = sprite ? this.drawSprite(ctx, p, sprite, cx, feetY) : this.drawFigure(ctx, p, team, cx);
    if (p.sf > 0) this.drawSunFireChannel(ctx, p, cx);
    // Skylten ritas utanfor transformen, sa den maste folja med uppforstoringen.
    if (berserk) plateTop = feetY + (plateTop - feetY) * rage.scale;

    ctx.restore();

    if (p.st) this.drawStunMarker(ctx, p, cx, plateTop + PLATE.height + PLATE.gap);
    this.drawNameplate(ctx, p, team, cx, plateTop, isSelf);
  }

  drawSunFireChannel(ctx, p, cx) {
    const cfg = ABILITY_TUNING.sunFire;
    const strength = clamp(p.sf ?? 0, 0, 1);
    const eased = easeOut(strength);
    const size = lerp(cfg.wMin, cfg.wMax, eased) * 1.45;
    const bx = cx + p.f * (cfg.channelForward + size * 0.08);
    const by = p.y + PLAYER.h * 0.4 + cfg.channelUp;
    const t = performance.now();
    const pulse = 0.78 + Math.sin(t / 115) * 0.12 + strength * 0.12;

    ctx.save();
    const glow = ctx.createRadialGradient(bx, by, size * 0.18, bx, by, size * 0.9);
    glow.addColorStop(0, '#fff8c7');
    glow.addColorStop(0.42, 'rgba(255, 196, 38, 0.72)');
    glow.addColorStop(1, 'rgba(255, 126, 0, 0)');
    ctx.globalAlpha = 0.55 + strength * 0.25;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bx, by, size * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate((t / 260) * (p.f || 1));
    if (this.sunFireBall) {
      ctx.drawImage(this.sunFireBall, -size / 2, -size / 2, size, size);
    } else {
      drawFallbackSunFireBall(ctx, size);
    }
    ctx.restore();
  }

  /** Pulserande rott sken runt en berserk figur. */
  drawRageGlow(ctx, p, cx, feetY, cfg) {
    const cy = feetY - PLAYER.h * 0.55;
    const pulse = 0.72 + Math.sin((performance.now() / cfg.pulseMs) * Math.PI * 2) * 0.28;
    const r = PLAYER.h * 1.05;

    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, `${cfg.glow} ${0.4 * pulse})`);
    g.addColorStop(0.55, `${cfg.glow} ${0.16 * pulse})`);
    g.addColorStop(1, `${cfg.glow} 0)`);

    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Pulserande eldaura runt en enraged figur. Ligger som ett sken plus en tunn
   * eldring, sa att den laser sig ur berserkens heltackande roda hinna.
   */
  drawEnrageAura(ctx, cx, feetY) {
    const cy = feetY - PLAYER.h * 0.5;
    const t = performance.now();
    const pulse = 0.7 + Math.sin((t / ENRAGE.pulseMs) * Math.PI * 2) * 0.3;
    const r = PLAYER.h * 0.95;

    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
    g.addColorStop(0, `${ENRAGE.glow} ${0.32 * pulse})`);
    g.addColorStop(0.6, `${ENRAGE.glow} ${0.12 * pulse})`);
    g.addColorStop(1, `${ENRAGE.glow} 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Tunn eldring som andas med pulsen.
    ctx.globalAlpha *= 0.45 + 0.55 * pulse;
    ctx.strokeStyle = ENRAGE.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (0.6 + 0.06 * pulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Hur stark den roda hinnan ar just nu. Full styrka hela raseriet igenom,
   * men de sista sekunderna pulserar den sa att man hinner se att den slocknar.
   */
  rageTintAlpha(p, cfg) {
    if (p.bz > cfg.warnMs) return 1;
    const pulse = (Math.sin((performance.now() / cfg.warnBlinkMs) * Math.PI * 2) + 1) / 2;
    return 0.35 + 0.65 * pulse;
  }

  drawStunMarker(ctx, p, cx, spriteTop) {
    if (this.sprites.viking?.stunnedAboveHead) {
      this.drawImageStunMarker(ctx, cx, spriteTop - 14);
      return;
    }

    const t = performance.now() / 220;
    const y = spriteTop - 4;
    ctx.save();
    ctx.fillStyle = '#ffe08a';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = t + (i * Math.PI * 2) / 3;
      const x = cx + Math.cos(a) * 14;
      const dotY = y + Math.sin(a) * 4;
      ctx.beginPath();
      ctx.arc(x, dotY, 3.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    }
    ctx.restore();
  }

  drawImageStunMarker(ctx, cx, y) {
    const img = this.sprites.viking.stunnedAboveHead;
    const w = 58;
    const h = w * (img.height / img.width);

    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate(performance.now() / 240);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  drawPowerShield(ctx, p, cx, cy) {
    const cfg = ABILITY_TUNING.powerShield;
    const t = performance.now();
    const spin = t / 900;
    const pulse = 0.72 + Math.sin(t / 260) * 0.08;
    const radius = cfg.orbitRadius;

    ctx.save();
    ctx.strokeStyle = `rgba(255, 232, 163, ${0.28 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 * pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 15, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < p.ps; i++) {
      const a = spin + (i / p.ps) * Math.PI * 2;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * (radius * 0.62);
      this.drawShieldIcon(ctx, x, y, 20 + Math.sin(t / 180 + i) * 1.4);
    }
    ctx.restore();
  }

  drawShieldIcon(ctx, x, y, size) {
    if (this.shieldIcon) {
      const w = size;
      const h = w * (this.shieldIcon.height / this.shieldIcon.width);
      ctx.drawImage(this.shieldIcon, x - w / 2, y - h / 2, w, h);
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ffe8a3';
    ctx.strokeStyle = 'rgba(41, 23, 8, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.55);
    ctx.lineTo(size * 0.42, -size * 0.28);
    ctx.lineTo(size * 0.34, size * 0.16);
    ctx.quadraticCurveTo(0, size * 0.58, -size * 0.34, size * 0.16);
    ctx.lineTo(-size * 0.42, -size * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Ritar en bildruta ur spritesetet, fotterna forankrade i spelarens underkant. */
  drawSprite(ctx, p, sprite, cx, feetY) {
    const m = sprite.manifest;
    let img = sprite.idle;
    let frameMeta = m;

    const stunned = p.st && sprite.stunned && m.stunned;
    const shieldCharging = !stunned && p.sc && sprite.shieldCharge && m.shieldCharge;
    const sunFireChanneling = !stunned && !shieldCharging && p.tm === 'cleo' && p.sf > 0 && this.sunFireChanneling;
    const activeAttack = stunned || shieldCharging || sunFireChanneling ? undefined : this.attackAnims.get(p.i);
    if (stunned) {
      img = sprite.stunned;
      frameMeta = m.stunned;
    } else if (shieldCharging) {
      img = sprite.shieldCharge;
      frameMeta = m.shieldCharge;
    } else if (sunFireChanneling) {
      img = this.sunFireChanneling;
      frameMeta = SUN_FIRE_CHANNEL_META;
    } else if (activeAttack !== undefined) {
      const started = typeof activeAttack === 'number' ? activeAttack : activeAttack.started;
      const slot = typeof activeAttack === 'number' ? 'default' : activeAttack.slot;
      const set = sprite.attackSets?.[slot] ?? sprite.attackSets?.default;
      const attackFrames = set?.frames ?? [];
      const frame = Math.floor((performance.now() - started) / SPRITE_ANIM.attackFrameMs);
      if (frame < attackFrames.length) {
        img = attackFrames[frame];
        // Har slaget en egen duk gar dess matt fore lagets - resten arvs.
        if (set.meta) frameMeta = set.meta;
      } else this.attackAnims.delete(p.i);
    }

    const dw = frameMeta.worldWidth ?? m.worldWidth;
    const dh = frameMeta.worldHeight ?? m.worldHeight;
    const anchorX = frameMeta.anchorX ?? m.anchorX;
    const anchorY = frameMeta.anchorY ?? m.anchorY;
    const facing = frameMeta.facing ?? m.facing;
    const top = feetY - anchorY * dh;

    // Grafiken vetter at ett hall; spegla runt fotpunkten nar spelaren vander.
    const flip = (facing === 'left') === (p.f > 0);
    if (flip) {
      ctx.save();
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    ctx.drawImage(img, cx - anchorX * dw, top, dw, dh);

    // Rod hinna over exakt samma bildruta - klippt mot figurens egen form, sa
    // att bara Viking blir rod och inte rutan runt honom.
    if (p.bz > 0) {
      const cfg = ABILITY_TUNING.mushrooms;
      ctx.save();
      ctx.globalAlpha *= this.rageTintAlpha(p, cfg);
      ctx.drawImage(this.silhouette(img, cfg.tint), cx - anchorX * dw, top, dw, dh);
      ctx.restore();
    }

    if (flip) ctx.restore();

    return top - PLATE.height - PLATE.gap;
  }

  /** Inbyggd figur for lag som annu saknar grafik. */
  drawFigure(ctx, p, team, cx) {
    const x = p.x;
    const y = p.y;

    // Kropp
    ctx.fillStyle = team.dark;
    roundRect(ctx, x, y + 14, PLAYER.w, PLAYER.h - 14, 6);
    ctx.fill();

    ctx.fillStyle = team.color;
    roundRect(ctx, x + 2, y + 16, PLAYER.w - 4, PLAYER.h - 18, 5);
    ctx.fill();

    // Balte
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 2, y + 32, PLAYER.w - 4, 4);

    // Huvud
    const hy = y + 10;
    ctx.fillStyle = '#f6dcc0';
    ctx.beginPath();
    ctx.arc(cx, hy, 10, 0, Math.PI * 2);
    ctx.fill();

    if (p.tm === 'cleo') this.drawCatEars(ctx, cx, hy, team);
    else this.drawHelmet(ctx, cx, hy, team);

    // Oga i blickriktningen
    ctx.fillStyle = '#241a2c';
    ctx.beginPath();
    ctx.arc(cx + p.f * 4, hy + 1, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Vapenhand
    ctx.fillStyle = team.accent;
    ctx.fillRect(cx + p.f * (PLAYER.w / 2 - 1) - (p.f > 0 ? 0 : 5), y + 24, 5, 9);

    // Samma roda hinna som spriten far, men mot den ritade kroppen.
    if (p.bz > 0) {
      const cfg = ABILITY_TUNING.mushrooms;
      ctx.save();
      ctx.globalAlpha *= this.rageTintAlpha(p, cfg);
      ctx.fillStyle = cfg.tint;
      roundRect(ctx, x, y + 14, PLAYER.w, PLAYER.h - 14, 6);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, y + 10, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    return y - PLATE.height - PLATE.gap;
  }

  drawCatEars(ctx, cx, hy, team) {
    ctx.fillStyle = team.color;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 3, hy - 8);
      ctx.lineTo(cx + s * 9, hy - 17);
      ctx.lineTo(cx + s * 10, hy - 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawHelmet(ctx, cx, hy, team) {
    ctx.fillStyle = '#8b93a8';
    ctx.beginPath();
    ctx.arc(cx, hy - 1, 10.5, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - 10.5, hy - 2, 21, 4);

    ctx.fillStyle = team.accent;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 9, hy - 6);
      ctx.quadraticCurveTo(cx + s * 18, hy - 12, cx + s * 15, hy - 20);
      ctx.quadraticCurveTo(cx + s * 15, hy - 10, cx + s * 8, hy - 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawNameplate(ctx, p, team, cx, top, isSelf) {
    // Namn overst
    ctx.font = PLATE.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(p.n, cx, top + PLATE.nameBaseline);
    ctx.fillStyle = isSelf ? '#ffffff' : team.color;
    ctx.fillText(p.n, cx, top + PLATE.nameBaseline);

    // Halsomatare under namnet
    const frac = Math.max(0, p.hp) / PLAYER.maxHp;
    const x = cx - PLATE.barW / 2;
    const y = top + PLATE.barTop;
    const inner = PLATE.barW - 2;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, x, y, PLATE.barW, PLATE.barH, PLATE.barH / 2);
    ctx.fill();

    // Vit rest som slapar efter visar hur mycket senaste traffen tog.
    const trail = this.hpTrail(p, frac);
    if (trail > frac + 0.001) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      roundRect(ctx, x + 1 + inner * frac, y + 1, inner * (trail - frac), PLATE.barH - 2, 1.5);
      ctx.fill();
    }

    if (frac > 0) {
      ctx.fillStyle = frac > 0.55 ? '#4ade80' : frac > 0.25 ? '#fbbf24' : '#f87171';
      roundRect(ctx, x + 1, y + 1, Math.max(2, inner * frac), PLATE.barH - 2, (PLATE.barH - 2) / 2);
      ctx.fill();
    }

    if (isSelf) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx, top - 4);
      ctx.lineTo(cx - 6, top - 13);
      ctx.lineTo(cx + 6, top - 13);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Halsomatarens hogra kant slapar efter en kort stund efter en traff, sa att
   * ett slag pa 10 av 100 syns aven om man tittar bort en tiondel.
   */
  hpTrail(p, frac) {
    const t = performance.now();
    let g = this.hpTrails.get(p.i);
    if (!g) {
      g = { shown: frac, hp: frac, holdUntil: 0 };
      this.hpTrails.set(p.i, g);
      return frac;
    }

    if (frac > g.hp) g.shown = frac; // lakning eller respawn: folj med direkt
    else if (frac < g.hp) g.holdUntil = t + HP_TRAIL.holdMs;
    g.hp = frac;

    if (g.shown < frac) g.shown = frac;
    if (t > g.holdUntil) {
      g.shown = Math.max(frac, g.shown - (Math.min(this.dt, 100) / 1000) * HP_TRAIL.drainPerSec);
    }
    return g.shown;
  }

  drawEffects(ctx, dt) {
    const t = performance.now();
    const step = Math.min(dt, 50) / 16.67;
    const banners = []; // combo-skyltarna sparas och ritas sist, alltid overst

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      const k = (t - e.born) / e.life;
      if (k >= 1) {
        this.effects.splice(i, 1);
        continue;
      }
      if (e.kind === 'banner') {
        banners.push([e, k]);
        continue;
      }

      ctx.save();
      if (e.kind === 'spark') {
        e.x += e.vx * step;
        e.y += e.vy * step;
        e.vy += 0.28 * step;
        e.vx *= 0.98;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y, e.size, e.size);
      } else if (e.kind === 'ring') {
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r0 + (e.r1 - e.r0) * easeOut(k), 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.kind === 'blink_line') {
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.lineCap = 'round';
        ctx.setLineDash([10, 12]);
        ctx.lineDashOffset = -k * 40;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.tx, e.ty);
        ctx.stroke();
      } else if (e.kind === 'swing') {
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 7 * (1 - k) + 2;
        ctx.lineCap = 'round';
        const a0 = e.f > 0 ? -0.9 : Math.PI + 0.9;
        const a1 = e.f > 0 ? 0.9 : Math.PI - 0.9;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 34 + k * 12, a0, a1, e.f < 0);
        ctx.stroke();
      } else if (e.kind === 'float') {
        // Skadesiffror och liknande: stiger och tonar ut pa slutet.
        ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        ctx.font = `800 ${e.size}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        const fy = e.y - 30 * easeOut(k);
        // Finishersiffran slar in for stor och krymper pa plats.
        if (e.pop) {
          const s = k < 0.14 ? 1.9 - 0.9 * easeOut(k / 0.14) : 1;
          ctx.translate(e.x, fy);
          ctx.scale(s, s);
          ctx.translate(-e.x, -fy);
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 12;
          ctx.lineWidth = 6;
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(e.text, e.x, fy);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, e.x, fy);
      } else if (e.kind === 'flash') {
        // Kort ljusstot ur traffpunkten.
        const kk = easeOut(k);
        ctx.globalAlpha = (1 - k) * (1 - k) * 0.55;
        const r = e.r * (0.35 + kk * 0.65);
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, e.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'streaks') {
        // Fartstreck rakt ut fran smallen.
        const kk = easeOut(k);
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = e.color;
        ctx.lineCap = 'round';
        for (const l of e.lines) {
          const r0 = l.r + kk * 130;
          const r1 = r0 + l.len * (1 - k);
          ctx.lineWidth = 4 * (1 - k) + 0.5;
          strokeLine(ctx, e.x + Math.cos(l.a) * r0, e.y + Math.sin(l.a) * r0, e.x + Math.cos(l.a) * r1, e.y + Math.sin(l.a) * r1);
        }
      } else if (e.kind === 'box') {
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x, e.y, e.w, e.h);
      } else if (e.kind === 'trail') {
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.fillStyle = e.color;
        for (let s = 1; s <= 4; s++) {
          ctx.globalAlpha = ((1 - k) * 0.4) / s;
          roundRect(ctx, e.x - e.f * s * 13 - PLAYER.w / 2, e.y - PLAYER.h / 2, PLAYER.w, PLAYER.h, 6);
          ctx.fill();
        }
      } else if (e.kind === 'mushroom') {
        // Sjalva svampen stiger ur figuren nar den stoppas i munnen.
        const size = 46 + 22 * easeOut(k);
        ctx.globalAlpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
        const my = e.y - 46 * easeOut(k);
        if (this.mushroom) {
          ctx.drawImage(this.mushroom, e.x - size / 2, my - size / 2, size, size);
        } else {
          ctx.fillStyle = '#ff3c28';
          ctx.beginPath();
          ctx.arc(e.x, my, size * 0.32, Math.PI, 0);
          ctx.fill();
          ctx.fillStyle = '#f3e3bd';
          ctx.fillRect(e.x - size * 0.12, my, size * 0.24, size * 0.26);
        }
      } else if (e.kind === 'sand_blast') {
        this.drawSandBlastEffect(ctx, e, k);
      } else if (e.kind === 'stun') {
        const spin = performance.now() / 140;
        ctx.globalAlpha = 1 - k * 0.35;
        ctx.fillStyle = e.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 2;
        for (let s = 0; s < 3; s++) {
          const a = spin + (s * Math.PI * 2) / 3;
          const x = e.x + Math.cos(a) * 14;
          const y = e.y + Math.sin(a) * 5 - k * 10;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fill();
        }
      }
      ctx.restore();
    }

    for (const [e, k] of banners) {
      ctx.save();
      drawComboBanner(ctx, e, k);
      ctx.restore();
    }
  }

  drawSandBlastEffect(ctx, e, k) {
    const frame = Math.min(this.sandBlast.length - 1, Math.floor(k * this.sandBlast.length));
    const img = this.sandBlast[frame];
    const width = (e.range || ABILITY_TUNING.sandBlast.range) + 58;
    const alpha = k < 0.72 ? 0.92 : 0.92 * (1 - (k - 0.72) / 0.28);

    if (img) {
      const height = width * (img.height / img.width);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(e.x, e.y);
      if (e.f < 0) ctx.scale(-1, 1);
      ctx.translate(width - 32, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -16, -height * 0.62, width, height);
      ctx.restore();
    } else {
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillStyle = '#f7c66a';
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - e.nearHalfHeight);
      ctx.lineTo(e.x + e.f * width, e.y - e.farHalfHeight);
      ctx.lineTo(e.x + e.f * width, e.y + e.farHalfHeight);
      ctx.lineTo(e.x, e.y + e.nearHalfHeight);
      ctx.closePath();
      ctx.fill();
    }

    if (this.debug) {
      const range = e.range || ABILITY_TUNING.sandBlast.range;
      const nearH = e.nearHalfHeight || ABILITY_TUNING.sandBlast.nearHalfHeight;
      const farH = e.farHalfHeight || ABILITY_TUNING.sandBlast.farHalfHeight;
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#f7c66a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - nearH);
      ctx.lineTo(e.x + e.f * range, e.y - farH);
      ctx.lineTo(e.x + e.f * range, e.y + farH);
      ctx.lineTo(e.x, e.y + nearH);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }
}

function strokeLine(ctx, x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// Harpunbilden ar en 1024x1024-duk dar sjalva harpunen sitter i detta utsnitt
// (uppmatt ur alfakanalen). Den pekar hoger och ritas HARPOON_LEN varldspixlar
// lang - andra langden har om harpunen ska se storre eller mindre ut.
const HARPOON_SPRITE = { sx: 35, sy: 409, sw: 950, sh: 164 };
const HARPOON_LEN = 76;

/** Enkel reservharpun nar bilden inte hunnit ladda. Pekar at hoger. */
function drawFallbackHarpoon(ctx, len, h) {
  ctx.fillStyle = '#b9863f';
  ctx.fillRect(-len / 2, -h * 0.16, len * 0.78, h * 0.32); // skaft
  ctx.fillStyle = '#e8ddc8';
  ctx.beginPath(); // spets
  ctx.moveTo(len / 2, 0);
  ctx.lineTo(len * 0.18, -h * 0.6);
  ctx.lineTo(len * 0.18, h * 0.6);
  ctx.closePath();
  ctx.fill();
}

/**
 * Ett tvinnat hamprep mellan tva punkter: morg kontur, ljust rep ovanpa och
 * korta tvarstreck sa att det laser sig som ett rep och inte en streckad linje.
 * Anvands av bade flygrepet (hand -> harpun) och indragningsrepet (hand -> offer).
 */
function drawRope(ctx, x0, y0, x1, y1, alpha = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';

  ctx.strokeStyle = 'rgba(40, 26, 12, 0.9)';
  ctx.lineWidth = 5;
  strokeLine(ctx, x0, y0, x1, y1);

  ctx.strokeStyle = '#c9a36a';
  ctx.lineWidth = 3;
  strokeLine(ctx, x0, y0, x1, y1);

  ctx.strokeStyle = 'rgba(92, 60, 28, 0.75)';
  ctx.lineWidth = 1.4;
  for (let d = 8; d < len - 2; d += 9) {
    const mx = x0 + (dx * d) / len;
    const my = y0 + (dy * d) / len;
    strokeLine(ctx, mx - nx * 2.4, my - ny * 2.4, mx + nx * 2.4, my + ny * 2.4);
  }

  // Kroken langst ut sa att anden pekar ut som en harpun, inte en avklippt lina.
  ctx.strokeStyle = '#e8ddc8';
  ctx.lineWidth = 2.4;
  const bx = x1 - (dx / len) * 7;
  const by = y1 - (dy / len) * 7;
  ctx.beginPath();
  ctx.arc(bx, by, 4.5, 0, Math.PI * 1.6);
  ctx.stroke();

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.roundRect(x, y, w, h, r);
}

function drawFallbackAxe(ctx) {
  ctx.fillStyle = '#9aa4bf';
  ctx.strokeStyle = '#2a2036';
  ctx.lineWidth = 3;
  roundRect(ctx, -5, -28, 10, 56, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#d8e2f0';
  ctx.beginPath();
  ctx.moveTo(-5, -28);
  ctx.lineTo(-30, -22);
  ctx.lineTo(-21, -6);
  ctx.lineTo(-5, -8);
  ctx.lineTo(4, -8);
  ctx.lineTo(25, -14);
  ctx.lineTo(20, -29);
  ctx.lineTo(3, -28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// Reservgrafik nar sprite-bilderna inte hunnit laddas (eller saknas).
function drawFallbackPizza(ctx, x, y) {
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(x, y, POWERUP.w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(x - 6, y - 4, 4, 0, Math.PI * 2);
  ctx.arc(x + 8, y + 5, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawFallbackKebab(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  ctx.fillStyle = '#e6bd7a';
  roundRect(ctx, -POWERUP.w / 2, -10, POWERUP.w, 20, 10);
  ctx.fill();
  ctx.fillStyle = '#8b4a24';
  roundRect(ctx, -POWERUP.w / 2 + 3, -6, 14, 12, 5);
  ctx.fill();
  ctx.fillStyle = '#7bf1a8';
  ctx.beginPath();
  ctx.arc(-POWERUP.w / 2 + 6, -6, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFallbackSunFireBall(ctx, size) {
  const g = ctx.createRadialGradient(0, 0, size * 0.08, 0, 0, size * 0.5);
  g.addColorStop(0, '#fffbd1');
  g.addColorStop(0.45, '#ffd166');
  g.addColorStop(1, '#ff7a00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 196, 38, 0.85)';
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.48, 0, Math.PI * 2);
  ctx.stroke();
}

function drawFallbackSunFireProjectile(ctx, size) {
  const grad = ctx.createLinearGradient(-size * 0.45, 0, size * 0.48, 0);
  grad.addColorStop(0, '#fffbd1');
  grad.addColorStop(0.3, '#ffd166');
  grad.addColorStop(1, 'rgba(255, 122, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.48, size * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Combo-skylten. Fyra skeden: namnet slar in ur ingenting och landar med en
 * studs, skakar till, star still en stund och lyfts sedan bort. Ritas i egen
 * transform sa att skalningen far vara vad den vill.
 */
function drawComboBanner(ctx, e, k) {
  const { slamIn, settle, holdTo, fontPx } = COMBO_FX;
  const out = k > holdTo ? (k - holdTo) / (1 - holdTo) : 0;

  let scale;
  if (k < slamIn) scale = 3 - 1.94 * easeOut(k / slamIn); // faller in ur bild
  else if (k < settle) scale = 1.06 - 0.06 * easeOut((k - slamIn) / (settle - slamIn)); // studsen
  else scale = 1 + 0.14 * out;

  const fadeIn = Math.min(1, k / (slamIn * 0.6));
  const alpha = out ? Math.max(0, 1 - Math.pow(out, 1.6)) : fadeIn;
  if (alpha <= 0) return;

  // Efterskalvet: skylten vibrerar tills studsen ar klar.
  const jitter = k < settle ? 3.2 * (1 - k / settle) : 0;
  const lift = out
    ? COMBO_FX.liftHold + COMBO_FX.liftOut * easeOut(out)
    : COMBO_FX.liftHold * easeOut(k / holdTo);

  ctx.translate(
    e.x + (Math.random() * 2 - 1) * jitter,
    e.y - lift + (Math.random() * 2 - 1) * jitter,
  );
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
  ctx.font = `900 ${fontPx}px "Segoe UI Black", "Segoe UI", system-ui, sans-serif`;

  const w = ctx.measureText(e.text).width;
  const halfH = fontPx * 0.78;

  // Morkt band bakom texten sa att namnet halls last mot vilken bakgrund som helst.
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = 'rgba(6, 9, 18, 0.9)';
  roundRect(ctx, -w / 2 - 26, -halfH, w + 52, halfH * 2, 10);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.85;
  ctx.fillStyle = e.color;
  ctx.fillRect(-w / 2 - 26, -halfH, w + 52, 2);
  ctx.fillRect(-w / 2 - 26, halfH - 2, w + 52, 2);

  // Ekot: en kopia av ordet som far fortsatta utat nar det landat.
  if (k < 0.34) {
    const g = k / 0.34;
    ctx.save();
    ctx.globalAlpha = alpha * (1 - g) * 0.5;
    ctx.scale(1 + g * 1.1, 1 + g * 1.1);
    ctx.lineWidth = 3;
    ctx.strokeStyle = e.color;
    ctx.strokeText(e.text, 0, 0);
    ctx.restore();
  }

  ctx.globalAlpha = alpha;
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.strokeText(e.text, 0, 0);

  // Glodet ligger i en egen omgang: skuggan far bara folja fyllningen.
  ctx.shadowColor = e.color;
  ctx.shadowBlur = 28;
  const grad = ctx.createLinearGradient(0, -halfH, 0, halfH);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.5, '#fff6d8');
  grad.addColorStop(1, e.color);
  ctx.fillStyle = grad;
  ctx.fillText(e.text, 0, 0);
  ctx.fillText(e.text, 0, 0); // andra draget gor glodet tatare
  ctx.shadowBlur = 0;

  // Vinklarna vid sidorna glider utat medan skylten sitter.
  const slide = 12 * easeOut(Math.min(1, k / 0.4));
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = e.color;
  ctx.font = `900 ${Math.round(fontPx * 0.8)}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText('»', -w / 2 - 34 - slide, -1);
  ctx.fillText('«', w / 2 + 34 + slide, -1);

  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

function easeOut(k) {
  return 1 - (1 - k) * (1 - k);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`kunde inte ladda ${src}`));
    img.src = src;
  });
}

function makeStars(n) {
  const stars = [];
  for (let i = 0; i < n; i++) {
    stars.push({
      x: Math.random() * WORLD.w,
      y: Math.random() * WORLD.h * 0.6,
      s: Math.random() < 0.8 ? 1.5 : 2.5,
      a: 0.25 + Math.random() * 0.6,
    });
  }
  return stars;
}

function makeSnowflakes(n, depth) {
  const flakes = [];
  for (let i = 0; i < n; i++) {
    flakes.push({
      x: Math.random() * WORLD.w,
      y: Math.random() * (WORLD.h + 60) - 30,
      r: (0.7 + Math.random() * 1.7) * depth,
      vx: (0.006 + Math.random() * 0.008) * depth,
      vy: (0.018 + Math.random() * 0.032) * depth,
      sway: (12 + Math.random() * 30) * depth,
      wave: 0.0007 + Math.random() * 0.001,
      twinkle: 0.001 + Math.random() * 0.002,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.42 + Math.random() * 0.48,
    });
  }
  return flakes;
}

function makeFogWisps(n) {
  const wisps = [];
  for (let i = 0; i < n; i++) {
    wisps.push({
      x: Math.random() * WORLD.w,
      y: 500 + Math.random() * 190,
      w: 120 + Math.random() * 190,
      h: 10 + Math.random() * 18,
      speed: 0.004 + Math.random() * 0.006,
      alpha: 0.035 + Math.random() * 0.045,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return wisps;
}

function makeForestFog(n) {
  const wisps = [];
  for (let i = 0; i < n; i++) {
    wisps.push({
      x: Math.random() * WORLD.w,
      y: 350 + Math.random() * 390,
      w: 140 + Math.random() * 230,
      h: 12 + Math.random() * 24,
      speed: 0.0025 + Math.random() * 0.0045,
      alpha: 0.035 + Math.random() * 0.055,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return wisps;
}

function makeFireflies(n) {
  const fireflies = [];
  for (let i = 0; i < n; i++) {
    fireflies.push({
      x: Math.random() * WORLD.w,
      y: 190 + Math.random() * 570,
      r: 0.9 + Math.random() * 1.8,
      drift: (Math.random() - 0.42) * 0.006,
      sway: 16 + Math.random() * 38,
      bob: 8 + Math.random() * 22,
      wobble: 0.0008 + Math.random() * 0.0014,
      float: 0.0009 + Math.random() * 0.0018,
      pulse: 0.002 + Math.random() * 0.006,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.45 + Math.random() * 0.55,
    });
  }
  return fireflies;
}

function makeLeaves(n) {
  const palette = ['#6fa34a', '#8fbf55', '#497c3b', '#9fbd52'];
  const leaves = [];
  for (let i = 0; i < n; i++) {
    leaves.push({
      x: Math.random() * WORLD.w,
      y: Math.random() * (WORLD.h + 60) - 30,
      vx: 0.008 + Math.random() * 0.015,
      vy: 0.012 + Math.random() * 0.028,
      sway: 18 + Math.random() * 42,
      wave: 0.00055 + Math.random() * 0.0012,
      spin: (Math.random() - 0.5) * 0.003,
      phase: Math.random() * Math.PI * 2,
      w: 2.5 + Math.random() * 4.2,
      h: 1.1 + Math.random() * 2.2,
      alpha: 0.12 + Math.random() * 0.22,
      color: palette[Math.floor(Math.random() * palette.length)],
    });
  }
  return leaves;
}

/**
 * Diset. Det slumpas inte fritt over rutan utan laggs i malningens egna
 * dimhojder (IVORY.mistBands) - det ar det som gor att det ser ut att hora till
 * bilden i stallet for att ligga ovanpa den.
 */
function makeIvoryMist(n) {
  const mist = [];
  for (let i = 0; i < n; i++) {
    const band = IVORY.mistBands[i % IVORY.mistBands.length];
    mist.push({
      x: Math.random() * WORLD.w,
      y: band.y + (Math.random() * 2 - 1) * band.spread,
      w: 170 + Math.random() * 260,
      h: 14 + Math.random() * 26,
      speed: 0.003 + Math.random() * 0.009,
      alpha: 0.05 + Math.random() * 0.1,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return mist;
}

/**
 * Loven. Djupet ligger i FARTEN: ett lov nara betraktaren ar storre, faller
 * snabbare och ar mindre genomskinligt an ett langre bort. Utan den kopplingen
 * blir de en jamn dimma av prickar i stallet for lov pa olika avstand.
 *
 * De borjar forst en bit ned i bild - lov som seglar hogt uppe i himlen over
 * bergen skulle se fel ut. Traden i malningen star i for- och mellangrunden.
 */
function makeIvoryLeaves(n) {
  const palette = ['#6f8f3f', '#84a04a', '#a8b45c', '#c9a44e', '#8d6b32', '#5d7a38'];
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const depth = Math.random(); // 0 = langt bort, 1 = alldeles framfor nasan
    leaves.push({
      x: Math.random() * WORLD.w,
      y: 320 + Math.random() * (WORLD.h - 300),
      vx: 0.012 + depth * 0.05, // vinden bar dem at hoger
      vy: 0.004 + depth * 0.022,
      sway: 14 + Math.random() * 46,
      wave: 0.0005 + Math.random() * 0.0013,
      spin: (Math.random() - 0.5) * 0.004,
      flip: 0.0008 + Math.random() * 0.0022,
      phase: Math.random() * Math.PI * 2,
      w: 2.6 + depth * 5.5,
      h: 1.4 + depth * 2.6,
      alpha: 0.3 + depth * 0.5,
      color: palette[Math.floor(Math.random() * palette.length)],
    });
  }
  return leaves;
}

/** Pollen och damm i motljuset. Stiger langsamt och driver med samma vind. */
function makeIvoryMotes(n) {
  const motes = [];
  for (let i = 0; i < n; i++) {
    motes.push({
      x: Math.random() * WORLD.w,
      y: Math.random() * WORLD.h,
      r: 0.8 + Math.random() * 1.8,
      rise: 0.004 + Math.random() * 0.016,
      drift: 0.002 + Math.random() * 0.008,
      sway: 8 + Math.random() * 22,
      wobble: 0.0004 + Math.random() * 0.0011,
      pulse: 0.001 + Math.random() * 0.0035,
      alpha: 0.16 + Math.random() * 0.32,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return motes;
}

/**
 * Faglarna flyger i FLOCKAR, inte var for sig. Enstaka prickar pa slumpade
 * banor laser som skrap pa skarmen; en flock som haller ihop laser som faglar.
 */
function makeCityFlocks(n) {
  const flocks = [];
  for (let i = 0; i < n; i++) {
    const birds = [];
    const count = 5 + Math.floor(Math.random() * 7);
    for (let b = 0; b < count; b++) {
      birds.push({
        dx: (Math.random() * 2 - 1) * 88,
        dy: (Math.random() * 2 - 1) * 32,
        size: 4 + Math.random() * 5,
        flap: 0.007 + Math.random() * 0.008,
        phase: Math.random() * Math.PI * 2,
      });
    }
    flocks.push({
      cx: 220 + Math.random() * (WORLD.w - 440),
      cy: 130 + Math.random() * 250,
      rx: 130 + Math.random() * 220,
      ry: 22 + Math.random() * 44,
      speed: 0.00013 + Math.random() * 0.00028,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.3 + Math.random() * 0.3,
      birds,
    });
  }
  return flocks;
}

function wrap(v, min, max) {
  const span = max - min;
  return ((((v - min) % span) + span) % span) + min;
}
