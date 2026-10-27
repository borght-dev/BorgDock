import type { PullRequestWithChecks } from '@/types';
import { type GroupFacts, type HypothesisKind, hypothesesOf, relatednessOf } from './hypothesis';
import { parseScope } from './identity';
import type { CiGroupSummary } from './types';

/**
 * How the PR list reads related CI failures: which shared groups hold a PR's
 * current failed checks, which open PRs a group still blocks, and whether a
 * PR is red only because of failures that are not its doing. Pure.
 */

/** Conclusions `aggregatePrWithChecks` counts as failed. */
const FAILED = new Set(['failure', 'timed_out']);

/** Causes that are not the PR's doing. */
const OUTSIDE_CAUSES: ReadonlySet<string> = new Set(['base-branch', 'infrastructure', 'flaky']);

function factsOf(group: CiGroupSummary, defaultBranch: string | null): GroupFacts {
  return {
    prNumbers: group.prNumbers,
    defaultBranchRuns: group.defaultBranchRuns,
    defaultBranch,
    occurrenceCount: group.occurrenceCount,
    passedOnRetry: group.passedOnRetry,
    runCount: group.runCount,
    catalogIds: group.catalogIds,
    failedSteps: group.failedSteps,
  };
}

/** Confident, unresolved, and across PRs or with the default branch. */
export function isOpenSharedGroup(group: CiGroupSummary): boolean {
  return (
    group.maxTier === 'high' &&
    group.status !== 'merged' &&
    group.status !== 'resolved' &&
    relatednessOf(factsOf(group, null)) === 'shared'
  );
}

/**
 * Why a group is not the PR's doing: the classification you picked, else the
 * strongest hypothesis that says so. Null when the PR may have caused it.
 */
export function outsideCauseOf(
  group: CiGroupSummary,
  branch: string | null = null,
): HypothesisKind | null {
  if (group.classification && group.classification !== 'unknown') {
    return OUTSIDE_CAUSES.has(group.classification)
      ? (group.classification as HypothesisKind)
      : null;
  }
  return hypothesesOf(factsOf(group, branch)).find((h) => OUTSIDE_CAUSES.has(h.kind))?.kind ?? null;
}

/** Open shared groups by the job ids of their PR failures. */
export type JobIndex = ReadonlyMap<number, readonly CiGroupSummary[]>;

const indexes = new WeakMap<readonly CiGroupSummary[], JobIndex>();

/** The job index of `groups`, built once per groups array. */
export function jobIndexOf(groups: readonly CiGroupSummary[]): JobIndex {
  const cached = indexes.get(groups);
  if (cached) return cached;
  const index = new Map<number, CiGroupSummary[]>();
  for (const group of groups) {
    if (!isOpenSharedGroup(group)) continue;
    for (const jobId of group.prJobIds) index.set(jobId, [...(index.get(jobId) ?? []), group]);
  }
  indexes.set(groups, index);
  return index;
}

function sameRepo(group: CiGroupSummary, pr: PullRequestWithChecks): boolean {
  const parts = parseScope(group.scope);
  return (
    !!parts &&
    parts.owner === pr.pullRequest.repoOwner.toLowerCase() &&
    parts.repo === pr.pullRequest.repoName.toLowerCase()
  );
}

/** What the PR list says about a red PR's failures. */
export interface PrCiLens {
  /** Open shared groups that hold one of the PR's failed checks, the one blocking most PRs first. */
  groups: CiGroupSummary[];
  /** Open PRs the first group fails, this one included. */
  blockedCount: number;
  /**
   * The cause when every failed check sits in a shared group that is not the
   * PR's doing; null when one of them may be the PR's own failure.
   */
  outsideCause: HypothesisKind | null;
}

/** The lens of a PR with failed checks, or null when none of them is shared. */
export function prCiLens(
  pr: PullRequestWithChecks,
  index: JobIndex,
  blocked: ReadonlyMap<string, number> = new Map(),
): PrCiLens | null {
  const failed = (pr.ciJobs ?? []).filter((job) => FAILED.has(job.conclusion));
  if (failed.length === 0) return null;
  const groups = new Map<string, CiGroupSummary>();
  let outsideCause: HypothesisKind | null = null;
  let allOutside = true;
  for (const job of failed) {
    const held = (job.id > 0 ? (index.get(job.id) ?? []) : []).filter((g) => sameRepo(g, pr));
    for (const group of held) groups.set(group.id, group);
    const cause = held.map((g) => outsideCauseOf(g, pr.pullRequest.baseRef)).find(Boolean);
    if (cause) outsideCause ??= cause;
    else allOutside = false;
  }
  if (groups.size === 0) return null;
  const ordered = [...groups.values()].sort(
    (a, b) => (blocked.get(b.id) ?? 0) - (blocked.get(a.id) ?? 0),
  );
  return {
    groups: ordered,
    blockedCount: Math.max(1, blocked.get(ordered[0]?.id ?? '') ?? 0),
    outsideCause: allOutside && failed.length >= pr.failedCheckNames.length ? outsideCause : null,
  };
}

/** The open PRs each open shared group still fails, by group id. */
export function blockedPrsByGroup(
  groups: readonly CiGroupSummary[],
  prs: readonly PullRequestWithChecks[],
): Map<string, PullRequestWithChecks[]> {
  const index = jobIndexOf(groups);
  const blocked = new Map<string, PullRequestWithChecks[]>();
  for (const pr of prs) {
    const seen = new Set<string>();
    for (const job of pr.ciJobs ?? []) {
      if (!FAILED.has(job.conclusion) || job.id <= 0) continue;
      for (const group of index.get(job.id) ?? []) {
        if (seen.has(group.id) || !sameRepo(group, pr)) continue;
        seen.add(group.id);
        blocked.set(group.id, [...(blocked.get(group.id) ?? []), pr]);
      }
    }
  }
  return blocked;
}

/** A group worth a row above the PR list: it fails 2+ open PRs, or an open PR and the default branch. */
export function isBlocking(group: CiGroupSummary, blockedCount: number): boolean {
  return blockedCount >= 2 || (blockedCount >= 1 && group.defaultBranchRuns.length > 0);
}

/** Why a failure isn't the PR's doing, as a short phrase: "also fails on master". */
export function outsideCauseText(cause: HypothesisKind, branch: string): string {
  switch (cause) {
    case 'base-branch':
      return `also fails on ${branch}`;
    case 'infrastructure':
      return 'an infrastructure fault';
    case 'flaky':
      return 'flaky, passed on a retry';
    default:
      return 'specific to one branch';
  }
}
