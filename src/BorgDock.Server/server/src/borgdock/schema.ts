import { migrateModule, type Db } from '../db.ts';

// BorgDock's platform tables (owner, device keys, machines, activity, live activities, linked desktops). Append, never edit one
// that has shipped.
const MIGRATIONS = [
  `CREATE TABLE bd_owner (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     clerk_user_id TEXT NOT NULL,
     name TEXT NOT NULL,
     email TEXT,
     image_url TEXT,
     claimed_at TEXT NOT NULL
   );
   CREATE TABLE bd_device_keys (
     session_id TEXT PRIMARY KEY,
     public_key TEXT NOT NULL,
     clerk_user_id TEXT,
     created_at TEXT NOT NULL
   );
   CREATE TABLE bd_nonces (nonce TEXT PRIMARY KEY, session_id TEXT NOT NULL, at TEXT NOT NULL);
   CREATE INDEX bd_nonces_at ON bd_nonces (at);
   CREATE TABLE bd_machines (
     id TEXT PRIMARY KEY,
     label TEXT NOT NULL,
     token_hash TEXT NOT NULL UNIQUE,
     version TEXT,
     created_at TEXT NOT NULL,
     last_seen_at TEXT,
     revoked_at TEXT
   );
   CREATE TABLE bd_machine_trust (
     machine_id TEXT NOT NULL,
     session_id TEXT NOT NULL,
     at TEXT NOT NULL,
     PRIMARY KEY (machine_id, session_id)
   );
   CREATE TABLE bd_activity (
     id TEXT PRIMARY KEY,
     source TEXT NOT NULL,
     category TEXT NOT NULL,
     title TEXT NOT NULL,
     detail TEXT NOT NULL,
     tone TEXT NOT NULL,
     target TEXT NOT NULL,
     push TEXT,
     at TEXT NOT NULL,
     created_at TEXT NOT NULL,
     read_at TEXT
   );
   CREATE INDEX bd_activity_at ON bd_activity (at);
   CREATE TABLE bd_activity_seen (key TEXT PRIMARY KEY, source TEXT NOT NULL, at TEXT NOT NULL);
   CREATE TABLE bd_activity_sources (source TEXT PRIMARY KEY, seeded_at TEXT NOT NULL);
   CREATE TABLE bd_live_activities (
     token TEXT PRIMARY KEY,
     session_id TEXT NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('agent', 'checks')),
     subject TEXT NOT NULL,
     last_state TEXT,
     created_at TEXT NOT NULL
   );
   CREATE TABLE bd_push_to_start (token TEXT PRIMARY KEY, session_id TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE bd_launched (thread_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, at TEXT NOT NULL, activity_started INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE bd_item_facts (item_id INTEGER PRIMARY KEY, changed_at TEXT NOT NULL, facts TEXT NOT NULL);`,
  `CREATE TABLE bd_desktops (session_id TEXT PRIMARY KEY, name TEXT NOT NULL, linked_at TEXT NOT NULL);`,
  `CREATE INDEX bd_activity_read_at ON bd_activity (read_at);`,
  // A desktop session whose token was never picked up is abandoned; it is revoked at startup (tokens live in memory).
  `ALTER TABLE bd_desktops ADD COLUMN collected_at TEXT;
   UPDATE bd_desktops SET collected_at = linked_at;`,
];

export function migratePlatform(db: Db) {
  migrateModule(db, 'borgdock-platform', MIGRATIONS);
}
