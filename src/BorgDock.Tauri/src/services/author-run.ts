import type { HypothesisKind } from '@/services/ci-failures/hypothesis';
import { outsideCauseText } from '@/services/ci-failures/lens';
import type { E2eRead } from '@/services/e2e/load';
import { e2eVerdictText, isE2eCheck } from '@/services/e2e/report';
import type { PullRequestWithChecks } from '@/types';

/**
 * An author run: one author's open PRs in Quick Review, oldest first, with
 * the ones you can't merge yet left out. A PR is in when it has no
 * conflicts and every failed check is not its doing: an E2E failure the
 * report clears (only jobs of the run it reports on), or a related CI
 * failure that is shared. Pure.
 */

export type HoldReason = 'conflicts' | 'failing' | 'e2e';

export type RunFit =
  /** Green or still running: approve and auto-merge. */
  | { kind: 'ready'; bypass: null }
  /** Red only from failures that are not the PR's: approve and merge past them. */
  | { kind: 'ready'; bypass: string }
  | { kind: 'held'; reason: HoldReason; why: string }
  /** The E2E report is still being read. */
  | { kind: 'checking' };

export interface FitEvidence {
  /** The E2E report's verdict: null without a failed E2E check, undefined while it is read. */
  e2e: E2eRead | null | undefined;
  /** The related-failure cause when every failed check is shared and not the PR's doing. */
  outsideCause: HypothesisKind | null;
}

function listed(names: readonly string[]): string {
  return names.length > 1 ? `${names[0]} and ${names.length - 1} more` : (names[0] ?? '');
}

export function runFit(pr: PullRequestWithChecks, evidence: FitEvidence): RunFit {
  if (pr.pullRequest.mergeable === false)
    return { kind: 'held', reason: 'conflicts', why: 'Has merge conflicts' };
  const failed = pr.failedCheckNames;
  if (failed.length === 0) return { kind: 'ready', bypass: null };
  if (evidence.outsideCause)
    return {
      kind: 'ready',
      bypass: `Not this PR's failure: ${outsideCauseText(evidence.outsideCause, pr.pullRequest.baseRef)}`,
    };
  const { e2e } = evidence;
  // Until the report is read, only checks that can't be E2E are known to be the PR's own.
  const covered = (name: string) =>
    e2e === undefined ? isE2eCheck(name) : !!e2e?.covers.has(name);
  const own = failed.filter((name) => !covered(name));
  if (own.length > 0) return { kind: 'held', reason: 'failing', why: `${listed(own)} fails` };
  if (!e2e) return { kind: 'checking' };
  if (e2e.verdict.kind !== 'outside')
    return { kind: 'held', reason: 'e2e', why: e2eVerdictText(e2e.verdict) };
  return { kind: 'ready', bypass: e2eVerdictText(e2e.verdict) };
}

function approvedByAtHead(pr: PullRequestWithChecks, login: string): boolean {
  const me = login.toLowerCase();
  const head = pr.pullRequest.headSha;
  return (pr.pullRequest.latestReviews ?? []).some(
    (review) =>
      review.authorLogin.toLowerCase() === me &&
      review.state === 'approved' &&
      (!head || !review.commitSha || review.commitSha === head),
  );
}

/** `author`'s open, non-draft PRs that `me` hasn't approved at their head, oldest first. */
export function authorCandidates(
  prs: readonly PullRequestWithChecks[],
  author: string,
  me: string,
): PullRequestWithChecks[] {
  const login = author.toLowerCase();
  if (login === me.toLowerCase()) return [];
  return prs
    .filter(
      (pr) =>
        pr.pullRequest.authorLogin.toLowerCase() === login &&
        pr.pullRequest.state === 'open' &&
        !pr.pullRequest.isDraft &&
        !approvedByAtHead(pr, me),
    )
    .sort((a, b) => a.pullRequest.createdAt.localeCompare(b.pullRequest.createdAt));
}

export interface HeldPr {
  pr: PullRequestWithChecks;
  fit: Extract<RunFit, { kind: 'held' }>;
}

export interface AuthorRunPlan {
  /** The PRs to review, in order. */
  queue: PullRequestWithChecks[];
  /** The author's PRs left out, oldest first. */
  held: HeldPr[];
  /** PRs whose E2E report is still being read. */
  checking: PullRequestWithChecks[];
}

/** Splits `candidates` into the run and what it leaves out. */
export function planAuthorRun(
  candidates: readonly PullRequestWithChecks[],
  fitOf: (pr: PullRequestWithChecks) => RunFit,
): AuthorRunPlan {
  const plan: AuthorRunPlan = { queue: [], held: [], checking: [] };
  for (const pr of candidates) {
    const fit = fitOf(pr);
    if (fit.kind === 'ready') plan.queue.push(pr);
    else if (fit.kind === 'held') plan.held.push({ pr, fit });
    else plan.checking.push(pr);
  }
  return plan;
}
