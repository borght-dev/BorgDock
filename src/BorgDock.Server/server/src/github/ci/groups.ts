// Related CI failures: one group per fingerprint across open pull requests and base branches. Groups own
// fingerprints and claims bind to the group id, which is the fingerprint's hash, so a claim survives re-reading.

import type { CheckFailure, CiBranchHit, CiFailureGroup, CiGroupFacts } from '../../../../shared/src/api.ts';
import type { Claim, JobFailure } from '../store.ts';
import { extract, type Signal } from './extract.ts';
import { fingerprintOf, hashText } from './fingerprint.ts';
import { scrub } from './sanitize.ts';

export const groupIdOf = (fingerprint: string) => hashText(fingerprint);

/** The signals and the fingerprint of one job's log tail. Low-tier fingerprints say only "it failed" and never group. */
export function readFailure(log: string, failedStep: string | null, workflow: string | null) {
  const { signals } = extract(scrub(log), failedStep);
  const fingerprints = signals.map((s) => fingerprintOf(s, { failedStep, workflowPath: workflow })).filter((f) => f !== null);
  const best = fingerprints.find((f) => f.tier === 'high') ?? fingerprints.find((f) => f.tier === 'medium') ?? fingerprints[0] ?? null;
  return { signals, fingerprint: best?.value ?? null, tier: best?.tier ?? null, title: best?.title ?? null };
}

/** The failure a job's signals point at: the first that isn't a test run's totals. */
export const primarySignal = (signals: readonly Signal[]) => signals.find((s) => s.kind !== 'summary') ?? null;

export const locationOf = (s: Signal | null) => (s?.path ? `${s.path}${s.line ? `:${s.line}` : ''}` : null);

/** The assertion or error lines of a signal: its message, then what was expected and what came instead. */
export function signalText(s: Signal): string {
  return [s.message, s.expected !== null ? `Expected: ${s.expected}` : null, s.actual !== null ? `Received: ${s.actual}` : null].filter(Boolean).join('\n');
}

export type GroupContext = {
  /**
   * Open pull requests by key, with the jobs failing on their head now (a fixed or rerun job no longer counts), and
   * the head and its passing checks, so a failure that passed when rerun on the same commit counts as flaky.
   */
  openPrs: ReadonlyMap<string, { title: string; failingJobs: ReadonlySet<number>; headSha?: string; passingChecks?: ReadonlySet<string> }>;
  /** `owner/repo:branch` of the base branches that are red now: the first red commit and the red runs. */
  baseBranches: ReadonlyMap<string, { suspect: { sha: string; message: string } | null; runIds: ReadonlySet<number> }>;
  claims: ReadonlyMap<string, Claim>;
};

const distinct = <T>(values: readonly (T | null)[]) => [...new Set(values.filter((v): v is T => v !== null))];

/** What the desktop's CI failure store tallies per group (its `Tally`), over every failure kept with the fingerprint. */
function factsOf(rows: readonly JobFailure[], ctx: GroupContext): CiGroupFacts {
  const onPr = rows.filter((r) => r.prKey !== null);
  const passedOnRetry = onPr.filter((r) => {
    const pr = ctx.openPrs.get(r.prKey!);
    return !!pr && pr.headSha === r.headSha && !pr.failingJobs.has(r.jobId) && (pr.passingChecks?.has(r.checkName) ?? false);
  }).length;
  return {
    tier: rows.some((r) => r.tier === 'high') ? 'high' : 'medium',
    repos: distinct(rows.map((r) => r.repo)),
    prKeys: distinct(onPr.map((r) => r.prKey)),
    prJobIds: distinct(onPr.map((r) => r.jobId)),
    baseRuns: distinct(rows.filter((r) => r.prKey === null).map((r) => r.runId)),
    runCount: new Set(rows.map((r) => (r.runId !== null ? `run:${r.runId}` : `job:${r.jobId}`))).size,
    passedOnRetry,
    catalogIds: distinct(rows.map((r) => /^infra:([^:]+):/.exec(r.fingerprint ?? '')?.[1] ?? null)),
    failedSteps: distinct(rows.map((r) => r.failedStep)),
  };
}

