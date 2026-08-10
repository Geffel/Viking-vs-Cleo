// Delas av server och klient. Servern importerar filen direkt,
// klienten hamtar den via /shared/constants.js som ES-modul.

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;

// Hela varlden syns alltid pa skarmen - ingen kamera som foljer spelaren.
export const WORLD = { w: 1600, h: 900 };

export const PLAYER = {
  w: 30,
  h: 44,
  accel: 1.6,
  maxSpeed: 5.0,
  groundFriction: 0.78,
  airFriction: 0.92,
  jumpVel: -16.5,
  dropThroughVel: 3.2,
  dropThroughMs: 260,
  gravity: 0.68,
  maxFall: 19,
  maxHp: 300,
  respawnMs: 3000,
  spawnProtectionMs: 1500,
};

export const TEAMS = {
  cleo: { id: 'cleo', name: 'Cleo', color: '#ff4d9d', dark: '#7a1746', accent: '#ffd166' },
  viking: { id: 'viking', name: 'Viking', color: '#4dc3ff', dark: '#123f63', accent: '#e8f6ff' },
};

export const TEAM_IDS = ['cleo', 'viking'];

export const MATCH_PHASES = {
  globalLobby: 'globalLobby',
  matchLobby: 'matchLobby',
  mapVote: 'mapVote',
  countdown: 'countdown',
  playing: 'playing',
  results: 'results',
};

export const MATCH_PHASE_IDS = Object.values(MATCH_PHASES);
export const MAP_VOTE_MS = 30000;
export const MATCH_COUNTDOWN_MS = 5000;
export const MATCH_DURATION_MS = 6 * 60 * 1000;

// Klienten ritar andra spelare sa har langt bakat i tiden och interpolerar
// mellan ognapsbilder, sa att rorelsen blir mjuk aven om ett paket kommer sent.
// Servern maste kanna till exakt samma siffra: nar den avgor om ett slag traffar
// spolar den tillbaka motstandarna hit, till den bild angriparen faktiskt sag.
export const INTERP_MS = 50;

// Traffkontrollen spolar tillbaka i tiden. For att kunna gora det sparar servern
// varje spelares position en stund bakat.
export const LAGCOMP = {
  historyMs: 700,
  maxRewindMs: 250,
};

// Alla narstridsattacker delar samma tuning och cooldowngrupp. Q och E ar alltsa
// tva olika moves, men de dubblar inte attacktakten.
export const MELEE = {
  cooldown: 250,
  windupMs: 80,
  reach: 48,
  height: PLAYER.h,
  // Narstridsslag rullar en slumpad skada i det har spannet, precis som
  // formagorna (jfr sand/yxa). Rullningen gar via spelets seedbara rng.
  damageMin: 5,
  damageMax: 18,
  knockbackX: 4,
  knockbackY: -2.2,
};

export const MELEE_BINDS = [
  { slot: 'm1', code: 'KeyQ', keycap: 'Q' },
  { slot: 'm2', code: 'KeyE', keycap: 'E' },
];

export const MELEE_SLOTS = MELEE_BINDS.map((bind) => bind.slot);

export const MELEE_ATTACKS = {
  cleo: {
    m1: {
      id: 'punch',
      name: 'Punch',
      icon: '👊',
      cooldown: MELEE.cooldown,
      desc: 'A fast punch right in front of you.',
    },
    m2: {
      id: 'kick',
      name: 'Kick',
      icon: '🦶',
      cooldown: MELEE.cooldown,
      desc: 'A quick kick right in front of you.',
    },
  },
  viking: {
    m1: {
      id: 'axe',
      name: 'Axe',
      icon: '🪓',
      iconImage: '/assets/viking/axe_throw.png',
      cooldown: MELEE.cooldown,
      desc: 'A heavy axe swipe right in front of you.',
    },
    m2: {
      id: 'shield',
      name: 'Shield',
      icon: '🛡️',
      iconImage: '/assets/viking_shield_icon.png',
      cooldown: MELEE.cooldown,
      desc: 'A sharp shield bash right in front of you.',
    },
  },
};

