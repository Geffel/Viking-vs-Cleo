import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SqliteProfileStore } from '../server/sqlite-profile-store.js';
import {
  backupProfileDatabase,
  importLegacyProfiles,
  restoreProfileDatabase,
  verifyProfileDatabase,
} from '../server/profile-import.js';

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'vvc-sqlite-store-'));
const snapshot = makeSnapshot(3);
const store = new SqliteProfileStore({ dataDir: tempDir });
await store.open();
assert.equal(await store.load(), null);

store.save(snapshot);
const latest = structuredClone(snapshot);
latest.profiles[0].points = 7;
latest.profiles[0].killsAgainst[2] = 4;
latest.profiles[1].deathsBy[1] = 4;
store.save(latest);
await store.flush();
assert.equal(store.status.pending, 0);
assert.equal(store.status.lastError, null);
await store.close();

const saved = verifyProfileDatabase(path.join(tempDir, 'profiles.sqlite'), latest);
assert.equal(saved.ok, true, JSON.stringify(saved));
assert.deepEqual(saved.actualTotals, saved.expectedTotals);

const importDir = await mkdtemp(path.join(os.tmpdir(), 'vvc-profile-import-'));
const sourcePath = path.join(importDir, 'profiles.json');
const targetPath = path.join(importDir, 'profiles.sqlite');
const backupDir = path.join(importDir, 'backups');
await import('node:fs/promises').then(({ writeFile }) => writeFile(sourcePath, `${JSON.stringify(snapshot, null, 2)}\n`));
const imported = await importLegacyProfiles({
  sourcePath, targetPath, backupDir,
  now: () => new Date('2026-10-27T12:00:00.000Z'),
});
assert.equal(imported.verification.ok, true);
assert.equal((await stat(imported.backupPath)).size, (await stat(sourcePath)).size);
const manifest = JSON.parse(await readFile(imported.manifestPath, 'utf8'));
assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
assert.deepEqual(manifest.totals, imported.verification.actualTotals);
await access(targetPath);

const changedProfileIds = structuredClone(snapshot);
changedProfileIds.profiles[0].profileId = 10;
assert.equal(verifyProfileDatabase(targetPath, changedProfileIds).ok, false,
  'verification rejects a different profile ID set even when the profile count is unchanged');

const changedAchievements = structuredClone(snapshot);
changedAchievements.profiles[0].achievements.unlocked = { another_achievement: 9 };
assert.equal(verifyProfileDatabase(targetPath, changedAchievements).ok, false,
  'verification rejects different achievements even when the unlocked count is unchanged');

const invalid = makeSnapshot(2);
invalid.profiles[1].profileId = 1;
await assert.rejects(
  importLegacyProfiles({ sourcePath: await writeSnapshot(importDir, invalid), targetPath: path.join(importDir, 'bad.sqlite'), backupDir }),
  /Invalid or duplicate profileId/,
);
await assert.rejects(access(path.join(importDir, 'bad.sqlite')),
  'a failed import never activates a target database');
assert.equal((await readdir(importDir)).some((name) => name.startsWith('bad.sqlite.import-')), false,
  'a failed import leaves no half-finished database');

const liveBackupDir = path.join(importDir, 'sqlite-backups');
const liveBackup = await backupProfileDatabase({
  sourcePath: targetPath,
  backupDir: liveBackupDir,
  now: () => new Date('2026-10-27T13:00:00.000Z'),
});
assert.equal(liveBackup.verification.ok, true);
assert.equal((await readdir(liveBackupDir)).some((name) => name.includes('.partial-')), false,
  'backup verification leaves no temporary SQLite sidecars');
const liveManifest = JSON.parse(await readFile(liveBackup.manifestPath, 'utf8'));
assert.match(liveManifest.sha256, /^[a-f0-9]{64}$/);
assert.deepEqual(liveManifest.totals, imported.verification.actualTotals);

const parkedTarget = `${targetPath}.before-restore`;
await rename(targetPath, parkedTarget);
const restored = await restoreProfileDatabase({ backupPath: liveBackup.backupPath, targetPath });
assert.equal(restored.verification.ok, true);
assert.deepEqual(restored.verification.actualTotals, imported.verification.actualTotals,
  'a restored SQLite backup preserves all verified profile totals and identity digests');
assert.equal((await readdir(importDir)).some((name) => name.includes('.restore-')), false,
  'restore verification leaves no temporary SQLite sidecars');
await assert.rejects(
  restoreProfileDatabase({ backupPath: liveBackup.backupPath, targetPath }),
  /Target already exists/,
  'restore never overwrites an active database');

await rm(tempDir, { recursive: true, force: true });
await rm(importDir, { recursive: true, force: true });

console.log('SQLITE PROFILE STORE TESTS OK: queue, guarded import, live backup and restore verification');

function makeSnapshot(points) {
  return {
    version: 4, nextProfileId: 3, globalStats: { factionWins: { cleo: 2, viking: 1 } },
    profiles: [
      { clientId: 'client-one', profileId: 1, name: 'One', points, playMs: 100, seen: 2, lastSeenAt: 10,
        killsAgainst: { 2: 1 }, deathsBy: { 2: 2 }, teamPlayMs: { cleo: 60, viking: 40 },
        stats: { matches: { played: 2 } }, achievements: { unlocked: { first_blood: 9 } } },
      { clientId: 'client-two', profileId: 2, name: 'Two', points: 2, playMs: 80, seen: 1, lastSeenAt: 11,
        killsAgainst: { 1: 2 }, deathsBy: { 1: 1 }, teamPlayMs: { cleo: 20, viking: 60 },
        stats: { matches: { played: 2 } }, achievements: { unlocked: {} } },
    ],
  };
}

async function writeSnapshot(directory, value) {
  const file = path.join(directory, 'invalid.json');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, JSON.stringify(value));
  return file;
}
