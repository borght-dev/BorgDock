import type { PillTone } from '@/components/shared/primitives';
import type { OverallStatus, PullRequestWithChecks } from '@/types';

/** View model for a PR row — shared by the main list, Focus, and the tray flyout. */
export interface PrCardData {
  number: number;
  title: string;
  repoOwner: string;
  repoName: string;
  authorLogin: string;
  isMine: boolean;
  status: OverallStatus;
  statusLabel: string;
  reviewState: 'approved' | 'changes' | 'commented' | 'pending' | 'none';
  isDraft: boolean;
  isMerged: boolean;
  isClosed: boolean;
  hasConflict: boolean;
  branch?: string;
  baseBranch?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  commitCount?: number;
  commentCount?: number;
  labels?: string[];
  worktreeSlot?: string;
}

export const REVIEW_PILL: Record<
  PrCardData['reviewState'],
  { tone: PillTone; label: string; toneAttr: string } | null
> = {
  approved: { tone: 'success', label: 'approved', toneAttr: 'approved' },
  changes: { tone: 'error', label: 'changes', toneAttr: 'changes' },
  commented: { tone: 'draft', label: 'commented', toneAttr: 'commented' },
  pending: { tone: 'warning', label: 'review needed', toneAttr: 'pending' },
  none: null,
};

export function avatarInitials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

export function reviewStateFor(reviewStatus: string | undefined): PrCardData['reviewState'] {
  switch (reviewStatus) {
    case 'approved':
      return 'approved';
    case 'changesRequested':
      return 'changes';
    case 'commented':
      return 'commented';
    case 'pending':
      return 'pending';
    default:
      return 'none';
  }
}

/** CI summary shown in every PR row: "N failing" / "in progress" / "x/y passing". */
export function checksStatusLabel(counts: {
  failed: number;
  pending: number;
  passed: number;
  /** Checks that count toward the pass ratio (total minus skipped). */
  relevant: number;
}): string {
  if (counts.failed > 0) return `${counts.failed} failing`;
  if (counts.pending > 0) return 'in progress';
  if (counts.relevant > 0) return `${counts.passed}/${counts.relevant} passing`;
  return '';
}

export function toPrCardData(
  prw: PullRequestWithChecks,
  isMine: boolean,
  worktreeSlot?: string,
): PrCardData {
  const pr = prw.pullRequest;
  return {
    number: pr.number,
    title: pr.title,
    repoOwner: pr.repoOwner,
    repoName: pr.repoName,
    authorLogin: pr.authorLogin,
    isMine,
    status: prw.overallStatus,
    statusLabel: checksStatusLabel({
      failed: prw.failedCheckNames.length,
      pending: prw.pendingCheckNames.length,
      passed: prw.passedCount,
      relevant: prw.totalCheckCount - prw.skippedCount,
    }),
    reviewState: reviewStateFor(pr.reviewStatus),
    isDraft: pr.isDraft,
    isMerged: !!pr.mergedAt,
    isClosed: !!pr.closedAt,
    hasConflict: pr.mergeable === false,
    branch: pr.headRef,
    baseBranch: pr.baseRef,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changedFiles: pr.changedFiles ?? 0,
    commitCount: pr.commitCount ?? 0,
    commentCount: pr.commentCount,
    labels: pr.labels,
    worktreeSlot,
  };
}