export const BACKSTAB = { mul: 1.5 };

// Kritisk traff: rak sannolikhet pa allt som gor skada - narstrid, formagor och
// kastad yxa. Ingen uppbyggnad, ingen tur som sparas: varje traff slar sin egen
// tarning.
export const CRIT = {
  chance: 0.15,
  mul: 1.5,
};

// Combos: kedjar man ihop sina tva narstridsslag i ratt ordning slar det sista
// slaget i kedjan mycket hardare.
//
// Kedjan raknas pa TRAFFAR, inte pa tangenttryck. Ett slag som gar i tomma
// luften (eller som blockeras) borjar om, och gar det langre an windowMs mellan
// tva traffar borjar den ocksa om - annars vore bonusen gratis.
//
// seq listar melee-platser i den ordning de ska landa. m1/m2 ar tangenterna ur
// MELEE_BINDS, alltsa Q och E. Utover skadan kan finishern ha en effekt till -
// falten ar valfria och den som saknas gor ingenting:
//
//   finisherMul     skadan pa sista slaget
//   knockback       ersatter melee-knuffen, t.ex. for att kasta upp nagon
//   healSelf        angriparen far tillbaka hp
//   refundCooldown  melee blir redo direkt, sa nasta kedja kan borja pa en gang
//   stunMs          offret star still en stund
//
// EN REGEL NAR DU LAGGER TILL EN COMBO: ingen combo far ligga i borjan av en
// annan. Kedjan nollstalls nar en combo gar av, sa en kort combo som dyker upp
// pa vagen in i en lang skulle gora den langa omojlig att na. test/combat.mjs
// vaktar det at dig.
export const COMBO = {
  windowMs: 1400,
  list: [
    {
      id: 'crusher',
      name: 'Crusher',
      seq: ['m1', 'm1', 'm2', 'm1'],
      finisherMul: 2, // sista slaget gor 100 % mer skada
    },
    {
      // Snabb vaxling fram och tillbaka. Blygsam bonus, men melee blir redo pa
      // en gang - belonigen ar takten, inte smallen.
      id: 'flurry',
      name: 'Flurry',
      seq: ['m1', 'm2', 'm1', 'm2'],
      finisherMul: 1.5,
      refundCooldown: true,
    },
    {
      // Avslutas med en uppercut: offret kastas rakt upp i luften i stallet for
      // bakat, hjalplos hela vagen ner.
      id: 'skyfall',
      name: 'Skyfall',
      seq: ['m2', 'm2', 'm1', 'm2'],
      finisherMul: 1.4,
      knockback: { x: 3, y: -13 },
    },
    {
      // Fem traffar i rad utan att bomma. Den langsta kedjan, och den enda som
      // ger nagot tillbaka.
      id: 'executioner',
      name: 'Executioner',
      seq: ['m2', 'm1', 'm1', 'm2', 'm2'],
      finisherMul: 2.5,
      healSelf: 25,
    },
  ],
};

// Sa manga slag bakat servern behover minnas for att kunna kanna igen den
// langsta combon.
export const COMBO_MAX_LEN = Math.max(...COMBO.list.map((combo) => combo.seq.length));

