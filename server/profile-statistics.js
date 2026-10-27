import { ACHIEVEMENTS, evaluateAchievements } from '../shared/achievements.js';
import { normalizeProfileId, resolveProfileReference } from './profile-ids.js';

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

export function freshProfileAchievements() {
  return { unlocked: {} };
}

export function freshProfileStats() {
  return {
    matches: {
      played: 0, wins: 0, losses: 0, draws: 0, bestKills: 0, bestCritHits: 0,
      bestPowerups: 0, flawless3KillMatches: 0, byMap: {}, mapVotes: {}, unanimousMapVotes: 0,
    },
    combat: {
      hits: 0, critHits: 0, backstabHits: 0, protectedHits: 0, kills: 0, deaths: 0,
      firstBloods: 0, damageDealt: 0, damageTaken: 0, quickDamageHits: 0,
      surviveUnder10Hp: 0, lowHpKills: 0, revengeKills: 0, stunnedKills: 0,
      ownStunKills: 0, killsWhileKebab: 0, killsWhileEnraged: 0, killsWhileBerserk: 0,
      deathsWhileBerserk: 0, buffStackHits: 0, killsByCause: {}, deathsByCause: {},
    },
    combos: { finishers: 0, exactFinishers: 0, finisherKills: 0, enrages: 0, byId: {}, killsById: {} },
    powerups: { total: 0, byKind: {}, pizzaLowHp: 0, centerPickups: 0 },
    abilities: {
      used: {}, released: {}, hits: {}, kills: {}, longRangeHits: {}, fullChargeHits: {},
      blinkLowHp: 0, blinkThroughPlayer: 0, shieldBlocks: 0, fullShieldSets: 0,
      harpoonPulls: 0, harpoonSetupKills: 0,
    },
  };
}

export function ensureProfileStats(profile) {
  if (!profile.stats) profile.stats = freshProfileStats();
  return profile.stats;
}

export function ensureProfileAchievements(profile) {
  if (!profile.achievements) profile.achievements = freshProfileAchievements();
  if (!profile.achievements.unlocked) profile.achievements.unlocked = {};
  return profile.achievements;
}

export function sanitizeProfileStats(raw) {
  const stats = freshProfileStats();
  mergeStats(stats, raw);
  stats.matches.byMap = sanitizeMapStats(raw?.matches?.byMap);
  stats.matches.mapVotes = sanitizePlainCounterMap(raw?.matches?.mapVotes);
  stats.combat.killsByCause = sanitizePlainCounterMap(raw?.combat?.killsByCause);
  stats.combat.deathsByCause = sanitizePlainCounterMap(raw?.combat?.deathsByCause);
  stats.combos.byId = sanitizePlainCounterMap(raw?.combos?.byId);
  stats.combos.killsById = sanitizePlainCounterMap(raw?.combos?.killsById);
  stats.powerups.byKind = sanitizePlainCounterMap(raw?.powerups?.byKind);
  stats.abilities.used = sanitizePlainCounterMap(raw?.abilities?.used);
  stats.abilities.released = sanitizePlainCounterMap(raw?.abilities?.released);
  stats.abilities.hits = sanitizePlainCounterMap(raw?.abilities?.hits);
  stats.abilities.kills = sanitizePlainCounterMap(raw?.abilities?.kills);
  stats.abilities.longRangeHits = sanitizePlainCounterMap(raw?.abilities?.longRangeHits);
  stats.abilities.fullChargeHits = sanitizePlainCounterMap(raw?.abilities?.fullChargeHits);
  return stats;
}

export function sanitizeProfileAchievements(raw) {
  const achievements = freshProfileAchievements();
  const allowed = new Set(ACHIEVEMENTS.map((def) => def.id));
  for (const [id, value] of Object.entries(raw?.unlocked ?? {})) {
    const cleanId = cleanKey(id, 64);
    const unlockedAt = Math.max(0, Number(value) || 0);
    if (allowed.has(cleanId) && unlockedAt) achievements.unlocked[cleanId] = unlockedAt;
  }
  return achievements;
}

export function sanitizeCounterMap(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    const id = Math.max(1, Number(key) || 0);
    const count = Math.max(0, Number(value) || 0);
    if (id && count) out[id] = count;
  }
  return out;
}

export function sanitizeFactionWins(raw) {
  return { cleo: Math.max(0, Number(raw?.cleo) || 0), viking: Math.max(0, Number(raw?.viking) || 0) };
}

export class ProfileStatistics {
  constructor({ getProfileById, now = () => Date.now() }) {
    this.getProfileById = getProfileById;
    this.now = now;
  }

