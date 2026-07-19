import type { DatabaseSync } from "node:sqlite";

const migration001 = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS event_rules (
    event TEXT PRIMARY KEY,
    min_score TEXT NOT NULL,
    max_score TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    valid_count INTEGER NOT NULL,
    issue_count INTEGER NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS snapshots_current_idx ON snapshots(is_current);
  CREATE INDEX IF NOT EXISTS snapshots_hash_idx ON snapshots(content_hash);

  CREATE TABLE IF NOT EXISTS source_records (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    source_record_id TEXT NOT NULL,
    source_index INTEGER NOT NULL,
    region TEXT NOT NULL,
    event TEXT NOT NULL,
    group_name TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    score_raw TEXT NOT NULL,
    phone_encrypted TEXT,
    id_number_encrypted TEXT,
    source_fields_json TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, source_record_id)
  );

  CREATE TABLE IF NOT EXISTS ranking_rows (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    source_record_id TEXT NOT NULL,
    source_index INTEGER NOT NULL,
    region TEXT NOT NULL,
    event TEXT NOT NULL,
    group_name TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    score TEXT NOT NULL,
    rank INTEGER NOT NULL,
    PRIMARY KEY (snapshot_id, source_record_id)
  );

  CREATE TABLE IF NOT EXISTS ranking_issues (
    snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    source_record_id TEXT NOT NULL,
    source_index INTEGER NOT NULL,
    region TEXT NOT NULL,
    event TEXT NOT NULL,
    group_name TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    score_raw TEXT NOT NULL,
    code TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, source_record_id)
  );

  CREATE TABLE IF NOT EXISTS sync_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    source TEXT NOT NULL,
    state TEXT NOT NULL,
    record_count INTEGER,
    error_code TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    action TEXT NOT NULL,
    snapshot_id TEXT,
    details_json TEXT NOT NULL
  );
`;

const migration002 = `
  ALTER TABLE snapshots ADD COLUMN field_version TEXT NOT NULL DEFAULT 'canonical-v1';

  CREATE INDEX IF NOT EXISTS sync_runs_finished_idx
    ON sync_runs(state, finished_at DESC);

  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    stale_after_seconds INTEGER NOT NULL,
    critical_after_seconds INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  INSERT OR IGNORE INTO app_settings(
    id, stale_after_seconds, critical_after_seconds, updated_at
  ) VALUES (1, 120, 300, CURRENT_TIMESTAMP);
`;

export function runMigrations(database: DatabaseSync): void {
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
  database.exec(migration001);
  database
    .prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)")
    .run(1, new Date().toISOString());

  const migration = database.prepare("SELECT 1 AS applied FROM schema_migrations WHERE version = ?");
  if (migration.get(2) === undefined) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration002);
      database
        .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")
        .run(2, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}