export const ABILITIES = {
  cleo: {
    a1: {
      id: 'sandBlast',
      name: 'Sand blast',
      icon: '🌪️',
      cooldown: 6500,
      desc: 'Spray of sand just ahead of you: 5-10 damage and freezes them for 2 seconds.',
    },
    a2: {
      id: 'blink',
      name: 'Blink',
      icon: '✨',
      cooldown: 7000,
      desc: 'Vanish and reappear a short way forward, straight through walls and enemies.',
    },
    a3: {
      id: 'powerShield',
      name: 'Power shield',
      icon: '🛡️',
      cooldown: 60000,
      desc: 'Summons shields that block the next 3 incoming attacks made against you.',
    },
    a4: {
      id: 'sunFire',
      name: 'Sun fire',
      icon: 'SF',
      iconImage: '/assets/cleo/sun_fire_ball.png',
      cooldown: 30000,
      desc: 'Channels a ball of sunfire. Hold the hotkey to increase its strength, then release to launch it.',
    },
  },
  viking: {
    a1: {
      id: 'axeThrow',
      name: 'Axe throw',
      icon: '🪓',
      cooldown: 3500,
      desc: 'Send your axe flying - 25-35 damage to the first enemy it hits.',
    },
    a2: {
      id: 'shieldCharge',
      name: 'Shield charge',
      icon: '🛡️',
      cooldown: 8000,
      desc: 'Barrel forward behind your shield: 5-10 damage and a 1.5 second stun.',
    },
    a3: {
      id: 'mushrooms',
      name: 'Mushrooms',
      icon: '🍄',
      iconImage: '/assets/mushroom.png',
      cooldown: 60000,
      desc: 'Consume a fly agaric which causes you to go berserk. Increasing damage dealt by 30% but takes 30% more damage.',
    },
    a4: {
      id: 'lasso',
      name: 'Harpoon',
      icon: '🪝',
      cooldown: 9000,
      desc: 'Hook the first enemy ahead and reel them all the way in to you - 8-14 damage.',
    },
  },
};

export const ABILITY_BINDS = [
  { slot: 'a1', code: 'Digit1', keycap: '1' },
  { slot: 'a2', code: 'Digit2', keycap: '2' },
  { slot: 'a3', code: 'Digit3', keycap: '3' },
  { slot: 'a4', code: 'Digit4', keycap: '4' },
];

export const ABILITY_SLOTS = ABILITY_BINDS.map((bind) => bind.slot);
export const ACTION_SLOTS = [...MELEE_SLOTS, ...ABILITY_SLOTS];

// Knapparna pa en handkontroll, i den ordning Gamepad API:t rapporterar dem
// ("standard mapping"). Index = platsen i gamepad.buttons, sa en bindning ar
// bara en siffra - namnen bor har.
export const PAD_BUTTONS = [
  { short: 'A', label: 'A / Cross' },
  { short: 'B', label: 'B / Circle' },
  { short: 'X', label: 'X / Square' },
  { short: 'Y', label: 'Y / Triangle' },
  { short: 'LB', label: 'LB / L1' },
  { short: 'RB', label: 'RB / R1' },
  { short: 'LT', label: 'LT / L2' },
  { short: 'RT', label: 'RT / R2' },
  { short: 'Back', label: 'Back / Share' },
  { short: 'Start', label: 'Start / Options' },
  { short: 'L3', label: 'L3 / left stick' },
  { short: 'R3', label: 'R3 / right stick' },
  { short: 'Up', label: 'D-pad up' },
  { short: 'Down', label: 'D-pad down' },
  { short: 'Left', label: 'D-pad left' },
  { short: 'Right', label: 'D-pad right' },
  { short: 'Guide', label: 'Guide' },
];

// Standardknappen for varje plats. Rorelsen sitter pa vanster spak och d-paden
// och gar inte att binda om - den ar en riktning, inte en knapp.
//
// drop har dessutom en axel: drar man vanster spak nedat droppar man ocksa.
// Det hanger ihop med spaken, sa den foljer inte med om man binder om knappen.
export const GAMEPAD_BINDS = {
  move: { label: 'Left stick / D-pad' },
  jump: { button: 0 },
  drop: { button: 13, axis: 1 },
  m1: { button: 2 },
  m2: { button: 3 },
  a1: { button: 5 },
  a2: { button: 4 },
  a3: { button: 6 },
  a4: { button: 7 },
};