  applyKillFeed(feed) {
    const changed = new Set();
    for (const kill of feed ?? []) {
      const killerId = normalizeProfileId(kill?.killerProfileId);
      const victimId = normalizeProfileId(kill?.victimProfileId);
      if (killerId === null || victimId === null || killerId === victimId) continue;
      const killer = this.getProfileById(killerId);
      const victim = this.getProfileById(victimId);
      if (!killer || !victim) continue;
      killer.killsAgainst[victimId] = (killer.killsAgainst[victimId] ?? 0) + 1;
      victim.deathsBy[killerId] = (victim.deathsBy[killerId] ?? 0) + 1;
      changed.add(killer).add(victim);
    }
    return changed;
  }

  applyEvents(events) {
    const changed = new Set();
    for (const event of events ?? []) this.#applyEvent(event, changed);
    return changed;
  }

  applyMapVote(match, fallbackMapId = 'unknown') {
    const changed = new Set();
    const players = [...match.players.values()];
    const selectedMap = match.selectedMap || fallbackMapId;
    const unanimous = players.length > 0 && players.every((player) => match.mapVotes.get(player.id) === selectedMap);
    for (const player of players) {
      const profile = this.getProfileById(player.profileId);
      if (!profile) continue;
      const stats = ensureProfileStats(profile);
      const vote = match.mapVotes.get(player.id);
      if (vote) increment(stats.matches.mapVotes, vote);
      if (unanimous) stats.matches.unanimousMapVotes++;
      changed.add(profile);
    }
    return changed;
  }

  applyMatchResult(match, matchGame) {
    const changed = new Set();
    const score = match.finalScore ?? matchGame.score ?? { cleo: 0, viking: 0 };
    const winner = score.cleo === score.viking ? null : score.cleo > score.viking ? 'cleo' : 'viking';
    const mapId = match.selectedMap || matchGame.mapId || 'unknown';
    for (const player of matchGame.players.values()) {
      const profile = this.getProfileById(player.profileId);
      if (!profile) continue;
      const stats = ensureProfileStats(profile);
      const map = mapStats(stats, mapId);
      stats.matches.played++;
      map.played++;
      const result = !winner ? 'draws' : player.team === winner ? 'wins' : 'losses';
      stats.matches[result]++;
      map[result]++;
      stats.matches.bestKills = Math.max(stats.matches.bestKills, player.kills);
      stats.matches.bestCritHits = Math.max(stats.matches.bestCritHits, player.stats?.critHits ?? 0);
      stats.matches.bestPowerups = Math.max(stats.matches.bestPowerups, player.stats?.powerups ?? 0);
      if (player.kills >= 3 && player.deaths === 0) stats.matches.flawless3KillMatches++;
      changed.add(profile);
    }
    return { changed, winner };
  }

  unlockAchievements(changedProfiles) {
    const unlocks = [];
    for (const profile of changedProfiles ?? []) {
      const achievements = ensureProfileAchievements(profile);
      const states = evaluateAchievements(profileViewForAchievements(profile));
      const ids = [];
      for (const state of states) {
        if (!state.unlocked || achievements.unlocked[state.id]) continue;
        achievements.unlocked[state.id] = this.now();
        ids.push(state.id);
      }
      if (ids.length) unlocks.push({ profile, ids });
    }
    return unlocks;
  }

