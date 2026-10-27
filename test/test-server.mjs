import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { hashSessionToken, SESSION_IDLE_MS } from '../server/auth-crypto.js';
import { SqliteProfileDatabase } from '../server/sqlite-profile-database.js';

// Every integration run owns its process, ephemeral port and profile directory.
// Never send malformed protocol probes to somebody's running game server.
export async function startTestServer({ timeScale = 1, dataDir: providedDataDir = '', env = {}, authenticatedProfiles = [] } = {}) {
  const ownsDataDir = !providedDataDir;
  const dataDir = providedDataDir || await mkdtemp(path.join(os.tmpdir(), 'vvc-net-test-'));
  const authCookies = authenticatedProfiles.length ? await seedAuthenticatedProfiles(dataDir, authenticatedProfiles) : [];
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, ...env, PORT: '0', VVC_DATA_DIR: dataDir, GAME_TIME_SCALE: String(timeScale) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  child.stderr.on('data', (chunk) => { output += chunk; });
  const closed = new Promise((resolve) => child.once('close', resolve));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
    if (ownsDataDir) {
      // Only our own flat, freshly-created directory is removed.
      for (const name of await readdir(dataDir)) await unlink(path.join(dataDir, name));
      await rmdir(dataDir);
    }
  };
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Test server startup timeout: ${output}`)), 10000);
      const finish = (fn, value) => { clearTimeout(timer); fn(value); };
      child.once('error', (error) => finish(reject, error));
      child.once('exit', (code) => finish(reject, new Error(`Test server exited (${code}): ${output}`)));
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/\[SERVER\] Started on port (\d+)\./);
        if (match) finish(resolve, Number(match[1]));
      });
    });
    return {
      url: `ws://127.0.0.1:${port}`,
      origin: `http://127.0.0.1:${port}`,
      authCookies,
      dataDir,
      stop,
      output: () => output,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

async function seedAuthenticatedProfiles(dataDir, names) {
  const database = new SqliteProfileDatabase(path.join(dataDir, 'profiles.sqlite'));
  database.replaceSnapshot({
    version: 4,
    nextProfileId: names.length + 1,
    profiles: names.map((name, index) => ({
      clientId: `test-browser-${index + 1}`,
      profileId: index + 1,
      name,
      points: 0,
      playMs: 0,
      seen: 0,
      killsAgainst: {},
      deathsBy: {},
      teamPlayMs: { cleo: 0, viking: 0 },
      stats: {},
      achievements: { unlocked: {} },
    })),
  });
  database.close();

  const now = Date.now();
  const raw = new DatabaseSync(path.join(dataDir, 'profiles.sqlite'));
  raw.exec('BEGIN IMMEDIATE');
  try {
    const cookies = [];
    for (let index = 0; index < names.length; index++) {
      const account = raw.prepare(`INSERT INTO accounts
        (username_normalized, username_display, password_hash, created_at, updated_at)
        VALUES (?, ?, 'test-only-not-a-login-hash', ?, ?)`).run(
        `test.player.${index + 1}`, `test.player.${index + 1}`, now, now,
      );
      const accountId = Number(account.lastInsertRowid);
      const profileId = index + 1;
      raw.prepare('UPDATE profiles SET account_id = ?, migrated_at = ? WHERE profile_id = ?')
        .run(accountId, now, profileId);
      raw.prepare("UPDATE legacy_profile_claims SET status = 'migrated', migrated_at = ? WHERE profile_id = ?")
        .run(now, profileId);
      const token = randomBytes(32).toString('base64url');
      raw.prepare(`INSERT INTO sessions(token_hash, account_id, created_at, last_used_at, expires_at)
        VALUES (?, ?, ?, ?, ?)`).run(hashSessionToken(token), accountId, now, now, now + SESSION_IDLE_MS);
      cookies.push(`vvc_session=${encodeURIComponent(token)}`);
    }
    raw.exec('COMMIT');
    return cookies;
  } catch (error) {
    raw.exec('ROLLBACK');
    throw error;
  } finally {
    raw.close();
  }
}