// Rorelsen bodde tidigare hardkodad i input.js. Nu star den bredvid melee och
// formagorna sa att alla bindningar gar att rakna upp pa ett stalle - vanster
// och hoger blir ett rorelsemeddelande, hopp och drop ar vanliga handelser.
export const MOVE_BINDS = [
  { slot: 'left', code: 'ArrowLeft', keycap: '←' },
  { slot: 'right', code: 'ArrowRight', keycap: '→' },
  { slot: 'jump', code: 'Space', keycap: 'Space' },
  { slot: 'drop', code: 'ArrowDown', keycap: '↓' },
];

export const MOVE_SLOTS = MOVE_BINDS.map((bind) => bind.slot);
export const BIND_SLOTS = [...MOVE_SLOTS, ...ACTION_SLOTS];

// Kategorierna pa kontrollsidan - samma indelning som HUD:en och info-fliken
// redan anvander: rorelse, narstrid, formagor. Farg per kategori sa att raden,
// ikonen och tangentbordskartan far samma ton.
export const KEYBIND_CATEGORIES = [
  { id: 'movement', name: 'Movement', color: TEAMS.viking.color, binds: MOVE_BINDS },
  { id: 'melee', name: 'Melee', color: TEAMS.cleo.color, binds: MELEE_BINDS },
  { id: 'abilities', name: 'Abilities', color: TEAMS.cleo.accent, binds: ABILITY_BINDS },
];

export const ABILITY_TUNING = {
  dash: { speed: 17, durationMs: 190 },
  heal: { amount: 40 },
  blink: { distance: 260 },
  powerShield: {
    charges: 3,
    orbitRadius: 38,
  },
  sandBlast: {
    range: 150,
    nearHalfHeight: 18,
    farHalfHeight: 58,
    damageMin: 5,
    damageMax: 10,
    stunMs: 2000,
    knockbackX: 4.5,
    knockbackY: -1.5,
  },
  sunFire: {
    channelMaxMs: 2200,
    moveSpeedMul: 0.7,
    speedMin: 12,
    speedMax: 21,
    lifeMs: 1550,
    maxRangeMin: 430,
    maxRangeMax: 820,
    wMin: 34,
    wMax: 78,
    hMin: 30,
    hMax: 70,
    damageMin: 10,
    damageMax: 80,
    damageSpread: 8,
    knockbackXMin: 2,
    knockbackXMax: 25,
    knockbackY: -4.5,
    spawnForward: 42,
    channelForward: 40,
    channelUp: -10,
    rotationSpeed: 0.18,
  },
  charge: { speed: 14.5, durationMs: 430, damage: 28, knockbackX: 11, knockbackY: -6 },
  shieldCharge: {
    speed: 7,
    durationMs: 720,
    range: 300,
    damageMin: 10,
    damageMax: 18,
    stunMs: 1500,
    hitW: 58,
    hitH: 52,
    knockbackX: 6.5,
    knockbackY: -2.5,
  },
  axeThrow: {
    speed: 18,
    lifeMs: 1100,
    maxRange: 650,
    w: 42,
    h: 32,
    damageMin: 25,
    damageMax: 35,
    knockbackX: 8.5,
    knockbackY: -4.5,
    spawnForward: 32,
    rotationSpeed: 0.45,
  },
  slam: { fallSpeed: 26, radius: 130, damage: 34, knockbackX: 10, knockbackY: -9 },
  mushrooms: {
    durationMs: 12000,
    dealtMul: 1.3,
    takenMul: 1.3,
    scale: 1.1,
    tint: 'rgba(255, 38, 24, 0.42)',
    glow: 'rgba(255, 60, 40,',
    pulseMs: 900,
    warnMs: 3000,
    warnBlinkMs: 220,
  },
  // Harpunen kastas som en projektil (samma system som yxan) och far kroken att
  // sitta forst nar den traffar. Den ar med flit LANGSAMMARE an yxan (18) sa att
  // den gar att hinna undan - skruva speed/maxRange for att andra hur dodgebar
  // den ar, w/h for traffytan. Traffar den: ingen knuff (knockback 0), i stallet
  // slapas offret in enligt reel-vardena nedan.
  lasso: {
    speed: 11, // px/tick - lagre = latare att undvika
    maxRange: 520, // hur langt harpunen nar innan den faller
    lifeMs: 1400,
    w: 40, // traffytans bredd
    h: 26, // traffytans hojd
    spawnForward: 30,
    knockbackX: 0, // ingen knuff - reprisen ager farten nar kroken sitter
    knockbackY: 0,
    rotationSpeed: 0, // harpunen snurrar inte, den pekar dit den flyger
    damageMin: 8,
    damageMax: 14,
    // Indragningen nar kroken sitter i offret:
    reelSpeed: 10, // farten offret slapas in med
    releaseDist: 46, // slapps nar offret ar sa har nara (px, mitt till mitt)
    durationMs: 900, // bortre grans sa att repet aldrig blir sittande for evigt
  },
};