  #profile(ref) {
    return resolveProfileReference(ref, this.getProfileById);
  }

  #applyEvent(event, changed) {
    const source = this.#profile(event?.player);
    const target = this.#profile(event?.target ?? event?.victim);
    const touch = (profile) => { if (profile) changed.add(profile); return profile; };
    switch (event?.k) {
      case 'hit': {
        if (touch(source)) {
          const stats = ensureProfileStats(source);
          stats.combat.hits++;
          stats.combat.damageDealt += positive(event.actualDamage);
          if (event.crit) stats.combat.critHits++;
          if (event.backstab) stats.combat.backstabHits++;
          if (event.quickDamage) stats.combat.quickDamageHits++;
          if (event.buffStack) stats.combat.buffStackHits++;
          if (event.abilityId) {
            increment(stats.abilities.hits, event.abilityId);
            if (event.longRange) increment(stats.abilities.longRangeHits, event.abilityId);
            if (event.fullCharge) increment(stats.abilities.fullChargeHits, event.abilityId);
          }
        }
        if (touch(target)) {
          const stats = ensureProfileStats(target);
          stats.combat.damageTaken += positive(event.actualDamage);
          if (event.surviveUnder10Hp) stats.combat.surviveUnder10Hp++;
        }
        break;
      }
      case 'kill': {
        const killer = event.credited ? source : null;
        if (touch(killer)) {
          const stats = ensureProfileStats(killer);
          stats.combat.kills++;
          increment(stats.combat.killsByCause, event.cause || 'unknown');
          if (event.firstInMatch) stats.combat.firstBloods++;
          if (event.sourceHadKebab) stats.combat.killsWhileKebab++;
          if (event.sourceHadEnrage) stats.combat.killsWhileEnraged++;
          if (event.sourceHadBerserk) stats.combat.killsWhileBerserk++;
          if (event.retaliation) stats.combat.revengeKills++;
          if (event.lowHpKill) stats.combat.lowHpKills++;
          if (event.targetWasStunned) stats.combat.stunnedKills++;
          if (event.targetWasStunned && Number(event.targetStunnedBy) === Number(event.player?.playerId)) stats.combat.ownStunKills++;
          if (event.harpoonSetupKill) stats.abilities.harpoonSetupKills++;
          if (event.abilityId) increment(stats.abilities.kills, event.abilityId);
        }
        if (touch(target)) {
          const stats = ensureProfileStats(target);
          stats.combat.deaths++;
          increment(stats.combat.deathsByCause, event.cause || 'unknown');
          if (event.victimHadBerserk) stats.combat.deathsWhileBerserk++;
        }
        break;
      }
      case 'combo':
        if (touch(source)) {
          const stats = ensureProfileStats(source);
          stats.combos.finishers++;
          if (event.exact) stats.combos.exactFinishers++;
          if (event.killed) { stats.combos.finisherKills++; increment(stats.combos.killsById, event.comboId); }
          increment(stats.combos.byId, event.comboId);
        }
        break;
      case 'enrage': if (touch(source)) ensureProfileStats(source).combos.enrages++; break;
      case 'powerup':
        if (touch(source)) {
          const stats = ensureProfileStats(source);
          stats.powerups.total++; increment(stats.powerups.byKind, event.kind);
          if (event.kind === 'pizza' && event.lowHp) stats.powerups.pizzaLowHp++;
          if (event.center) stats.powerups.centerPickups++;
        }
        break;
      case 'ability_use':
        if (touch(source)) {
          const stats = ensureProfileStats(source); increment(stats.abilities.used, event.abilityId);
          if (event.abilityId === 'blink' && event.lowHp) stats.abilities.blinkLowHp++;
          if (event.abilityId === 'blink' && event.throughPlayer) stats.abilities.blinkThroughPlayer++;
        }
        break;
      case 'ability_release': if (touch(source)) increment(ensureProfileStats(source).abilities.released, event.abilityId); break;
      case 'shield_block':
        if (touch(source)) { const stats = ensureProfileStats(source); stats.abilities.shieldBlocks++; if (event.fullSet) stats.abilities.fullShieldSets++; }
        break;
      case 'protected_hit': if (touch(source)) ensureProfileStats(source).combat.protectedHits++; break;
      case 'harpoon_pull': if (touch(source)) ensureProfileStats(source).abilities.harpoonPulls++; break;
    }
  }
}

function profileViewForAchievements(profile) {
  return {
    ...profile,
    kills: Math.max(sumCounterMap(profile.killsAgainst), positive(profile.stats?.combat?.kills), positive(profile.points)),
    deaths: Math.max(sumCounterMap(profile.deathsBy), positive(profile.stats?.combat?.deaths)),
  };
}

function positive(value) { return Math.max(0, Number(value) || 0); }
function cleanKey(value, max = 48) { return String(value ?? '').replace(CONTROL_CHARS, '').trim().slice(0, max); }
function increment(object, key, amount = 1) { const id = cleanKey(key); if (id) object[id] = positive(object[id]) + amount; }
function sumCounterMap(map) { return Object.values(map ?? {}).reduce((sum, value) => sum + positive(value), 0); }
function mapStats(stats, mapId) { const id = String(mapId || 'unknown'); return stats.matches.byMap[id] ??= { played: 0, wins: 0, losses: 0, draws: 0 }; }
function mergeStats(target, raw) {
  if (!raw || typeof raw !== 'object') return target;
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in target)) continue;
    if (typeof target[key] === 'number') target[key] = positive(value);
    else if (target[key] && typeof target[key] === 'object' && value && typeof value === 'object' && !Array.isArray(value)) mergeStats(target[key], value);
  }
  return target;
}
function sanitizePlainCounterMap(raw) { const out = {}; for (const [key, value] of Object.entries(raw ?? {})) { const id = cleanKey(key); const count = positive(value); if (id && count) out[id] = count; } return out; }
function sanitizeMapStats(raw) { const out = {}; for (const [key, value] of Object.entries(raw ?? {})) { const id = cleanKey(key); if (id && value && typeof value === 'object') out[id] = { played: positive(value.played), wins: positive(value.wins), losses: positive(value.losses), draws: positive(value.draws) }; } return out; }
