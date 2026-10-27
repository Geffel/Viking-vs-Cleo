import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonProfileStore } from '../server/profile-store.js';
import { ProfileStatistics, freshProfileAchievements, freshProfileStats } from '../server/profile-statistics.js';
import { TickMetrics } from '../server/tick-metrics.js';

function profile(profileId) {
  return {
    profileId,
    points: 0,
    killsAgainst: {},
    deathsBy: {},
    stats: freshProfileStats(),
    achievements: freshProfileAchievements(),
  };
}

const profiles = new Map([[1, profile(1)], [2, profile(2)], [3, profile(3)]]);
let now = 1234;
const statistics = new ProfileStatistics({ getProfileById: (id) => profiles.get(id), now: () => now });
const changed = statistics.applyEvents([
  { k: 'hit', player: { profileId: 1 }, target: { profileId: 2 }, actualDamage: 12, crit: true },
  { k: 'kill', player: { profileId: 1 }, victim: { profileId: 2 }, credited: true, firstInMatch: true, cause: 'melee' },
]);
assert.deepEqual([...changed].map((entry) => entry.profileId), [1, 2], 'only touched profiles are returned');
assert.equal(profiles.get(1).stats.combat.kills, 1);
assert.equal(profiles.get(2).stats.combat.deaths, 1);
assert.equal(profiles.get(3).stats.combat.hits, 0, 'unrelated profiles remain untouched');

const unlocks = statistics.unlockAchievements(changed);
assert.ok(unlocks.some(({ profile: entry, ids }) => entry.profileId === 1 && ids.includes('first_blood')));
assert.deepEqual(profiles.get(3).achievements.unlocked, {}, 'unrelated profiles are not achievement-evaluated');

const killChanges = statistics.applyKillFeed([{ killerProfileId: 1, victimProfileId: 2 }]);
assert.deepEqual([...killChanges].map((entry) => entry.profileId), [1, 2]);
assert.equal(profiles.get(1).killsAgainst[2], 1);
assert.equal(profiles.get(2).deathsBy[1], 1);

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'vvc-profile-store-test-'));
try {
  const store = new JsonProfileStore({ dataDir: tempDir });
  assert.equal(store.load(), null, 'missing storage returns an empty state');
  const snapshot = { version: 4, nextProfileId: 4, profiles: [...profiles.values()] };
  store.save(snapshot);
  assert.deepEqual(store.load(), snapshot, 'storage boundary round-trips the complete snapshot');
} finally {
  await rm(tempDir, { recursive: true });
}

const timing = new TickMetrics({ sampleLimit: 4 });
for (const sample of [1, 2, 3, 4]) timing.record(sample);
assert.deepEqual(timing.snapshot(), {
  ticks: 4,
  sampledTicks: 4,
  meanMs: 2.5,
  p95Ms: 4,
  p99Ms: 4,
  maxMs: 4,
});

console.log('PROFILE BOUNDARY TESTS OK: storage, isolated statistics and tick metrics are independently testable');
