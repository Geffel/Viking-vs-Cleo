import fs from 'node:fs';
import path from 'node:path';

/**
 * Lagringsgransen for den gamla profilfilen.
 *
 * Anropen ar avsiktligt synkrona tills SQLite-workern och skrivkon infors i
 * nasta story. Resten av servern behover darfor inte kanna till filformat,
 * temporara filer eller kataloger och kan byta implementation utan att
 * matchlogiken andras.
 */
export class JsonProfileStore {
  constructor({ dataDir, fileName = 'profiles.json', fsImpl = fs } = {}) {
    if (!dataDir) throw new TypeError('JsonProfileStore requires dataDir');
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, fileName);
    this.fs = fsImpl;
  }

  load() {
    if (!this.fs.existsSync(this.filePath)) return null;
    return JSON.parse(this.fs.readFileSync(this.filePath, 'utf8'));
  }

  save(snapshot) {
    this.fs.mkdirSync(this.dataDir, { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    this.fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    this.fs.renameSync(temporaryPath, this.filePath);
  }
}
