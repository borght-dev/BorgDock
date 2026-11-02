import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

// Each entry runs once, in order. Never edit a migration that has shipped; append a new one.
const MIGRATIONS = [
  `CREATE TABLE passkeys (
     id TEXT PRIMARY KEY,
     public_key BLOB NOT NULL,
     counter INTEGER NOT NULL,
     transports TEXT NOT NULL,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL,
     last_used_at TEXT
   );
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,
     token_hash TEXT NOT NULL UNIQUE,
     kind TEXT NOT NULL CHECK (kind IN ('browser', 'app')),
     name TEXT NOT NULL,
     passkey_id TEXT,
     created_at TEXT NOT NULL,
     last_seen_at TEXT NOT NULL,
     last_seen_via TEXT NOT NULL,
     expires_at TEXT NOT NULL,
     revoked_at TEXT
   );
   CREATE TABLE setup_codes (
     code_hash TEXT PRIMARY KEY,
     created_at TEXT NOT NULL,
     expires_at TEXT NOT NULL,
     used_at TEXT
   );
   CREATE TABLE queue (item_id INTEGER PRIMARY KEY, queued_at TEXT NOT NULL);
   CREATE TABLE dismissed_suggestions (suggestion_id TEXT PRIMARY KEY, item_id INTEGER NOT NULL, dismissed_at TEXT NOT NULL);
   CREATE TABLE thread_links (thread_id TEXT PRIMARY KEY, item_id INTEGER, linked_at TEXT NOT NULL);
   CREATE TABLE first_messages (thread_id TEXT PRIMARY KEY, text TEXT NOT NULL);
   CREATE TABLE push_web (
     endpoint TEXT PRIMARY KEY,
     session_id TEXT NOT NULL,
     p256dh TEXT NOT NULL,
     auth TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE TABLE push_apns (
     device_token TEXT PRIMARY KEY,
     session_id TEXT NOT NULL,
     environment TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE TABLE notified (key TEXT PRIMARY KEY, at TEXT NOT NULL);
   CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE audit (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     at TEXT NOT NULL,
     session_id TEXT,
     via TEXT NOT NULL,
     ip TEXT,
     action TEXT NOT NULL,
     detail TEXT
   );`,
  // When the session last proved the passkey; account changes require a recent check.
  `ALTER TABLE sessions ADD COLUMN verified_at TEXT;`,
  `CREATE TABLE t3_snapshots (source_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, synced_at TEXT NOT NULL);`,
];

export type Db = DatabaseSync;

export function openDb(dataDir: string, file = 'dispatch.db'): Db {
  const db = new DatabaseSync(join(dataDir, file));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      version += 1;
      db.prepare('UPDATE schema_version SET version = ?').run(version);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}

/**
 * BorgDock's modules (github, activity, auth, …) keep their own migration lists, so each can grow its tables
 * without touching another's. Same rule as MIGRATIONS: append, never edit one that has shipped.
 */
export function migrateModule(db: Db, module: string, migrations: readonly string[]) {
  db.exec('CREATE TABLE IF NOT EXISTS module_migrations (module TEXT PRIMARY KEY, version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM module_migrations WHERE module = ?').get(module) as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO module_migrations (module, version) VALUES (?, 0)').run(module);
  while (version < migrations.length) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[version]);
      version += 1;
      db.prepare('UPDATE module_migrations SET version = ? WHERE module = ?').run(version, module);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export const now = () => new Date().toISOString();

export type Via = 'internet' | 'tailnet' | 'local';

export function audit(db: Db, entry: { sessionId: string | null; via: Via; ip: string | null; action: string; detail?: unknown }) {
  db.prepare('INSERT INTO audit (at, session_id, via, ip, action, detail) VALUES (?, ?, ?, ?, ?, ?)').run(
    now(), entry.sessionId, entry.via, entry.ip, entry.action, entry.detail === undefined ? null : JSON.stringify(entry.detail),
  );
}