/** Every group with a live failure: on an open pull request or a watched base branch. Newest first. */
export function buildGroups(jobs: readonly JobFailure[], ctx: GroupContext): CiFailureGroup[] {
  const kept = new Map<string, JobFailure[]>();
  const byFingerprint = new Map<string, JobFailure[]>();
  for (const job of jobs) {
    if (!job.fingerprint || job.tier === 'low') continue;
    kept.set(job.fingerprint, [...(kept.get(job.fingerprint) ?? []), job]);
    const live = job.prKey ? (ctx.openPrs.get(job.prKey)?.failingJobs.has(job.jobId) ?? false) : job.runId !== null && (ctx.baseBranches.get(`${job.repo}:${job.branch}`)?.runIds.has(job.runId) ?? false);
    if (!live) continue;
    byFingerprint.set(job.fingerprint, [...(byFingerprint.get(job.fingerprint) ?? []), job]);
  }
  const groups: CiFailureGroup[] = [];
  for (const [fingerprint, rows] of byFingerprint) {
    rows.sort((a, b) => a.failedAt.localeCompare(b.failedAt));
    const newest = rows[rows.length - 1];
    const signal = primarySignal(newest.signals);
    const hits = new Map<string, JobFailure[]>();
    for (const row of rows) {
      const key = row.prKey ?? `${row.repo}:${row.branch}`;
      hits.set(key, [...(hits.get(key) ?? []), row]);
    }
    const branches: CiBranchHit[] = [...hits.values()].map((list) => {
      const last = list[list.length - 1];
      const pr = last.prKey ? ctx.openPrs.get(last.prKey) : undefined;
      return {
        branch: last.branch,
        prKey: last.prKey,
        title: pr?.title ?? null,
        failures: list.length,
        sha: last.headSha,
        suspect: last.prKey ? null : (ctx.baseBranches.get(`${last.repo}:${last.branch}`)?.suspect ?? null),
      };
    });
    // The base branch first: it is the likely cause of the rest.
    branches.sort((a, b) => Number(a.prKey !== null) - Number(b.prKey !== null) || b.failures - a.failures);
    const id = groupIdOf(fingerprint);
    groups.push({
      id,
      title: newest.title ?? signal?.message ?? newest.checkName,
      signal: signal ? signalText(signal) : newest.checkName,
      location: locationOf(signal),
      firstFailedAt: rows[0].failedAt,
      lastFailedAt: newest.failedAt,
      failures: rows.length,
      branches,
      claim: ctx.claims.get(id) ?? null,
      facts: factsOf(kept.get(fingerprint) ?? rows, ctx),
    });
  }
  return groups.sort((a, b) => b.lastFailedAt.localeCompare(a.lastFailedAt));
}

const SNIPPET_LINES = 12;

/** What a failed check shows: the step, the one-line reason, a few log lines, where, and how it relates to others. */
export function checkFailureOf(job: JobFailure, groups: readonly CiFailureGroup[], baseSince: (repo: string, branch: string) => string | null = () => null): CheckFailure {
  const signal = primarySignal(job.signals);
  const group = job.fingerprint && job.tier !== 'low' ? groups.find((g) => g.id === groupIdOf(job.fingerprint!)) : undefined;
  const base = group?.branches.find((b) => b.prKey === null);
  const elsewhere = group?.branches.some((b) => b.prKey !== null && b.prKey !== job.prKey) ?? false;
  return {
    step: job.failedStep,
    summary: signal ? signal.message : job.status === 'read' ? null : job.error,
    snippet: signal ? (signal.excerpt.length ? signal.excerpt : [signal.message]).slice(0, SNIPPET_LINES).join('\n') : null,
    location: locationOf(signal),
    newInThisPr: !base && !elsewhere,
    alsoOnBase: base ? { since: baseSince(job.repo, base.branch) ?? group!.firstFailedAt, claimedBy: group!.claim?.by ?? null } : null,
    groupId: group?.id ?? null,
  };
}
