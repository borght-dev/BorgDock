import { isMyPr, isWaitingOnMe } from '@/services/pr-grouping';
import {
  type PriorityFactorType,
  type PriorityScore,
  prScoreKey,
} from '@/services/priority-scoring';
import type { PullRequestWithChecks } from '@/types';

/**
 * Explains the Focus badge: how many of the open PRs made it in, why, and —
 * for the "Why not the others?" popover — the top reasons the rest scored 0.
 */
export interface FocusSummary {
  shown: number;
  total: number;
  failing: number;
  waitingOnYou: number;
  stale: number;
  excluded: Array<{ reason: string; count: number }>;
}

const FAILING: ReadonlySet<PriorityFactorType> = new Set(['myPrRedChecks', 'othersRedChecks']);
const WAITING: ReadonlySet<PriorityFactorType> = new Set([
  'reviewRequested',
  'teamReviewRequested',
  'myPrChangesRequested',
  'myPrCommented',
  'myReviewFollowUp',
]);
const STALE: ReadonlySet<PriorityFactorType> = new Set([
  'staleness',
  'myPrStale',
  'reviewStale',
  'myPrUnreviewed',
]);

const UNREVIEWED_AFTER_HOURS = 8;

/** Human reason a PR scored 0 (or was excluded up front). */
export function explainZeroScore(
  pr: PullRequestWithChecks,
  username: string,
  teams: readonly string[] = [],
): string {
  const p = pr.pullRequest;
  const mine = isMyPr(pr, username);

  if (!mine) {
    if (p.isDraft) return 'Drafts by others';
    if (pr.overallStatus === 'yellow') return 'By others, checks still running';
    if (isWaitingOnMe(pr, username, teams)) return 'By others, waiting on you';
    if (p.requestedReviewers.length > 0 || (p.requestedTeams?.length ?? 0) > 0) {
      return 'By others, waiting on other reviewers';
    }
    if (p.reviewStatus === 'approved') return 'By others, approved and green';
    return 'By others, green and no review requested from you';
  }

  if (p.isDraft) return 'Your drafts';
  if (pr.overallStatus === 'yellow') return 'Yours, checks still running';
  if (p.reviewStatus === 'approved') {
    if (p.mergeable === false) return 'Yours, approved but has conflicts';
    return 'Yours, approved but checks not green';
  }
  if (p.reviewStatus === 'none') {
    const openHours = (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60);
    if (openHours <= UNREVIEWED_AFTER_HOURS) return 'Yours, opened less than 8h ago';
    return 'Yours, awaiting a first review';
  }
  if (p.reviewStatus === 'commented') return 'Yours, you replied last';
  return 'Yours, nothing pending';
}

export function summarizeFocus(
  prs: PullRequestWithChecks[],
  scores: Map<string, PriorityScore>,
  username: string,
  teams: readonly string[] = [],
): FocusSummary {
  let shown = 0;
  let failing = 0;
  let waitingOnYou = 0;
  let stale = 0;
  const reasons = new Map<string, number>();

  for (const pr of prs) {
    const score = scores.get(prScoreKey(pr.pullRequest));
    if (score && score.total > 0) {
      shown++;
      const types = new Set(score.factors.map((f) => f.type));
      if ([...types].some((t) => FAILING.has(t))) failing++;
      if ([...types].some((t) => WAITING.has(t))) waitingOnYou++;
      if ([...types].some((t) => STALE.has(t))) stale++;
      continue;
    }
    const reason = explainZeroScore(pr, username, teams);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  const excluded = [...reasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  return { shown, total: prs.length, failing, waitingOnYou, stale, excluded };
}

/** "Showing 5 of 22 — 2 failing, 2 waiting on you, 1 stale". */
export function formatFocusHeadline(s: FocusSummary): string {
  const parts: string[] = [];
  if (s.failing > 0) parts.push(`${s.failing} failing`);
  if (s.waitingOnYou > 0) parts.push(`${s.waitingOnYou} waiting on you`);
  if (s.stale > 0) parts.push(`${s.stale} stale`);
  const head = `Showing ${s.shown} of ${s.total}`;
  return parts.length > 0 ? `${head} — ${parts.join(', ')}` : head;
}
