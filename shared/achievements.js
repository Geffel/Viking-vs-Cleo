export const ACHIEVEMENT_CATEGORIES = ['Combat', 'Progression', 'Collection', 'Social'];

export const ACHIEVEMENT_TONES = {
  Combat: '#ff4d9d',
  Progression: '#4dc3ff',
  Collection: '#ffd166',
  Social: '#7cf5b0',
};

export const ACHIEVEMENTS = [
  {
    id: 'first_blood',
    title: 'First Blood',
    desc: 'Get your first kill.',
    cat: 'Progression',
    icon: '/assets/cleo/idle.png',
    pts: 10,
    pct: 82.4,
    goal: 1,
    progress: (p) => kills(p),
  },
  {
    id: 'back_again',
    title: 'Back Again',
    desc: 'Die and respawn for the first time.',
    cat: 'Progression',
    icon: '/assets/viking/idle.png',
    pts: 10,
    pct: 79.1,
    goal: 1,
    progress: (p) => deaths(p),
  },
  {
    id: 'team_player',
    title: 'Team Player',
    desc: 'Win a match with your team.',
    cat: 'Progression',
    icon: '/assets/viking_shield_icon.png',
    pts: 15,
    pct: 55.6,
    goal: 1,
    progress: (p) => stat(p, 'matches.wins'),
  },
  {
    id: 'straight_into_fight',
    title: 'Straight Into the Fight',
    desc: 'Deal damage within 5 seconds of the match starting.',
    cat: 'Combat',
    icon: '/assets/viking/axe_throw.png',
    pts: 15,
    pct: 46.8,
    goal: 1,
    progress: (p) => stat(p, 'combat.quickDamageHits'),
  },
  {
    id: 'not_today',
    title: 'Not Today',
    desc: 'Survive after dropping under 10 HP.',
    cat: 'Combat',
    icon: '/assets/pizza.png',
    pts: 20,
    pct: 28.7,
    goal: 1,
    progress: (p) => stat(p, 'combat.surviveUnder10Hp'),
  },
  {
    id: 'crit_happens',
    title: 'Crit Happens',
    desc: 'Land your first critical hit.',
    cat: 'Combat',
    icon: '/assets/cleo/sun_fire_ball.png',
    pts: 10,
    pct: 68.2,
    goal: 1,
    progress: (p) => stat(p, 'combat.critHits'),
  },
  {
    id: 'luck_or_skill',
    title: 'Luck or Skill?',
    desc: 'Land 3 critical hits in a single match.',
    cat: 'Combat',
    icon: '/assets/cleo/sun_fire_ball.png',
    pts: 25,
    pct: 18.9,
    goal: 3,
    progress: (p) => stat(p, 'matches.bestCritHits'),
  },
  {
    id: 'backstabber',
    title: 'Backstabber',
    desc: 'Hit an enemy from behind.',
    cat: 'Combat',
    icon: '/assets/cleo/kick1.png',
    pts: 15,
    pct: 34.1,
    goal: 1,
    progress: (p) => stat(p, 'combat.backstabHits'),
  },
  {
    id: 'no_mercy',
    title: 'No Mercy',
    desc: 'Reach 10 total kills.',
    cat: 'Combat',
    icon: '/assets/viking/axe_throw.png',
    pts: 20,
    pct: 36.4,
    goal: 10,
    progress: (p) => kills(p),
  },
  {
    id: 'clean_round',
    title: 'Clean Round',
    desc: 'Win a match with at least 3 kills and no deaths.',
    cat: 'Combat',
    icon: '/assets/arena_01.png',
    pts: 35,
    pct: 9.4,
    goal: 1,
    progress: (p) => stat(p, 'matches.flawless3KillMatches'),
  },
  {
    id: 'last_word',
    title: 'Last Word',
    desc: 'Take revenge on a fighter who recently killed you.',
    cat: 'Combat',
    icon: '/assets/viking/attack1.png',
    pts: 20,
    pct: 21.8,
    goal: 1,
    progress: (p) => stat(p, 'combat.revengeKills'),
  },
  {
    id: 'protected_but_not',
    title: 'Protected, But Not for Long',
    desc: 'Strike an enemy while their spawn protection blocks the hit.',
    cat: 'Combat',
    icon: '/assets/cleo_shield_icon.png',
    pts: 10,
    pct: 40.2,
    goal: 1,
    progress: (p) => stat(p, 'combat.protectedHits'),
  },
  {
    id: 'crusher',
    title: 'Crusher',
    desc: 'Complete the Crusher combo.',
    cat: 'Combat',
    icon: '/assets/viking/attack2.png',
    pts: 20,
    pct: 24.3,
    goal: 1,
    progress: (p) => counter(p, 'combos.byId', 'crusher'),
  },
  {
    id: 'flurry',
    title: 'Flurry',
    desc: 'Complete the Flurry combo.',
    cat: 'Combat',
    icon: '/assets/cleo/punch2.png',
    pts: 20,
    pct: 23.9,
    goal: 1,
    progress: (p) => counter(p, 'combos.byId', 'flurry'),
  },
  {
    id: 'skyfall',
    title: 'Skyfall',
    desc: 'Complete the Skyfall combo.',
    cat: 'Combat',
    icon: '/assets/cleo/kick3.png',
    pts: 20,
    pct: 19.6,
    goal: 1,
    progress: (p) => counter(p, 'combos.byId', 'skyfall'),
  },
  {
    id: 'executioner',
    title: 'Executioner',
    desc: 'Complete the Executioner combo.',
    cat: 'Combat',
    icon: '/assets/viking/attack3.png',
    pts: 25,
    pct: 14.7,
    goal: 1,
    progress: (p) => counter(p, 'combos.byId', 'executioner'),
  },
  {
    id: 'combo_apprentice',
    title: 'Combo Apprentice',
    desc: 'Complete 5 combo finishers.',
    cat: 'Combat',
    icon: '/assets/cleo/punch1.png',
    pts: 25,
    pct: 20.4,
    goal: 5,
    progress: (p) => stat(p, 'combos.finishers'),
  },
  {
    id: 'combo_master',
    title: 'Combo Master',
    desc: 'Complete 25 combo finishers.',
    cat: 'Combat',
    icon: '/assets/viking/attack1.png',
    pts: 40,
    pct: 6.8,
    goal: 25,
    progress: (p) => stat(p, 'combos.finishers'),
  },
  {
    id: 'perfect_chain',
    title: 'Perfect Chain',
    desc: 'Finish 5 exact combo chains.',
    cat: 'Combat',
    icon: '/assets/cleo/punch3.png',
    pts: 35,
    pct: 8.7,
    goal: 5,
    progress: (p) => stat(p, 'combos.exactFinishers'),
  },
  {
    id: 'enraged',
    title: 'Enraged',
    desc: 'Trigger enrage from a combo finisher kill.',
    cat: 'Combat',
    icon: '/assets/kebab.png',
    pts: 25,
    pct: 16.1,
    goal: 1,
    progress: (p) => stat(p, 'combos.enrages'),
  },
  {
    id: 'five_seconds_fury',
    title: 'Five Seconds of Fury',
    desc: 'Get a kill while enraged.',
    cat: 'Combat',
    icon: '/assets/kebab.png',
    pts: 35,
    pct: 7.9,
    goal: 1,
    progress: (p) => stat(p, 'combat.killsWhileEnraged'),
  },
  {
    id: 'sand_eyes',
    title: 'Sand in Your Eyes',
    desc: 'Hit an enemy with Cleo\'s Sand blast.',
    cat: 'Combat',
    icon: '/assets/cleo/sand_blast1.png',
    pts: 15,
    pct: 39.8,
    goal: 1,
    progress: (p) => counter(p, 'abilities.hits', 'sandBlast'),
  },
  {
    id: 'stand_still',
    title: 'Stand Still',
    desc: 'Kill a fighter while they are stunned by you.',
    cat: 'Combat',
    icon: '/assets/cleo/stunned.png',
    pts: 25,
    pct: 17.6,
    goal: 1,
    progress: (p) => stat(p, 'combat.ownStunKills'),
  },
  {
    id: 'blink_miss',
    title: 'Blink and You\'ll Miss It',
    desc: 'Use Blink 10 times.',
    cat: 'Progression',
    icon: '/assets/cleo/idle.png',
    pts: 20,
    pct: 31.5,
    goal: 10,
    progress: (p) => counter(p, 'abilities.used', 'blink'),
  },
  {
    id: 'through_wall',
    title: 'Through the Wall',
    desc: 'Blink through an opponent.',
    cat: 'Progression',
    icon: '/assets/cleo/idle.png',
    pts: 25,
    pct: 11.9,
    goal: 1,
    progress: (p) => stat(p, 'abilities.blinkThroughPlayer'),
  },
  {
    id: 'sun_god_smiles',
    title: 'The Sun God Smiles',
    desc: 'Hit an enemy with Sun fire.',
    cat: 'Combat',
    icon: '/assets/cleo/sun_fire_ball.png',
    pts: 20,
    pct: 27.4,
    goal: 1,
    progress: (p) => counter(p, 'abilities.hits', 'sunFire'),
  },
  {
    id: 'full_charge',
    title: 'Full Charge',
    desc: 'Land a fully charged Sun fire hit.',
    cat: 'Combat',
    icon: '/assets/cleo/sun_fire_projectile.png',
    pts: 30,
    pct: 8.3,
    goal: 1,
    progress: (p) => counter(p, 'abilities.fullChargeHits', 'sunFire'),
  },
  {
    id: 'three_shields_later',
    title: 'Three Shields Later',
    desc: 'Block all 3 Power shield charges in one set.',
    cat: 'Combat',
    icon: '/assets/cleo_shield_icon.png',
    pts: 30,
    pct: 10.8,
    goal: 1,
    progress: (p) => stat(p, 'abilities.fullShieldSets'),
  },
  {
    id: 'axe_delivery',
    title: 'Axe Delivery',
    desc: 'Hit an enemy with Axe throw.',
    cat: 'Combat',
    icon: '/assets/viking/axe_throw.png',
    pts: 15,
    pct: 42.7,
    goal: 1,
    progress: (p) => counter(p, 'abilities.hits', 'axeThrow'),
  },
  {
    id: 'long_throw',
    title: 'Long Throw',
    desc: 'Land a long-range Axe throw hit.',
    cat: 'Combat',
    icon: '/assets/viking/axe_throw.png',
    pts: 25,
    pct: 15.8,
    goal: 1,
    progress: (p) => counter(p, 'abilities.longRangeHits', 'axeThrow'),
  },
  {
    id: 'shield_wall',
    title: 'Shield Wall',
    desc: 'Block 25 attacks with shields.',
    cat: 'Combat',
    icon: '/assets/viking_shield_icon.png',
    pts: 30,
    pct: 12.6,
    goal: 25,
    progress: (p) => stat(p, 'abilities.shieldBlocks'),
  },
  {
    id: 'run_over',
    title: 'Run Over',
    desc: 'Hit an enemy with Shield charge.',
    cat: 'Combat',
    icon: '/assets/viking/shield_charge.png',
    pts: 15,
    pct: 33.2,
    goal: 1,
    progress: (p) => counter(p, 'abilities.hits', 'shieldCharge'),
  },
  {
    id: 'mushroom_might',
    title: 'Mushroom Might',
    desc: 'Get a kill while berserk from mushrooms.',
    cat: 'Combat',
    icon: '/assets/mushroom.png',
    pts: 25,
    pct: 14.1,
    goal: 1,
    progress: (p) => stat(p, 'combat.killsWhileBerserk'),
  },
  {
    id: 'expensive_buffet',
    title: 'Expensive Buffet',
    desc: 'Pick up 25 kebabs.',
    cat: 'Collection',
    icon: '/assets/kebab.png',
    pts: 25,
    pct: 18.2,
    goal: 25,
    progress: (p) => counter(p, 'powerups.byKind', 'kebab'),
  },
  {
    id: 'get_over_here',
    title: 'Get Over Here',
    desc: 'Pull an enemy with Harpoon.',
    cat: 'Combat',
    icon: '/assets/viking_harpoon_projectile.png',
    pts: 15,
    pct: 29.6,
    goal: 1,
    progress: (p) => stat(p, 'abilities.harpoonPulls'),
  },
  {
    id: 'hooked',
    title: 'Hooked',
    desc: 'Kill an enemy shortly after harpooning them.',
    cat: 'Combat',
    icon: '/assets/viking_harpoon_projectile.png',
    pts: 30,
    pct: 9.9,
    goal: 1,
    progress: (p) => stat(p, 'abilities.harpoonSetupKills'),
  },
  {
    id: 'pizza_saves_lives',
    title: 'Pizza Saves Lives',
    desc: 'Pick up pizza while under 10 HP.',
    cat: 'Collection',
    icon: '/assets/pizza.png',
    pts: 25,
    pct: 16.9,
    goal: 1,
    progress: (p) => stat(p, 'powerups.pizzaLowHp'),
  },
  {
    id: 'hungry_warrior',
    title: 'Hungry Warrior',
    desc: 'Collect 10 powerups.',
    cat: 'Collection',
    icon: '/assets/pizza.png',
    pts: 15,
    pct: 43.3,
    goal: 10,
    progress: (p) => stat(p, 'powerups.total'),
  },
  {
    id: 'kebab_power',
    title: 'Kebab Power',
    desc: 'Pick up your first kebab.',
    cat: 'Collection',
    icon: '/assets/kebab.png',
    pts: 10,
    pct: 52.5,
    goal: 1,
    progress: (p) => counter(p, 'powerups.byKind', 'kebab'),
  },
  {
    id: 'buff_stacker',
    title: 'Buff Stacker',
    desc: 'Land a hit while multiple damage buffs overlap.',
    cat: 'Combat',
    icon: '/assets/mushroom.png',
    pts: 35,
    pct: 5.7,
    goal: 1,
    progress: (p) => stat(p, 'combat.buffStackHits'),
  },
  {
    id: 'center_field_mine',
    title: 'Center Field Is Mine',
    desc: 'Collect 5 center-field powerups.',
    cat: 'Collection',
    icon: '/assets/arena_01.png',
    pts: 20,
    pct: 24.8,
    goal: 5,
    progress: (p) => stat(p, 'powerups.centerPickups'),
  },
  {
    id: 'fjord_fighter',
    title: 'Fjord Fighter',
    desc: 'Win a match on Frozen Fjord.',
    cat: 'Collection',
    icon: '/assets/thumbs/fjord.jpg',
    pts: 20,
    pct: 26.2,
    goal: 1,
    progress: (p) => mapWins(p, 'fjord'),
  },
  {
    id: 'forest_terror',
    title: 'Forest Terror',
    desc: 'Win a match in Deep Forest.',
    cat: 'Collection',
    icon: '/assets/thumbs/deep_forest.jpg',
    pts: 20,
    pct: 22.5,
    goal: 1,
    progress: (p) => mapWins(p, 'deep_forest'),
  },
  {
    id: 'ivory_victor',
    title: 'Ivory Victor',
    desc: 'Win a match in Ivory City.',
    cat: 'Collection',
    icon: '/assets/thumbs/ivory_city.jpg',
    pts: 20,
    pct: 20.8,
    goal: 1,
    progress: (p) => mapWins(p, 'ivory_city'),
  },
  {
    id: 'nile_delta_lord',
    title: 'Lord of the Nile Delta',
    desc: 'Win a match on Nile Delta.',
    cat: 'Collection',
    icon: '/assets/thumbs/arena_01.jpg',
    pts: 20,
    pct: 25.7,
    goal: 1,
    progress: (p) => mapWins(p, 'arena_01'),
  },
  {
    id: 'tourist',
    title: 'Tourist',
    desc: 'Play on all 4 maps.',
    cat: 'Collection',
    icon: '/assets/arena_01.png',
    pts: 30,
    pct: 13.4,
    goal: 4,
    progress: (p) => uniquePlayedMaps(p),
  },
  {
    id: 'map_voter',
    title: 'Map Voter',
    desc: 'Cast 10 map votes.',
    cat: 'Social',
    icon: '/assets/arena_nordic.png',
    pts: 15,
    pct: 37.2,
    goal: 10,
    progress: (p) => totalCounter(stat(p, 'matches.mapVotes')),
  },
  {
    id: 'unanimous',
    title: 'Unanimous',
    desc: 'Be part of a unanimous map vote.',
    cat: 'Social',
    icon: '/assets/cleo_shield_icon.png',
    pts: 20,
    pct: 18.5,
    goal: 1,
    progress: (p) => stat(p, 'matches.unanimousMapVotes'),
  },
  {
    id: 'nemesis',
    title: 'Nemesis',
    desc: 'Have one rival defeat you 3 times.',
    cat: 'Social',
    icon: '/assets/viking/idle.png',
    pts: 15,
    pct: 35.5,
    goal: 3,
    progress: (p) => Math.max(0, Number(p?.nemesis?.count) || 0),
  },
  {
    id: 'vengeance_mine',
    title: 'Vengeance Is Mine',
    desc: 'Score 3 revenge kills.',
    cat: 'Combat',
    icon: '/assets/viking/attack3.png',
    pts: 30,
    pct: 11.2,
    goal: 3,
    progress: (p) => stat(p, 'combat.revengeKills'),
  },
  {
    id: 'prey_found',
    title: 'Prey Found',
    desc: 'Defeat the same rival 3 times.',
    cat: 'Social',
    icon: '/assets/cleo/idle.png',
    pts: 20,
    pct: 28.1,
    goal: 3,
    progress: (p) => Math.max(0, Number(p?.prey?.count) || 0),
  },
  {
    id: 'kd_proud',
    title: 'K/D Proud',
    desc: 'Reach 10 kills with a K/D ratio of 2.0 or higher.',
    cat: 'Progression',
    icon: '/assets/viking_shield_icon.png',
    pts: 40,
    pct: 6.1,
    goal: 10,
    progress: (p) => Math.min(10, kills(p)),
    unlocked: (p) => {
      const k = kills(p);
      const d = deaths(p);
      return k >= 10 && k / Math.max(1, d) >= 2;
    },
  },
  {
    id: 'veteran',
    title: 'Veteran',
    desc: 'Play 50 matches.',
    cat: 'Progression',
    icon: '/assets/arena_01.png',
    pts: 50,
    pct: 3.9,
    goal: 50,
    progress: (p) => stat(p, 'matches.played'),
  },
];