export const MAP = {
  platforms: [
    { x: 0, y: 793, w: 1600, h: 107, ground: true },
    { x: 0, y: 630, w: 96, h: 18 },
    { x: 164, y: 688, w: 92, h: 18 },
    { x: 0, y: 478, w: 208, h: 18 },
    { x: 286, y: 455, w: 174, h: 18 },
    { x: 0, y: 383, w: 790, h: 18 },
    { x: 676, y: 607, w: 120, h: 16 },
    { x: 680, y: 152, w: 252, h: 18 },
    { x: 1030, y: 311, w: 570, h: 20 },
    { x: 1376, y: 478, w: 224, h: 18 },
    { x: 1052, y: 573, w: 166, h: 16 },
    { x: 1360, y: 651, w: 118, h: 16 },
    { x: 1522, y: 651, w: 70, h: 14 },
  ],
  spawns: {
    cleo: [
      { x: 90, y: 749 },
      { x: 205, y: 644 },
      { x: 75, y: 434 },
      { x: 230, y: 339 },
    ],
    viking: [
      { x: 1460, y: 749 },
      { x: 1400, y: 607 },
      { x: 1450, y: 434 },
      { x: 1240, y: 267 },
    ],
  },
};

// theme styr vilken levande bakgrund klienten ritar ovanpa arenabilden - se
// render.js. Kartor utan asset lanar fjordens bild, darav theme: 'nordic' pa dem.
//
// thumb ar den lilla forhandsbilden i kartrostningen. Utan den skulle lobbyn
// ladda alla arenabilder i full storlek (~2,5 MB styck) for att visa dem i en
// ruta pa nagra hundra pixlar. Byggs med `npm run thumbs`.
export const MAPS = [
  {
    id: 'fjord',
    name: 'Frozen Fjord',
    asset: '/assets/arena_nordic.png',
    thumb: '/assets/thumbs/fjord.jpg',
    theme: 'nordic',
    layout: 'classic',
  },
  {
    id: 'deep_forest',
    name: 'Deep Forest',
    asset: '/assets/arena_deep_forest.png',
    thumb: '/assets/thumbs/deep_forest.jpg',
    theme: 'forest',
    layout: 'deepForest',
  },
  {
    id: 'ivory_city',
    name: 'Ivory city',
    asset: '/assets/arena_ivory_city.png',
    thumb: '/assets/thumbs/ivory_city.jpg',
    theme: 'ivoryCity',
    layout: 'ivoryCity',
  },
  {
    id: 'arena_01',
    name: 'Nile Delta',
    asset: '/assets/arena_01.png',
    thumb: '/assets/thumbs/arena_01.jpg',
    theme: 'plain',
    layout: 'classic',
  },
];

export const POWERUP = {
  heal: 45,
  spawnIntervalMs: 20000,
  maxActive: 3,
  firstSpawnMs: 5000,
  w: 46,
  h: 46,
  hover: 42,
  bobAmp: 7,
  bobMs: 1400,
  buffMs: 2500,
  buffScale: 0.15,
};

