import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { AccountService } from '../server/account-service.js';
import { SqliteProfileDatabase } from '../server/sqlite-profile-database.js';
import { SqliteProfileStore } from '../server/sqlite-profile-store.js';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'vvc-profile-migration-'));
const filePath = path.join(dataDir, 'profiles.sqlite');
const snapshot = {
  version: 4,
  nextProfileId: 3,
  profiles: [
    legacyProfile(1, 'legacy-one', 'Same Fighter', 17, { 2: 4 }, { 2: 3 }),
    legacyProfile(2, 'legacy-two', 'Same Fighter', 9, { 1: 3 }, { 1: 4 }),
  ],
};
const seed = new SqliteProfileDatabase(filePath);
seed.replaceSnapshot(snapshot, { validate: true });
seed.close();

const first = new AccountService({ dataDir, now: () => 1_800_000_000_000 });
const second = new AccountService({ dataDir, now: () => 1_800_000_000_001 });

try {
  await first.open();
  await second.open();
  assert.deepEqual(await first.findLegacyProfile('legacy-one'), {
    profileId: 1, displayName: 'Same Fighter', points: 17, playMs: 1200, seen: 6,
    kills: 4, deaths: 3, matches: 5, achievements: 1,
  });
  assert.equal(await first.findLegacyProfile('unknown-client'), null);

  const attempts = await Promise.allSettled([
    first.migrateLegacyProfile('legacy-one', 'fighter.one', 'one secure migration password'),
    second.migrateLegacyProfile('legacy-one', 'fighter.alt', 'another secure migration pass'),
  ]);
  const winners = attempts.filter((entry) => entry.status === 'fulfilled');
  const losers = attempts.filter((entry) => entry.status === 'rejected');
  assert.equal(winners.length, 1, 'exactly one concurrent claim succeeds');
  assert.equal(losers.length, 1);
  assert.equal(losers[0].reason.code, 'LEGACY_PROFILE_UNAVAILABLE');
  const migrated = winners[0].value;
  assert.equal(migrated.profileId, 1);
  assert.equal(migrated.recoveryCodes.length, 10);
  assert.equal((await first.verifySession(migrated.token)).profileId, 1);
  assert.equal(await first.findLegacyProfile('legacy-one'), null, 'a migrated legacy identity cannot claim again');

  const duplicateName = await second.migrateLegacyProfile(
    'legacy-two', 'fighter.two', 'second profile secure password',
  );
  assert.equal(duplicateName.profileId, 2, 'duplicate display names can use distinct account names');

  const db = new DatabaseSync(filePath, { readOnly: true });
  const accountCount = db.prepare('SELECT count(*) AS count FROM accounts').get().count;
  const claims = db.prepare('SELECT profile_id, status FROM legacy_profile_claims ORDER BY profile_id').all()
    .map((row) => ({ ...row }));
  const firstAccountId = db.prepare('SELECT account_id FROM profiles WHERE profile_id = 1').get().account_id;
  db.close();
  assert.equal(accountCount, 2);
  assert.deepEqual(claims, [
    { profile_id: 1, status: 'migrated' }, { profile_id: 2, status: 'migrated' },
  ]);
  assert.ok(firstAccountId);

  await Promise.all([first.close(), second.close()]);
  const store = new SqliteProfileStore({ dataDir });
  await store.open();
  const checkpoint = await store.load();
  checkpoint.profiles[0].points++;
  store.save(checkpoint);
  await store.close();

  const afterCheckpoint = new DatabaseSync(filePath, { readOnly: true });
  assert.equal(afterCheckpoint.prepare('SELECT account_id FROM profiles WHERE profile_id = 1').get().account_id !== null, true,
    'statistics checkpoints preserve the account link');
  assert.equal(afterCheckpoint.prepare('SELECT status FROM legacy_profile_claims WHERE profile_id = 1').get().status, 'migrated',
    'statistics checkpoints cannot reopen a migrated claim');
  afterCheckpoint.close();

  console.log('PROFILE MIGRATION TESTS OK: summaries, atomic claims, duplicate names and checkpoint safety are enforced');
} finally {
  await first.close().catch(() => {});
  await second.close().catch(() => {});
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function legacyProfile(profileId, clientId, name, points, killsAgainst, deathsBy) {
  return {
    clientId, profileId, name, points, playMs: 1200, seen: 6, lastSeenAt: 100,
    killsAgainst, deathsBy, teamPlayMs: { cleo: 700, viking: 500 },
    stats: { matches: { played: 5 } }, achievements: { unlocked: { first_blood: 99 } },
  };
}
