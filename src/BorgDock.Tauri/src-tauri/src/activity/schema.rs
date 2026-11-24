/// Migrations by `PRAGMA user_version`: entry `n` takes a database from
/// version `n` to `n + 1`. Append only; never edit a shipped entry.
pub const MIGRATIONS: &[&str] = &[V1, WITHOUT_WORKSTREAMS];

/// `sources` holds one row per source: its generation, the revision and
/// baseline of its last accepted commit (null until the first one), and
/// `retired_at` once settings drop it. `entries.payload` is the JSON the
/// TypeScript side owns (schema, entity, action, links). `outbox.next_at` is
/// when a pending row is due; once a row is finished, when it finished.
const V1: &str = "
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO meta (key, value) VALUES ('revision', '0');

CREATE TABLE sources (
  source_id TEXT PRIMARY KEY, kind TEXT NOT NULL, label TEXT NOT NULL,
  config_key TEXT NOT NULL, generation INTEGER NOT NULL, revision INTEGER,
  baseline TEXT, seeded_at TEXT, committed_at TEXT, retired_at TEXT);

CREATE TABLE entries (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, entity_key TEXT NOT NULL,
  category TEXT NOT NULL, severity TEXT NOT NULL, needs_you INTEGER NOT NULL,
  status TEXT NOT NULL, resolved_by TEXT, source_at TEXT, observed_at TEXT NOT NULL,
  coverage TEXT NOT NULL, summary TEXT NOT NULL, detail TEXT, payload TEXT NOT NULL,
  read TEXT NOT NULL, read_reason TEXT, read_at TEXT, version INTEGER NOT NULL);
CREATE INDEX entries_inbox ON entries (read, needs_you, observed_at DESC);
CREATE INDEX entries_entity ON entries (entity_key, source_at);
CREATE INDEX entries_source ON entries (source_id);
CREATE INDEX entries_time ON entries (observed_at DESC, id DESC);

CREATE TABLE outbox (
  entry_id TEXT NOT NULL, channel TEXT NOT NULL, state TEXT NOT NULL,
  attempts INTEGER NOT NULL, next_at TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, channel));
CREATE INDEX outbox_due ON outbox (channel, state, next_at);
";

/// 4.17.0 removed Workstreams. Nothing resolves its entries any more, so an
/// open one would count as needing you for good: they go, with their source.
const WITHOUT_WORKSTREAMS: &str = "
DELETE FROM outbox WHERE entry_id IN (
  SELECT id FROM entries
  WHERE category LIKE 'workstream.%'
     OR source_id IN (SELECT source_id FROM sources WHERE kind = 'workstreams'));
DELETE FROM entries
  WHERE category LIKE 'workstream.%'
     OR source_id IN (SELECT source_id FROM sources WHERE kind = 'workstreams');
DELETE FROM sources WHERE kind = 'workstreams';
";
