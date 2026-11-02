import type { Person } from '../../../shared/src/api.ts';
import { migrateModule, now, type Db } from '../db.ts';
import type { Signal } from './ci/extract.ts';

// Append only; never edit one that has shipped.
const MIGRATIONS = [
  `CREATE TABLE github_snoozes (pr_key TEXT PRIMARY KEY, until TEXT NOT NULL);
   CREATE TABLE github_review_requests (key TEXT PRIMARY KEY, first_seen_at TEXT NOT NULL);
   CREATE TABLE github_job_failures (
     job_id INTEGER PRIMARY KEY,
     repo TEXT NOT NULL,
     run_id INTEGER,
     head_sha TEXT NOT NULL,
     branch TEXT NOT NULL,
     pr_key TEXT,
     check_name TEXT NOT NULL,
     workflow TEXT,
     failed_step TEXT,
     failed_at TEXT NOT NULL,
     read_at TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('read', 'unavailable', 'failed')),
     error TEXT,
     signals TEXT NOT NULL,
     fingerprint TEXT,
     tier TEXT,
     title TEXT
   );
   CREATE INDEX github_job_failures_fingerprint ON github_job_failures (fingerprint);
   CREATE TABLE github_ci_claims (group_id TEXT PRIMARY KEY, login TEXT NOT NULL, name TEXT, avatar_url TEXT, note TEXT, at TEXT NOT NULL);`,
];

/** Failures are kept this long; groups say "first failed" within it. */
const RETENTION_DAYS = 14;

export type JobFailure = {
  jobId: number;
  /** owner/repo */
  repo: string;
  runId: number | null;
  headSha: string;
  branch: string;
  /** Null for a base-branch run. */
  prKey: string | null;
  checkName: string;
  workflow: string | null;
  failedStep: string | null;
  failedAt: string;
  readAt: string;
  status: 'read' | 'unavailable' | 'failed';
  error: string | null;
  signals: Signal[];
  fingerprint: string | null;
  tier: 'high' | 'medium' | 'low' | null;
  title: string | null;
};

export type Claim = { by: Person; at: string; note: string | null };

type Row = Record<string, string | number | null>;

const toFailure = (r: Row): JobFailure => ({
  jobId: Number(r.job_id), repo: String(r.repo), runId: r.run_id === null ? null : Number(r.run_id), headSha: String(r.head_sha), branch: String(r.branch),
  prKey: r.pr_key as string | null, checkName: String(r.check_name), workflow: r.workflow as string | null, failedStep: r.failed_step as string | null,
  failedAt: String(r.failed_at), readAt: String(r.read_at), status: r.status as JobFailure['status'], error: r.error as string | null,
  signals: JSON.parse(String(r.signals)), fingerprint: r.fingerprint as string | null, tier: r.tier as JobFailure['tier'], title: r.title as string | null,
});

/** GitHub's own tables: snoozes, when review requests were first seen, read job failures and claims. */
export class GithubStore {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
    migrateModule(db, 'github', MIGRATIONS);
  }

  snoozes(): Map<string, number> {
    const rows = this.db.prepare('SELECT pr_key, until FROM github_snoozes').all() as { pr_key: string; until: string }[];
    return new Map(rows.map((r) => [r.pr_key, Date.parse(r.until)]));
  }

  snooze(prKey: string, until: string | null) {
    if (until === null) this.db.prepare('DELETE FROM github_snoozes WHERE pr_key = ?').run(prKey);
    else this.db.prepare('INSERT INTO github_snoozes (pr_key, until) VALUES (?, ?) ON CONFLICT (pr_key) DO UPDATE SET until = excluded.until').run(prKey, until);
  }

  /** Remembers when a review request was first seen; forgets requests that are gone. */
  syncReviewRequests(keys: readonly string[], at = now()): Map<string, string> {
    const insert = this.db.prepare('INSERT OR IGNORE INTO github_review_requests (key, first_seen_at) VALUES (?, ?)');
    for (const key of keys) insert.run(key, at);
    const rows = this.db.prepare('SELECT key, first_seen_at FROM github_review_requests').all() as { key: string; first_seen_at: string }[];
    const live = new Set(keys);
    const stale = rows.filter((r) => !live.has(r.key));
    const remove = this.db.prepare('DELETE FROM github_review_requests WHERE key = ?');
    for (const r of stale) remove.run(r.key);
    return new Map(rows.filter((r) => live.has(r.key)).map((r) => [r.key, r.first_seen_at]));
  }

  job(jobId: number): JobFailure | null {
    const row = this.db.prepare('SELECT * FROM github_job_failures WHERE job_id = ?').get(jobId) as Row | undefined;
    return row ? toFailure(row) : null;
  }

  saveJob(f: JobFailure) {
    this.db.prepare(
      `INSERT INTO github_job_failures (job_id, repo, run_id, head_sha, branch, pr_key, check_name, workflow, failed_step, failed_at, read_at, status, error, signals, fingerprint, tier, title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (job_id) DO UPDATE SET read_at = excluded.read_at, status = excluded.status, error = excluded.error, signals = excluded.signals,
         fingerprint = excluded.fingerprint, tier = excluded.tier, title = excluded.title, failed_step = excluded.failed_step, pr_key = excluded.pr_key`,
    ).run(f.jobId, f.repo, f.runId, f.headSha, f.branch, f.prKey, f.checkName, f.workflow, f.failedStep, f.failedAt, f.readAt, f.status, f.error,
      JSON.stringify(f.signals), f.fingerprint, f.tier, f.title);
  }

  jobs(): JobFailure[] {
    return (this.db.prepare('SELECT * FROM github_job_failures ORDER BY failed_at').all() as Row[]).map(toFailure);
  }

  claims(): Map<string, Claim> {
    const rows = this.db.prepare('SELECT * FROM github_ci_claims').all() as Row[];
    return new Map(rows.map((r) => [String(r.group_id), {
      by: { login: String(r.login), name: r.name as string | null, avatarUrl: r.avatar_url as string | null }, at: String(r.at), note: r.note as string | null,
    }]));
  }

  claim(groupId: string, by: Person, note: string | null) {
    this.db.prepare(
      `INSERT INTO github_ci_claims (group_id, login, name, avatar_url, note, at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (group_id) DO UPDATE SET login = excluded.login, name = excluded.name, avatar_url = excluded.avatar_url, note = excluded.note, at = excluded.at`,
    ).run(groupId, by.login, by.name, by.avatarUrl, note, now());
  }

  unclaim(groupId: string) {
    this.db.prepare('DELETE FROM github_ci_claims WHERE group_id = ?').run(groupId);
  }

  prune(at = Date.now()) {
    const cutoff = new Date(at - RETENTION_DAYS * 86_400_000).toISOString();
    this.db.prepare('DELETE FROM github_job_failures WHERE failed_at < ?').run(cutoff);
    this.db.prepare('DELETE FROM github_snoozes WHERE until < ?').run(new Date(at).toISOString());
  }
}
