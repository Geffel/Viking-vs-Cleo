import { DatabaseSync } from 'node:sqlite';
import { PROFILE_DATABASE_VERSION, PROFILE_SCHEMA_SQL } from './profile-schema.js';
import { authError, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SESSION_TOUCH_INTERVAL_MS } from './auth-crypto.js';

export class AccountDatabase {
  constructor(filePath) {
    this.db = new DatabaseSync(filePath);
    this.db.exec(PROFILE_SCHEMA_SQL);
    this.db.prepare(`INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(PROFILE_DATABASE_VERSION));
  }

  close() { this.db.close(); }

  findAccount(usernameNormalized) {
    return this.db.prepare(`SELECT account_id, username_normalized, username_display, password_hash, status
      FROM accounts WHERE username_normalized = ?`).get(usernameNormalized) ?? null;
  }

  findAccountById(accountId) {
    return this.db.prepare(`SELECT account_id, username_normalized, username_display, password_hash, status
      FROM accounts WHERE account_id = ?`).get(accountId) ?? null;
  }

  findPendingLegacyProfile(clientIdHash) {
    const row = this.db.prepare(`SELECT p.profile_id, p.display_name, p.points, p.play_ms, p.seen,
        p.stats_json, p.achievements_json,
        COALESCE(SUM(o.kills), 0) AS kills, COALESCE(SUM(o.deaths), 0) AS deaths
      FROM legacy_profile_claims c JOIN profiles p USING(profile_id)
      LEFT JOIN profile_opponents o USING(profile_id)
      WHERE c.client_id_hash = ? AND c.status = 'pending' AND p.account_id IS NULL
      GROUP BY p.profile_id`).get(clientIdHash);
    if (!row) return null;
    const stats = parseJson(row.stats_json);
    const achievements = parseJson(row.achievements_json);
    return {
      profileId: Number(row.profile_id), displayName: row.display_name,
      points: Number(row.points), playMs: Number(row.play_ms), seen: Number(row.seen),
      kills: Number(row.kills), deaths: Number(row.deaths),
      matches: Math.max(0, Number(stats?.matches?.played) || 0),
      achievements: Object.keys(achievements?.unlocked ?? {}).length,
    };
  }

  completeLegacyMigration({ clientIdHash, usernameNormalized, usernameDisplay, passwordHash,
    recoveryCodeHashes, tokenHash, now }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const claim = this.db.prepare(`SELECT c.profile_id FROM legacy_profile_claims c
        JOIN profiles p USING(profile_id)
        WHERE c.client_id_hash = ? AND c.status = 'pending' AND p.account_id IS NULL`).get(clientIdHash);
      if (!claim) throw authError('LEGACY_PROFILE_UNAVAILABLE', 'Legacy profile is not available for migration');
      if (this.findAccount(usernameNormalized)) throw authError('USERNAME_TAKEN', 'Username is already in use');

      const inserted = this.db.prepare(`INSERT INTO accounts
        (username_normalized, username_display, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run(usernameNormalized, usernameDisplay, passwordHash, now, now);
      const accountId = Number(inserted.lastInsertRowid);
      const profileId = Number(claim.profile_id);
      const linked = this.db.prepare(`UPDATE profiles SET account_id = ?, migrated_at = ?
        WHERE profile_id = ? AND account_id IS NULL`).run(accountId, now, profileId);
      const claimed = this.db.prepare(`UPDATE legacy_profile_claims SET status = 'migrated', migrated_at = ?
        WHERE profile_id = ? AND status = 'pending'`).run(now, profileId);
      if (linked.changes !== 1 || claimed.changes !== 1) {
        throw authError('LEGACY_PROFILE_UNAVAILABLE', 'Legacy profile is not available for migration');
      }
      const addCode = this.db.prepare('INSERT INTO recovery_codes(account_id, code_hash, created_at) VALUES (?, ?, ?)');
      for (const codeHash of recoveryCodeHashes) addCode.run(accountId, codeHash, now);
      this.db.prepare(`INSERT INTO sessions(token_hash, account_id, created_at, last_used_at, expires_at)
        VALUES (?, ?, ?, ?, ?)`).run(tokenHash, accountId, now, now, now + SESSION_IDLE_MS);
      this.db.exec('COMMIT');
      return { account: { accountId, username: usernameDisplay, status: 'active' }, profileId };
    } catch (error) {
      this.db.exec('ROLLBACK');
      if (String(error.message).includes('accounts.username_normalized')) throw authError('USERNAME_TAKEN', 'Username is already in use');
      throw error;
    }
  }

  createAccount({ usernameNormalized, usernameDisplay, passwordHash, recoveryCodeHashes, now }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.findAccount(usernameNormalized)) throw authError('USERNAME_TAKEN', 'Username is already in use');
      const inserted = this.db.prepare(`INSERT INTO accounts
        (username_normalized, username_display, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run(usernameNormalized, usernameDisplay, passwordHash, now, now);
      const accountId = Number(inserted.lastInsertRowid);
      const addCode = this.db.prepare('INSERT INTO recovery_codes(account_id, code_hash, created_at) VALUES (?, ?, ?)');
      for (const codeHash of recoveryCodeHashes) addCode.run(accountId, codeHash, now);
      this.db.exec('COMMIT');
      return publicAccount({ account_id: accountId, username_display: usernameDisplay, status: 'active' });
    } catch (error) {
      this.db.exec('ROLLBACK');
      if (String(error.message).includes('accounts.username_normalized')) throw authError('USERNAME_TAKEN', 'Username is already in use');
      throw error;
    }
  }

  loginLimit({ accountKey, sourceIp, cutoff, accountMax, ipMax }) {
    this.db.prepare('DELETE FROM login_failures WHERE attempted_at < ?').run(cutoff);
    const account = Number(this.db.prepare('SELECT count(*) AS count FROM login_failures WHERE account_key = ? AND attempted_at >= ?').get(accountKey, cutoff).count);
    const ip = Number(this.db.prepare('SELECT count(*) AS count FROM login_failures WHERE source_ip = ? AND attempted_at >= ?').get(sourceIp, cutoff).count);
    return { limited: account >= accountMax || ip >= ipMax, accountFailures: account, ipFailures: ip };
  }

  recordLoginFailure({ accountKey, sourceIp, now }) {
    this.db.prepare('INSERT INTO login_failures(account_key, source_ip, attempted_at) VALUES (?, ?, ?)').run(accountKey, sourceIp, now);
  }

  completeLogin({ account, accountKey, passwordHash, tokenHash, now }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (passwordHash) this.db.prepare('UPDATE accounts SET password_hash = ?, updated_at = ? WHERE account_id = ?')
        .run(passwordHash, now, account.account_id);
      // Reset only the account window. The same rows must keep counting toward
      // the source-IP limit, so retain them with a non-matching audit key.
      this.db.prepare(`UPDATE login_failures SET account_key = account_key || ':' || failure_id
        WHERE account_key = ?`).run(accountKey);
      this.db.prepare(`INSERT INTO sessions(token_hash, account_id, created_at, last_used_at, expires_at)
        VALUES (?, ?, ?, ?, ?)`).run(tokenHash, account.account_id, now, now, now + SESSION_IDLE_MS);
      this.db.exec('COMMIT');
      return publicAccount(account);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  resolveSession(tokenHash, now) {
    const row = this.db.prepare(`SELECT s.*, a.username_display, a.status, p.profile_id
      FROM sessions s JOIN accounts a USING(account_id)
      LEFT JOIN profiles p USING(account_id) WHERE s.token_hash = ?`).get(tokenHash);
    if (!row || row.revoked_at !== null || row.status !== 'active' || now >= Number(row.expires_at)
      || now >= Number(row.created_at) + SESSION_ABSOLUTE_MS) return null;
    if (now - Number(row.last_used_at) >= SESSION_TOUCH_INTERVAL_MS) {
      const expiresAt = Math.min(now + SESSION_IDLE_MS, Number(row.created_at) + SESSION_ABSOLUTE_MS);
      this.db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?').run(now, expiresAt, tokenHash);
    }
    return { accountId: Number(row.account_id), username: row.username_display, status: row.status,
      profileId: row.profile_id === null ? null : Number(row.profile_id) };
  }

  revokeSession(tokenHash, now) {
    return this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(now, tokenHash).changes > 0;
  }

  revokeAllSessions(accountId, now) {
    return Number(this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL').run(now, accountId).changes);
  }

  replaceRecoveryCodes({ accountId, passwordHash, recoveryCodeHashes, now }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM recovery_codes WHERE account_id = ?').run(accountId);
      const insert = this.db.prepare('INSERT INTO recovery_codes(account_id, code_hash, created_at) VALUES (?, ?, ?)');
      for (const codeHash of recoveryCodeHashes) insert.run(accountId, codeHash, now);
      if (passwordHash) this.db.prepare('UPDATE accounts SET password_hash = ?, updated_at = ? WHERE account_id = ?').run(passwordHash, now, accountId);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  resetPassword({ accountId, codeHash, passwordHash, now }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const used = this.db.prepare(`UPDATE recovery_codes SET used_at = ?
        WHERE account_id = ? AND code_hash = ? AND used_at IS NULL`).run(now, accountId, codeHash);
      if (!used.changes) throw authError('INVALID_RECOVERY', 'Invalid username or recovery code');
      this.db.prepare('UPDATE accounts SET password_hash = ?, updated_at = ? WHERE account_id = ?').run(passwordHash, now, accountId);
      this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL').run(now, accountId);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  cleanupSessions(now) {
    return Number(this.db.prepare(`DELETE FROM sessions WHERE revoked_at IS NOT NULL OR expires_at <= ? OR created_at + ? <= ?`)
      .run(now, SESSION_ABSOLUTE_MS, now).changes);
  }
}

function publicAccount(row) {
  return { accountId: Number(row.account_id), username: row.username_display, status: row.status };
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return {}; }
}
