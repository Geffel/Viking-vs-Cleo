import { createHash } from 'node:crypto';
import { access, chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { backup } from 'node:sqlite';
import path from 'node:path';
import { SqliteProfileDatabase } from './sqlite-profile-database.js';
import { validateLegacySnapshot } from './profile-snapshot.js';

export async function importLegacyProfiles({ sourcePath, targetPath, backupDir, now = () => new Date() }) {
  try {
    await access(targetPath, constants.F_OK);
    throw new Error(`Target already exists; refusing to overwrite ${targetPath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const sourceBytes = await readFile(sourcePath);
  const source = JSON.parse(sourceBytes.toString('utf8'));
  const expectedTotals = validateLegacySnapshot(source);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await mkdir(backupDir, { recursive: true });

  const timestamp = now().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `profiles-${timestamp}.json`);
  const manifestPath = `${backupPath}.manifest.json`;
  const sourceInfo = await stat(sourcePath);
  const manifest = {
    createdAt: now().toISOString(),
    source: path.resolve(sourcePath),
    backup: path.resolve(backupPath),
    bytes: sourceInfo.size,
    sha256: createHash('sha256').update(sourceBytes).digest('hex'),
    totals: expectedTotals,
  };
  await copyFile(sourcePath, backupPath);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await chmod(backupPath, 0o444);
  await chmod(manifestPath, 0o444);

  const temporaryPath = `${targetPath}.import-${timestamp}`;
  let database;
  try {
    database = new SqliteProfileDatabase(temporaryPath);
    database.replaceSnapshot(source, { validate: true });
    const verification = database.verify(source);
    database.checkpoint();
    database.close();
    database = null;
    if (!verification.ok) throw new Error(`Import verification failed: ${JSON.stringify(verification)}`);
    await rename(temporaryPath, targetPath);
    return { targetPath, backupPath, manifestPath, verification };
  } catch (error) {
    database?.close();
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function verifyProfileDatabase(databasePath, expectedSnapshot = null) {
  const database = new SqliteProfileDatabase(databasePath, { readOnly: true });
  try { return database.verify(expectedSnapshot); }
  finally { database.close(); }
}

export async function backupProfileDatabase({ sourcePath, backupDir, now = () => new Date() }) {
  await access(sourcePath, constants.R_OK);
  await mkdir(backupDir, { recursive: true });
  const timestamp = now().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `profiles-${timestamp}.sqlite`);
  const temporaryPath = `${backupPath}.partial`;
  const manifestPath = `${backupPath}.manifest.json`;
  const source = new SqliteProfileDatabase(sourcePath, { readOnly: true });
  try {
    const sourceVerification = source.verify();
    if (!sourceVerification.ok) throw new Error(`Source database verification failed: ${JSON.stringify(sourceVerification)}`);
    await backup(source.db, temporaryPath);
  } finally {
    source.close();
  }

  try {
    const verification = verifyProfileDatabase(temporaryPath);
    await removeSqliteSidecars(temporaryPath);
    if (!verification.ok) throw new Error(`Backup verification failed: ${JSON.stringify(verification)}`);
    await rename(temporaryPath, backupPath);
    const bytes = await readFile(backupPath);
    const manifest = {
      createdAt: now().toISOString(),
      source: path.resolve(sourcePath),
      backup: path.resolve(backupPath),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      totals: verification.actualTotals,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await chmod(backupPath, 0o444);
    await chmod(manifestPath, 0o444);
    return { backupPath, manifestPath, verification };
  } catch (error) {
    await removeSqliteSidecars(temporaryPath);
    await rm(temporaryPath, { force: true });
    await rm(backupPath, { force: true });
    await rm(manifestPath, { force: true });
    throw error;
  }
}

export async function restoreProfileDatabase({ backupPath, targetPath }) {
  try {
    await access(targetPath, constants.F_OK);
    throw new Error(`Target already exists; refusing to overwrite ${targetPath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const backupBytes = await readFile(backupPath);
  const manifest = JSON.parse(await readFile(`${backupPath}.manifest.json`, 'utf8'));
  const backupSha256 = createHash('sha256').update(backupBytes).digest('hex');
  if (manifest.bytes !== backupBytes.length || manifest.sha256 !== backupSha256) {
    throw new Error('Backup does not match its manifest');
  }

  const source = new SqliteProfileDatabase(backupPath, { readOnly: true });
  let expectedSnapshot;
  try {
    const verification = source.verify();
    if (!verification.ok) throw new Error(`Backup verification failed: ${JSON.stringify(verification)}`);
    if (JSON.stringify(manifest.totals) !== JSON.stringify(verification.actualTotals)) {
      throw new Error('Backup totals do not match its manifest');
    }
    expectedSnapshot = source.load();
  } finally {
    source.close();
    await removeSqliteSidecars(backupPath);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.restore-${Date.now()}`;
  try {
    await copyFile(backupPath, temporaryPath);
    await chmod(temporaryPath, 0o644);
    const verification = verifyProfileDatabase(temporaryPath, expectedSnapshot);
    await removeSqliteSidecars(temporaryPath);
    if (!verification.ok) throw new Error(`Restored database verification failed: ${JSON.stringify(verification)}`);
    await rename(temporaryPath, targetPath);
    return { targetPath, verification };
  } catch (error) {
    await removeSqliteSidecars(temporaryPath);
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function removeSqliteSidecars(databasePath) {
  await Promise.all([
    rm(`${databasePath}-wal`, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
  ]);
}
