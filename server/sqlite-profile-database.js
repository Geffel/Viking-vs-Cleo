import { DatabaseSync } from 'node:sqlite';
import { PROFILE_DATABASE_VERSION, PROFILE_SCHEMA_SQL } from './profile-schema.js';
import { hashLegacyClientId, snapshotTotals, validateLegacySnapshot } from './profile-snapshot.js';

export class SqliteProfileDatabase {
  constructor(filePath, { readOnly = false } = {}) {
    this.db = new DatabaseSync(filePath, { readOnly });
    if (!readOnly) this.initialize();
  }

  initialize() {
    this.db.exec(PROFILE_SCHEMA_SQL);
    this.db.prepare(`INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(PROFILE_DATABASE_VERSION));
  }

  close() { this.db.close(); }

  load() {
    const rows = this.db.prepare(`SELECT p.*, c.client_id_hash, c.status AS legacy_status
      FROM profiles p LEFT JOIN legacy_profile_claims c USING(profile_id)
      ORDER BY p.profile_id`).all();
    if (!rows.length) return null;
    const opponents = this.db.prepare('SELECT * FROM profile_opponents ORDER BY profile_id, opponent_profile_id').all();
    const byId = new Map(rows.map((row) => [Number(row.profile_id), {
      clientIdHash: row.client_id_hash ?? '', legacyStatus: row.legacy_status ?? '',
      accountId: row.account_id === null ? null : Number(row.account_id),
      profileId: Number(row.profile_id), name: row.display_name,
      points: Number(row.points), playMs: Number(row.play_ms), seen: Number(row.seen),
      lastSeenAt: Number(row.last_seen_at), killsAgainst: {}, deathsBy: {},
      teamPlayMs: { cleo: Number(row.cleo_play_ms), viking: Number(row.viking_play_ms) },
      stats: JSON.parse(row.stats_json), achievements: JSON.parse(row.achievements_json),
    }]));
    for (const row of opponents) {
      const profile = byId.get(Number(row.profile_id));
      if (Number(row.kills)) profile.killsAgainst[row.opponent_profile_id] = Number(row.kills);
      if (Number(row.deaths)) profile.deathsBy[row.opponent_profile_id] = Number(row.deaths);
    }
    const next = this.db.prepare("SELECT value FROM schema_meta WHERE key='next_profile_id'").get();
    const factions = this.db.prepare("SELECT value FROM schema_meta WHERE key='global_stats'").get();
    return {
      version: 4,
      nextProfileId: Number(next?.value) || Math.max(...byId.keys()) + 1,
      globalStats: factions ? JSON.parse(factions.value) : { factionWins: { cleo: 0, viking: 0 } },
      profiles: [...byId.values()],
    };
  }

  replaceSnapshot(snapshot, { validate = false } = {}) {
    if (validate) validateLegacySnapshot(snapshot);
    const now = Date.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Profile IDs are permanent. In particular, a normal statistics
      // checkpoint must never delete account links or reset a migrated claim.
      this.db.exec('DELETE FROM profile_opponents;');
      const insertProfile = this.db.prepare(`INSERT INTO profiles (
        profile_id, display_name, points, play_ms, seen, last_seen_at, cleo_play_ms, viking_play_ms,
        stats_json, achievements_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        display_name=excluded.display_name, points=excluded.points, play_ms=excluded.play_ms,
        seen=excluded.seen, last_seen_at=excluded.last_seen_at,
        cleo_play_ms=excluded.cleo_play_ms, viking_play_ms=excluded.viking_play_ms,
        stats_json=excluded.stats_json, achievements_json=excluded.achievements_json`);
      const insertClaim = this.db.prepare(`INSERT INTO legacy_profile_claims
        (profile_id, client_id_hash, status) VALUES (?, ?, 'pending')
        ON CONFLICT(profile_id) DO NOTHING`);
      for (const profile of snapshot.profiles ?? []) {
        insertProfile.run(
          profile.profileId, String(profile.name || `Player ${profile.profileId}`), positive(profile.points),
          positive(profile.playMs), positive(profile.seen), positive(profile.lastSeenAt),
          positive(profile.teamPlayMs?.cleo), positive(profile.teamPlayMs?.viking),
          JSON.stringify(profile.stats ?? {}), JSON.stringify(profile.achievements ?? { unlocked: {} }), now,
        );
        const hash = profile.clientIdHash || (profile.clientId ? hashLegacyClientId(profile.clientId) : '');
        if (/^[a-f0-9]{64}$/.test(hash)) insertClaim.run(profile.profileId, hash);
      }
      const insertOpponent = this.db.prepare(`INSERT INTO profile_opponents
        (profile_id, opponent_profile_id, kills, deaths) VALUES (?, ?, ?, ?)`);
      for (const profile of snapshot.profiles ?? []) {
        const ids = new Set([...Object.keys(profile.killsAgainst ?? {}), ...Object.keys(profile.deathsBy ?? {})]);
        for (const opponentId of ids) insertOpponent.run(
          profile.profileId, Number(opponentId), positive(profile.killsAgainst?.[opponentId]), positive(profile.deathsBy?.[opponentId]),
        );
      }
      this.setMeta('next_profile_id', String(snapshot.nextProfileId ?? 1));
      this.setMeta('global_stats', JSON.stringify(snapshot.globalStats ?? { factionWins: { cleo: 0, viking: 0 } }));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  verify(expectedSnapshot = null) {
    const integrity = this.db.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check);
    const foreignKeys = this.db.prepare('PRAGMA foreign_key_check').all();
    const actual = this.load() ?? { profiles: [] };
    const actualTotals = snapshotTotals(actual);
    const expectedTotals = expectedSnapshot ? snapshotTotals(expectedSnapshot) : actualTotals;
    const totalsMatch = JSON.stringify(actualTotals) === JSON.stringify(expectedTotals);
    return { ok: integrity.length === 1 && integrity[0] === 'ok' && !foreignKeys.length && totalsMatch,
      integrity, foreignKeys, expectedTotals, actualTotals };
  }

  checkpoint() { return this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get(); }
  setMeta(key, value) { this.db.prepare('INSERT INTO schema_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
}

function positive(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
