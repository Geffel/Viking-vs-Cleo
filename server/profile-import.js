import { createHash } from 'node:crypto';
import { access, chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
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
  const database = new SqliteProfileDatabase(databasePath);
  try { return database.verify(expectedSnapshot); }
  finally { database.close(); }
}