export function publicAchievement(def) {
  return {
    id: def.id,
    title: def.title,
    desc: def.desc,
    cat: def.cat,
    icon: def.icon,
    pts: def.pts,
    pct: def.pct,
    goal: def.goal,
  };
}

export function publicAchievements(defs = ACHIEVEMENTS) {
  return defs.map(publicAchievement);
}

export function achievementUnlockStats(profiles = [], defs = ACHIEVEMENTS) {
  const list = Array.from(typeof profiles?.values === 'function' ? profiles.values() : profiles ?? []);
  const totalProfiles = list.length;
  const unlocked = {};
  const pcts = {};

  for (const def of defs) {
    let count = 0;
    for (const profile of list) {
      if (isAchievementUnlocked(def, profile)) count++;
    }
    unlocked[def.id] = count;
    pcts[def.id] = totalProfiles ? Math.round((count / totalProfiles) * 1000) / 10 : 0;
  }

  return { totalProfiles, unlocked, pcts };
}

export function isAchievementUnlocked(def, profile) {
  if (!def?.id) return false;
  if (profile?.achievements?.unlocked?.[def.id]) return true;
  return achievementProgress(def, profile).unlocked;
}

export function rarityForPct(pct) {
  const n = Number(pct) || 0;
  if (n < 2) return { label: 'Legendary', tone: '#c58bff' };
  if (n < 10) return { label: 'Epic', tone: '#ff4d9d' };
  if (n < 35) return { label: 'Rare', tone: '#4dc3ff' };
  return { label: 'Common', tone: '#9fb0d0' };
}

