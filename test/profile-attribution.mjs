import assert from 'node:assert/strict';
import {
  applyKillFeedToProfiles,
  normalizeProfileId,
  resolveProfileReference,
} from '../server/profile-ids.js';

const profiles = new Map([
  [1, { profileId: 1, killsAgainst: {}, deathsBy: {} }],
  [2, { profileId: 2, killsAgainst: {}, deathsBy: {} }],
]);
const getProfileById = (profileId) => profiles.get(profileId) ?? null;

for (const invalid of [undefined, null, '', 0, -1, 1.5, true, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(normalizeProfileId(invalid), null, `${String(invalid)} is not a valid stored profile ID`);
  assert.equal(
    resolveProfileReference({ profileId: invalid }, getProfileById),
    null,
    `${String(invalid)} cannot resolve to profile 1`,
  );
}
assert.equal(resolveProfileReference({}, getProfileById), null, 'a missing profile ID cannot resolve to profile 1');
assert.equal(resolveProfileReference({ profileId: 1 }, getProfileById), profiles.get(1));
assert.equal(resolveProfileReference({ profileId: '2' }, getProfileById), profiles.get(2));

const beforeGuests = structuredClone([...profiles.entries()]);
assert.equal(applyKillFeedToProfiles([
  { killerProfileId: 0, victimProfileId: 2 },
  { victimProfileId: 1 },
  { killerProfileId: 1, victimProfileId: 0 },
  { killerProfileId: 1 },
], getProfileById), false, 'guest and incomplete kills are not attributed to stored profiles');
assert.deepEqual([...profiles.entries()], beforeGuests, 'guest events leave every stored profile unchanged');

assert.equal(applyKillFeedToProfiles([
  { killerProfileId: 1, victimProfileId: 2 },
], getProfileById), true, 'two registered players still update opponent statistics');
assert.deepEqual(profiles.get(1).killsAgainst, { 2: 1 });
assert.deepEqual(profiles.get(2).deathsBy, { 1: 1 });

console.log('PROFILE ATTRIBUTION TESTS OK: guest IDs stay absent and registered opponents are attributed correctly');