export const POWERUP_KINDS = {
  pizza: { id: 'pizza', sprite: '/assets/pizza.png', ring: '#ffd166' },
  kebab: { id: 'kebab', sprite: '/assets/kebab.png', ring: '#ff9f43' },
};

export const POWERUP_KIND_IDS = ['pizza', 'kebab'];

export const DAMAGE_BUFF = {
  mul: 1.15,
  durationMs: 15000,
  blinkMs: 440,
  warnMs: 3000,
  warnBlinkMs: 190,
  minAlpha: 0.55,
};

// Ursinne (ENRAGED): landar man dodsstoten med en combo-finisher gar man in i
// raseri och delar ut mer skada en kort stund. En GLOBAL buff - den galler
// bada lagen och sitter inte pa nagon formaga, precis som kebaben. Den raknas
// in i damage() och staplas multiplikativt med kebaben och berserken.
// Forsvinner nar man dor, och en ny combo-dodsstot laddar om tiden.
export const ENRAGE = {
  mul: 1.5, // +50 % utdelad skada
  durationMs: 5000, // i 5 sekunder
  // Figuren blinkar rasande sa lange buffen varar, snabbare de sista sekunderna
  // sa att man ser att den haller pa att ta slut - samma monster som kebaben.
  blinkMs: 320,
  warnMs: 1500,
  warnBlinkMs: 150,
  minAlpha: 0.5,
  color: '#ff4d2d', // eldrott, skilt fran kebabens orange och berserkens rott
  spark: '#ffd166', // guldgnistor, samma ton som combons finisher
  glow: 'rgba(255, 77, 45,', // aura runt figuren, avslutas med " <alpha>)" i render
  pulseMs: 520, // argt pulserande aura
};

export const POWERUP_SPAWNS = [
  { x: 800, y: 751 },
  { x: 210, y: 646 },
  { x: 1419, y: 609 },
  { x: 736, y: 565 },
  { x: 136, y: 436 },
  { x: 1494, y: 436 },
  { x: 490, y: 341 },
  { x: 1175, y: 531 },
  { x: 814, y: 110 },
];

export const DEEP_FOREST_MAP = {
  platforms: [
    { x: 0, y: 780, w: 1600, h: 120, ground: true },
    { x: 0, y: 684, w: 435, h: 22 },
    { x: 1160, y: 684, w: 440, h: 22 },
    { x: 350, y: 560, w: 860, h: 24 },
    { x: 500, y: 465, w: 122, h: 18 },
    { x: 990, y: 465, w: 122, h: 18 },
    { x: 670, y: 394, w: 265, h: 18 },
    { x: 120, y: 272, w: 350, h: 22 },
    { x: 1135, y: 280, w: 360, h: 22 },
    { x: 548, y: 154, w: 505, h: 20 },
  ],
  spawns: {
    cleo: [
      { x: 90, y: 736 },
      { x: 120, y: 640 },
      { x: 245, y: 228 },
      { x: 645, y: 110 },
    ],
    viking: [
      { x: 1460, y: 736 },
      { x: 1360, y: 640 },
      { x: 1250, y: 236 },
      { x: 905, y: 110 },
    ],
  },
};

export const DEEP_FOREST_POWERUP_SPAWNS = [
  { x: 800, y: 738 },
  { x: 220, y: 642 },
  { x: 1375, y: 642 },
  { x: 800, y: 518 },
  { x: 560, y: 423 },
  { x: 1050, y: 423 },
  { x: 800, y: 352 },
  { x: 300, y: 230 },
  { x: 1320, y: 238 },
  { x: 800, y: 112 },
];

