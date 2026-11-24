/// Migrations by `PRAGMA user_version`: entry `n` takes a database from
/// version `n` to `n + 1`. Append only; never edit a shipped entry.
pub const MIGRATIONS: &[&str] = &[V1, V2];

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

/// 4.17.0: "needs you" lasts until the fact ends, and an entry whose fact
/// ended is read with the reason `resolved`. This cleans up what the old
/// rules left needing me, once:
///
/// - an Azure DevOps assignment and a CI failure group that grew no longer
///   need me (which groups held one of my pull requests was never stored);
/// - entries of a pull request the baselines know as merged or closed, of a
///   work item that left my list and of a thread that is gone are resolved,
///   and so are the entries of sources settings dropped;
/// - of several findings, state changes or comments on one thing, only the
///   newest stays open;
/// - every entry that is resolved or superseded and still unread is read.
///
/// The baselines are JSON the TypeScript side writes. `json_valid` guards
/// each read: a failing migration would have the file moved aside as corrupt.
const V2: &str = "
UPDATE entries SET needs_you = 0, version = version + 1
 WHERE needs_you = 1 AND category IN ('ado.assigned', 'ci.group-grew');

CREATE TEMP TABLE activity_v2_ended (entity_key TEXT PRIMARY KEY, reason TEXT NOT NULL);

INSERT OR IGNORE INTO activity_v2_ended (entity_key, reason)
SELECT prefix.value || pr.key, json_extract(pr.value, '$.state')
  FROM sources s
  JOIN (SELECT source_id, MIN(substr(entity_key, 1, instr(entity_key, '#'))) AS value
          FROM entries WHERE entity_key LIKE 'gh:%#%' GROUP BY source_id) prefix
    ON prefix.source_id = s.source_id,
       json_each(CASE WHEN json_valid(s.baseline) THEN s.baseline ELSE '{}' END, '$.prs') pr
 WHERE s.kind = 'gh'
   AND CASE WHEN pr.type = 'object' THEN json_extract(pr.value, '$.state') END IN ('merged', 'closed');

UPDATE entries SET status = 'resolved', version = version + 1,
       resolved_by = (SELECT reason FROM temp.activity_v2_ended e WHERE e.entity_key = entries.entity_key)
 WHERE status = 'open'
   AND category IN ('pr.review-request', 'pr.findings', 'pr.review', 'pr.checks-failed',
                    'pr.conflict', 'pr.ready')
   AND entity_key IN (SELECT entity_key FROM temp.activity_v2_ended);

UPDATE entries SET status = 'resolved', resolved_by = 'no longer open', version = version + 1
 WHERE status = 'open' AND category = 'deploy.pr' AND needs_you = 1
   AND 'gh:' || lower(replace(replace(
         COALESCE(CASE WHEN json_valid(payload) THEN json_extract(payload, '$.links.prUrls[0]') END, ''),
         'https://github.com/', ''), '/pull/', '#'))
       IN (SELECT entity_key FROM temp.activity_v2_ended);

DROP TABLE temp.activity_v2_ended;

UPDATE entries SET status = 'resolved', resolved_by = 'no longer on your list', version = version + 1
 WHERE status = 'open' AND category IN ('ado.assigned', 'ado.state', 'ado.comment')
   AND entity_key IN (
     SELECT s.source_id || ':' || item.key
       FROM sources s,
            json_each(CASE WHEN json_valid(s.baseline) THEN s.baseline ELSE '{}' END, '$.items') item
      WHERE s.kind = 'ado'
        AND CASE WHEN item.type = 'object' THEN json_extract(item.value, '$.missingSince') END IS NOT NULL);

UPDATE entries SET status = 'resolved', resolved_by = 'the thread is gone', version = version + 1
 WHERE status = 'open' AND needs_you = 1
   AND entity_key IN (
     SELECT s.source_id || ':thread:' || thread.key
       FROM sources s,
            json_each(CASE WHEN json_valid(s.baseline) THEN s.baseline ELSE '{}' END, '$.threads') thread
      WHERE s.kind = 't3'
        AND CASE WHEN thread.type = 'object' THEN json_extract(thread.value, '$.missingSince') END IS NOT NULL);

UPDATE entries SET status = 'resolved', resolved_by = 'source removed', version = version + 1
 WHERE status = 'open' AND needs_you = 1
   AND source_id IN (SELECT source_id FROM sources WHERE retired_at IS NOT NULL);

UPDATE entries SET status = 'superseded', version = version + 1,
       resolved_by = (SELECT newer.id FROM entries newer
                       WHERE newer.source_id = entries.source_id
                         AND newer.entity_key = entries.entity_key
                         AND newer.category = entries.category
                         AND (newer.observed_at > entries.observed_at
                              OR (newer.observed_at = entries.observed_at AND newer.id > entries.id))
                       ORDER BY newer.observed_at DESC, newer.id DESC LIMIT 1)
 WHERE status = 'open' AND category IN ('pr.findings', 'ado.state', 'ado.comment')
   AND EXISTS (SELECT 1 FROM entries newer
                WHERE newer.source_id = entries.source_id
                  AND newer.entity_key = entries.entity_key
                  AND newer.category = entries.category
                  AND (newer.observed_at > entries.observed_at
                       OR (newer.observed_at = entries.observed_at AND newer.id > entries.id)));

UPDATE entries SET read = 'read', read_reason = 'resolved',
       read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), version = version + 1
 WHERE read = 'unread' AND status <> 'open';

UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'revision';
";
