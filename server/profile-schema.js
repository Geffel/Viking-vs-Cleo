export const PROFILE_DATABASE_VERSION = 1;

export const PROFILE_SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS accounts (
    account_id INTEGER PRIMARY KEY,
    username_normalized TEXT NOT NULL UNIQUE,
    username_display TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked', 'disabled')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS profiles (
    profile_id INTEGER PRIMARY KEY,
    account_id INTEGER UNIQUE REFERENCES accounts(account_id),
    display_name TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
    play_ms INTEGER NOT NULL DEFAULT 0 CHECK (play_ms >= 0),
    seen INTEGER NOT NULL DEFAULT 0 CHECK (seen >= 0),
    last_seen_at INTEGER NOT NULL DEFAULT 0 CHECK (last_seen_at >= 0),
    cleo_play_ms INTEGER NOT NULL DEFAULT 0 CHECK (cleo_play_ms >= 0),
    viking_play_ms INTEGER NOT NULL DEFAULT 0 CHECK (viking_play_ms >= 0),
    stats_json TEXT NOT NULL,
    achievements_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    migrated_at INTEGER
  ) STRICT;

  CREATE TABLE IF NOT EXISTS profile_opponents (
    profile_id INTEGER NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
    -- Historical JSON can refer to a profile that has since been removed. The
    -- source profile is constrained, while the original opponent ID is kept.
    opponent_profile_id INTEGER NOT NULL,
    kills INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
    deaths INTEGER NOT NULL DEFAULT 0 CHECK (deaths >= 0),
    PRIMARY KEY (profile_id, opponent_profile_id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS legacy_profile_claims (
    profile_id INTEGER PRIMARY KEY REFERENCES profiles(profile_id) ON DELETE CASCADE,
    client_id_hash TEXT NOT NULL UNIQUE CHECK (length(client_id_hash) = 64),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'migrated', 'blocked')),
    migrated_at INTEGER
  ) STRICT;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
    account_id INTEGER NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
  ) STRICT;

  CREATE TABLE IF NOT EXISTS recovery_codes (
    account_id INTEGER NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    used_at INTEGER,
    PRIMARY KEY (account_id, code_hash)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS login_failures (
    failure_id INTEGER PRIMARY KEY,
    account_key TEXT NOT NULL,
    source_ip TEXT NOT NULL,
    attempted_at INTEGER NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS login_failures_account_time
    ON login_failures(account_key, attempted_at);
  CREATE INDEX IF NOT EXISTS login_failures_ip_time
    ON login_failures(source_ip, attempted_at);
`;