// Ivory city: stadens nedersta ringar, byggda som en trappa fran bada sidor
// upp mot citadellet i mitten. Till skillnad fran de andra kartorna ar den helt
// SPEGELSYMMETRISK kring x = 800 - staden ar en belagringsplats, ingen sida ska
// ha battre lage. Lagg till en plattform pa ena sidan och du maste lagga
// spegelbilden pa den andra (x_spegel = 1600 - x - w).
//
// Hojderna ar satta mot hoppet: jumpVel 16.5 och gravity 0.68 ger ~200 px, sa
// varje steg ligger pa 80-170 px. Vagen upp gar via flankerna, och den sista
// avsatsen (tornet, y 234) nas BARA fran citadellterrassen rakt under - den ar
// menad som en omstridd hojd, inte ett gomstalle.
export const IVORY_CITY_MAP = {
  platforms: [
    { x: 0, y: 786, w: 1600, h: 114, ground: true }, // Pelennor-slatten
    { x: 352, y: 700, w: 150, h: 18 }, // laga steg in mot porten
    { x: 1098, y: 700, w: 150, h: 18 },
    { x: 0, y: 672, w: 250, h: 20 }, // yttre bastioner vid spawnarna
    { x: 1350, y: 672, w: 250, h: 20 },
    { x: 660, y: 620, w: 280, h: 18 }, // bron over Stora porten
    { x: 250, y: 576, w: 330, h: 22 }, // ringmurarna
    { x: 1020, y: 576, w: 330, h: 22 },
    { x: 0, y: 466, w: 210, h: 20 }, // ovre flanker
    { x: 1390, y: 466, w: 210, h: 20 },
    { x: 430, y: 452, w: 150, h: 18 }, // trappsteg upp mot citadellet
    { x: 1020, y: 452, w: 150, h: 18 },
    { x: 620, y: 400, w: 360, h: 22 }, // citadellterrassen
    { x: 236, y: 318, w: 180, h: 18 }, // hoga utkiksposter
    { x: 1184, y: 318, w: 180, h: 18 },
    { x: 700, y: 234, w: 200, h: 18 }, // toppen av Vita tornet
  ],
  spawns: {
    cleo: [
      { x: 96, y: 742 },
      { x: 60, y: 628 },
      { x: 320, y: 532 },
      { x: 70, y: 422 },
    ],
    viking: [
      { x: 1474, y: 742 },
      { x: 1510, y: 628 },
      { x: 1250, y: 532 },
      { x: 1500, y: 422 },
    ],
  },
};

export const IVORY_CITY_POWERUP_SPAWNS = [
  { x: 800, y: 744 },
  { x: 125, y: 630 },
  { x: 1475, y: 630 },
  { x: 800, y: 578 },
  { x: 330, y: 534 },
  { x: 1270, y: 534 },
  { x: 505, y: 410 },
  { x: 1095, y: 410 },
  { x: 800, y: 358 },
  { x: 326, y: 276 },
  { x: 1274, y: 276 },
  { x: 800, y: 192 }, // toppen - vard att slass om
];

export const MAP_LAYOUTS = {
  classic: {
    platforms: MAP.platforms,
    spawns: MAP.spawns,
    powerupSpawns: POWERUP_SPAWNS,
  },
  deepForest: {
    platforms: DEEP_FOREST_MAP.platforms,
    spawns: DEEP_FOREST_MAP.spawns,
    powerupSpawns: DEEP_FOREST_POWERUP_SPAWNS,
  },
  ivoryCity: {
    platforms: IVORY_CITY_MAP.platforms,
    spawns: IVORY_CITY_MAP.spawns,
    powerupSpawns: IVORY_CITY_POWERUP_SPAWNS,
  },
};

export function mapConfigFor(mapId) {
  return MAPS.find((map) => map.id === mapId) ?? MAPS[0];
}

export function mapThemeFor(mapId) {
  return mapConfigFor(mapId)?.theme ?? 'plain';
}

export function mapLayoutFor(mapId) {
  const layoutId = mapConfigFor(mapId)?.layout ?? 'classic';
  return MAP_LAYOUTS[layoutId] ?? MAP_LAYOUTS.classic;
}

export const NAME_MAX = 14;

export const SPRITE_ANIM = {
  attackFrameMs: 80,
};