export function achievementProgress(def, profile) {
  const raw = typeof def.progress === 'function' ? def.progress(profile ?? {}) : 0;
  const cur = Math.max(0, Number(raw?.cur ?? raw) || 0);
  const max = Math.max(1, Number(raw?.max ?? def.goal) || 1);
  const unlocked = typeof def.unlocked === 'function' ? !!def.unlocked(profile ?? {}) : cur >= max;
  return { cur, max, unlocked, pct: Math.min(100, (cur / max) * 100) };
}

export function evaluateAchievements(profile) {
  return ACHIEVEMENTS.map((def) => ({
    ...publicAchievement(def),
    ...achievementProgress(def, profile),
  }));
}

export function stat(profile, path) {
  return readPath(profile?.stats, path);
}

export function counter(profile, path, key) {
  return Math.max(0, Number(readPath(profile?.stats, `${path}.${key}`)) || 0);
}

function kills(profile) {
  return Math.max(stat(profile, 'combat.kills'), Math.max(0, Number(profile?.kills) || 0));
}

function deaths(profile) {
  return Math.max(stat(profile, 'combat.deaths'), Math.max(0, Number(profile?.deaths) || 0));
}

function mapWins(profile, mapId) {
  return Math.max(0, Number(readPath(profile?.stats, `matches.byMap.${mapId}.wins`)) || 0);
}

function uniquePlayedMaps(profile) {
  const byMap = readPath(profile?.stats, 'matches.byMap') ?? {};
  return ['fjord', 'deep_forest', 'ivory_city', 'arena_01'].filter((id) => Number(byMap[id]?.played) > 0).length;
}

function totalCounter(obj) {
  let total = 0;
  for (const value of Object.values(obj ?? {})) total += Math.max(0, Number(value) || 0);
  return total;
}

function readPath(root, path) {
  let value = root;
  for (const part of String(path || '').split('.')) {
    if (!part) continue;
    value = value?.[part];
  }
  return value;
}
