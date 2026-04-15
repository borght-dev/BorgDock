import { getReviewSlaTier } from '@/services/review-sla';
import type { PullRequestWithChecks, RepoPriority } from '@/types';

export interface PriorityFactor {
  type: string;
  points: number;
  label: string;
}

export interface PriorityScore {
  total: number;
  factors: PriorityFactor[];
  primaryReason: string;
}

export function computePriorityScores(
  prs: PullRequestWithChecks[],
  username: string,
  reviewRequestTimestamps: Record<string, string>,
  contributorWeights?: Map<string, number>,
  repoPriority?: Record<string, RepoPriority>,
): Map<number, PriorityScore> {
  const scores = new Map<number, PriorityScore>();

  for (const pr of prs) {
    const p = pr.pullRequest;
    const isMine = username !== '' && p.authorLogin.toLowerCase() === username.toLowerCase();

    // Others' drafts: excluded entirely
    if (p.isDraft && !isMine) continue;

    const factors: PriorityFactor[] = [];

    // readyToMerge (0-45)
    if (
      isMine &&
      pr.overallStatus === 'green' &&
      !p.isDraft &&
      p.mergeable !== false &&
      p.reviewStatus === 'approved'
    ) {
      factors.push({ type: 'readyToMerge', points: 45, label: 'Ready to merge' });
    }

    // myPrNeedsAttention (0-35)
    if (isMine) {
      if (pr.overallStatus === 'red') {
        factors.push({ type: 'myPrRedChecks', points: 20, label: 'Build failing' });
      }
      if (p.reviewStatus === 'changesRequested') {
        factors.push({ type: 'myPrChangesRequested', points: 15, label: 'Changes requested' });
      }
      // Staleness bonus for own PR with unresolved issues
      if (
        (pr.overallStatus === 'red' || p.reviewStatus === 'changesRequested') &&
        hoursAgo(p.updatedAt) > 24
      ) {
        factors.push({ type: 'myPrStale', points: 10, label: `Stale ${daysAgo(p.updatedAt)}d` });
      }
    }

    // reviewRequested (0-30)
    if (username) {
      const isRequested = p.requestedReviewers.some(
        (r) => r.toLowerCase() === username.toLowerCase(),
      );
      if (isRequested) {
        const tsKey = `${p.repoOwner}/${p.repoName}#${p.number}:${username.toLowerCase()}`;
        const requestedAt = reviewRequestTimestamps[tsKey];
        factors.push({ type: 'reviewRequested', points: 15, label: 'Review requested' });

        if (requestedAt) {
          const tier = getReviewSlaTier(requestedAt);
          if (tier === 'aging') {
            factors.push({ type: 'reviewAging', points: 7, label: 'Review aging' });
          } else if (tier === 'stale') {
            factors.push({ type: 'reviewStale', points: 8, label: 'Review overdue' });
          }
        }
      }
    }

    // staleness (0-10) — for any PR
    const hours = hoursAgo(p.updatedAt);
    if (hours > 24) {
      const stalePoints = Math.min(10, Math.floor((hours - 24) / 24) + 2);
      factors.push({
        type: 'staleness',
        points: stalePoints,
        label: `Stale ${daysAgo(p.updatedAt)}d`,
      });
    }

    // checkStatus (0-5) — red checks on others' PR
    if (!isMine && pr.overallStatus === 'red') {
      factors.push({ type: 'othersRedChecks', points: 5, label: 'Build failing' });
    }

    // Sum base score
    let total = factors.reduce((sum, f) => sum + f.points, 0);

    // repoWeight multiplier
    const repoKey = `${p.repoOwner}/${p.repoName}`;
    let multiplier = 1.0;

    // Manual override takes precedence
    const manualPriority = repoPriority?.[repoKey];
    if (manualPriority === 'high') {
      multiplier = 1.2;
    } else if (manualPriority === 'low') {
      multiplier = 0.5;
    } else if (contributorWeights) {
      // Activity-based weight
      const weight = contributorWeights.get(repoKey) ?? 1.0;
      multiplier = weight < 0.1 ? 0.7 : 1.0;
    }

    total = Math.round(total * multiplier);

    // Build primary reason from highest-point factor
    const sorted = [...factors].sort((a, b) => b.points - a.points);
    const primaryReason = sorted.map((f) => f.label).join(' \u00b7 ') || 'Open PR';

    scores.set(p.number, { total, factors, primaryReason });
  }

  return scores;
}

export function sortByPriority(
  prs: PullRequestWithChecks[],
  scores: Map<number, PriorityScore>,
): PullRequestWithChecks[] {
  return [...prs]
    .filter((pr) => scores.has(pr.pullRequest.number))
    .sort((a, b) => {
      const sa = scores.get(a.pullRequest.number)!;
      const sb = scores.get(b.pullRequest.number)!;

      // Descending by score
      if (sb.total !== sa.total) return sb.total - sa.total;

      // Tie-break 1: oldest updatedAt first
      const aTime = new Date(a.pullRequest.updatedAt).getTime();
      const bTime = new Date(b.pullRequest.updatedAt).getTime();
      if (aTime !== bTime) return aTime - bTime;

      // Tie-break 2: smaller PR first
      const aSize = a.pullRequest.additions + a.pullRequest.deletions;
      const bSize = b.pullRequest.additions + b.pullRequest.deletions;
      return aSize - bSize;
    });
}

function hoursAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
}

function daysAgo(dateStr: string): number {
  return Math.floor(hoursAgo(dateStr) / 24);
}
