import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import {
  backupProfileDatabase,
  importLegacyProfiles,
  restoreProfileDatabase,
  verifyProfileDatabase,
} from '../server/profile-import.js';

const [command = 'import', sourceArg = 'data/profiles.json', targetArg = 'data/profiles.sqlite', backupArg = 'data/backups'] = process.argv.slice(2);
const sourcePath = path.resolve(sourceArg);
const targetPath = path.resolve(targetArg);

if (command === 'import') {
  try {
    await access(targetPath, constants.F_OK);
    throw new Error(`Target already exists; refusing to overwrite ${targetPath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const result = await importLegacyProfiles({ sourcePath, targetPath, backupDir: path.resolve(backupArg) });
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'verify') {
  let expected = null;
  try { expected = JSON.parse(await readFile(sourcePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = verifyProfileDatabase(targetPath, expected);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} else if (command === 'backup') {
  const result = await backupProfileDatabase({ sourcePath: targetPath, backupDir: path.resolve(backupArg) });
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'restore') {
  if (!sourceArg || sourceArg === 'data/profiles.json') {
    throw new Error('Restore requires an explicit SQLite backup path');
  }
  const result = await restoreProfileDatabase({ backupPath: sourcePath, targetPath });
  console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error('Usage: node tools/import-profiles.mjs <import|verify|backup|restore> [source-or-backup] [profiles.sqlite] [backup-dir]');
}
