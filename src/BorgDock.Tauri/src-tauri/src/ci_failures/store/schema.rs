/// Migrations by `PRAGMA user_version`: entry `n` takes a database from
/// version `n` to `n + 1`. Append only; never edit a shipped entry.
pub const MIGRATIONS: &[&str] = &[V1];

const V1: &str = "
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO meta (key, value) VALUES ('revision', '0');

CREATE TABLE occurrences (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL, source TEXT NOT NULL,
  pr_number INTEGER, pr_head_sha TEXT, tested_sha TEXT NOT NULL, head_branch TEXT, event TEXT,
  workflow_id INTEGER, workflow_path TEXT, workflow_name TEXT,
  run_id INTEGER, run_attempt INTEGER, run_number INTEGER,
  job_id INTEGER, job_name TEXT NOT NULL, matrix TEXT NOT NULL DEFAULT '[]',
  check_suite_id INTEGER, app_slug TEXT, html_url TEXT, conclusion TEXT NOT NULL,
  failed_step TEXT, failed_step_number INTEGER, runner_name TEXT, runner_group TEXT,
  runner_labels TEXT NOT NULL DEFAULT '[]',
  started_at TEXT, completed_at TEXT, observed_at TEXT NOT NULL,
  evidence_state TEXT NOT NULL,
  evidence_reason TEXT, bytes_read INTEGER, total_bytes INTEGER, truncated INTEGER NOT NULL DEFAULT 0,
  evidence_attempts INTEGER NOT NULL DEFAULT 0, retry_at TEXT);
CREATE INDEX occurrences_scope_time ON occurrences(scope, observed_at);
CREATE INDEX occurrences_pr ON occurrences(scope, pr_number);

CREATE TABLE signals (
  occurrence_id TEXT NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL,
  signal TEXT NOT NULL,
  fingerprint_version INTEGER NOT NULL, fingerprint TEXT NOT NULL, tier TEXT NOT NULL,
  PRIMARY KEY (occurrence_id, ordinal));
CREATE INDEX signals_fingerprint ON signals(fingerprint_version, fingerprint);

CREATE TABLE outcomes (
  occurrence_id TEXT PRIMARY KEY REFERENCES occurrences(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, by_job_id INTEGER, observed_at TEXT NOT NULL);

CREATE TABLE groups (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL, title TEXT NOT NULL,
  classification TEXT, classified_at TEXT,
  status TEXT NOT NULL DEFAULT 'active', merged_into TEXT, resolved_at TEXT,
  fix_pr TEXT, fix_merged_at TEXT, tracking_issue TEXT,
  first_observed_at TEXT NOT NULL, last_observed_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX groups_scope ON groups(scope, status);

CREATE TABLE fingerprints (
  scope TEXT NOT NULL, version INTEGER NOT NULL, fingerprint TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES groups(id), facets TEXT NOT NULL,
  first_seen_at TEXT NOT NULL, PRIMARY KEY (scope, version, fingerprint));
CREATE INDEX fingerprints_group ON fingerprints(group_id);

CREATE TABLE candidates (
  group_a TEXT NOT NULL, group_b TEXT NOT NULL, reasons TEXT NOT NULL,
  dismissed INTEGER NOT NULL DEFAULT 0, agent_verdict TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (group_a, group_b));

CREATE TABLE decisions (
  id TEXT PRIMARY KEY, scope TEXT NOT NULL, kind TEXT NOT NULL,
  version INTEGER NOT NULL, fingerprint_a TEXT NOT NULL, fingerprint_b TEXT NOT NULL, note TEXT,
  ambiguous INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE INDEX decisions_scope ON decisions(scope, version);

CREATE TABLE claims (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  owner_kind TEXT NOT NULL, owner_ref TEXT NOT NULL, owner_label TEXT, host_id TEXT,
  claimed_at TEXT NOT NULL, lease_until TEXT, state TEXT NOT NULL, note TEXT,
  revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX claims_one_live ON claims(group_id) WHERE state IN ('active','stale','launch_failed');

CREATE TABLE claim_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  at TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT);

CREATE TABLE usage (
  day TEXT NOT NULL, account TEXT NOT NULL, reads INTEGER NOT NULL DEFAULT 0,
  log_bytes INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, account));

CREATE TABLE branch_watch (
  scope TEXT NOT NULL, workflow_path TEXT NOT NULL, last_failed_run INTEGER,
  last_passed_run INTEGER, checked_at TEXT, PRIMARY KEY (scope, workflow_path));
";
