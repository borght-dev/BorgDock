import type { ReviewSlaTier } from '@/services/review-sla';
import type { InAppNotification, PullRequest, PullRequestWithChecks } from '@/types';

export function isReadyToMerge(pr: PullRequestWithChecks): boolean {
  return (
    !pr.checksUnavailable &&
    pr.overallStatus === 'green' &&
    !pr.pullRequest.isDraft &&
    pr.pullRequest.mergeable !== false &&
    pr.pullRequest.reviewStatus === 'approved'
  );
}

// --- InAppNotification builders ---

export function buildCheckFailedNotification(
  pr: PullRequest,
  checkName: string,
): InAppNotification {
  return {
    title: `Check failed: ${checkName}`,
    message: `#${pr.number} ${pr.title} (${pr.repoOwner}/${pr.repoName})`,
    severity: 'error',
    launchUrl: pr.htmlUrl,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [
      { label: 'Open in GitHub', url: pr.htmlUrl },
      {
        label: 'Fix with Claude',
        url: `borgdock://fix/${encodeURIComponent(pr.repoOwner)}/${encodeURIComponent(pr.repoName)}/${pr.number}`,
      },
    ],
  };
}

export function buildAllChecksPassedNotification(pr: PullRequest): InAppNotification {
  return {
    title: 'All checks passed',
    message: `#${pr.number} ${pr.title} (${pr.repoOwner}/${pr.repoName})`,
    severity: 'success',
    launchUrl: pr.htmlUrl,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [{ label: 'Open in GitHub', url: pr.htmlUrl }],
  };
}

export function buildReviewRequestedNotification(
  pr: PullRequest,
  reviewer: string,
): InAppNotification {
  return {
    title: `Review requested from ${reviewer}`,
    message: `#${pr.number} ${pr.title} (${pr.repoOwner}/${pr.repoName})`,
    severity: 'warning',
    launchUrl: pr.htmlUrl,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [{ label: 'Open in GitHub', url: pr.htmlUrl }],
  };
}

export function buildClaudeReviewCriticalNotification(
  pr: PullRequest,
  count: number,
): InAppNotification {
  return {
    title: `Claude found ${count} critical issue${count === 1 ? '' : 's'}`,
    message: `#${pr.number} ${pr.title} (${pr.repoOwner}/${pr.repoName})`,
    severity: 'error',
    launchUrl: pr.htmlUrl,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [
      { label: 'Open in GitHub', url: pr.htmlUrl },
      {
        label: 'Fix with Claude',
        url: `borgdock://fix/${encodeURIComponent(pr.repoOwner)}/${encodeURIComponent(pr.repoName)}/${pr.number}`,
      },
    ],
  };
}

export function buildPrMergedNotification(pr: PullRequest): InAppNotification {
  return {
    title: `🎉 PR #${pr.number} merged!`,
    message: `${pr.title} (${pr.repoOwner}/${pr.repoName})`,
    severity: 'merged',
    launchUrl: pr.htmlUrl,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [{ label: 'View on GitHub', url: pr.htmlUrl }],
  };
}

export function buildFixCommittedNotification(pr: PullRequest): InAppNotification {
  return {
    title: 'Fix committed',
    message: `#${pr.number} ${pr.title} (${pr.repoOwner}/${pr.repoName})`,
    severity: 'success',
    launchUrl: pr.htmlUrl,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [{ label: 'Open in GitHub', url: pr.htmlUrl }],
  };
}

export function buildReviewNudgeNotification(
  pr: PullRequest,
  waitTime: string,
  tier: ReviewSlaTier,
): InAppNotification {
  const severity = tier === 'stale' ? 'error' : tier === 'aging' ? 'warning' : 'info';
  const urgency = tier === 'stale' ? 'Urgent: ' : '';
  return {
    title: `${urgency}Review waiting ${waitTime}`,
    message: `#${pr.number} ${pr.title} (${pr.repoOwner}/${pr.repoName})`,
    severity,
    launchUrl: `${pr.htmlUrl}/files`,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [{ label: 'Start Review', url: `${pr.htmlUrl}/files` }],
  };
}

export function buildBecameMergeableNotification(pr: PullRequest): InAppNotification {
  return {
    title: 'PR ready to merge',
    message: `#${pr.number} ${pr.title} (${pr.repoOwner}/${pr.repoName})`,
    severity: 'success',
    launchUrl: pr.htmlUrl,
    prNumber: pr.number,
    repoFullName: `${pr.repoOwner}/${pr.repoName}`,
    actions: [
      {
        label: 'Merge',
        url: `borgdock://merge/${encodeURIComponent(pr.repoOwner)}/${encodeURIComponent(pr.repoName)}/${pr.number}`,
      },
      { label: 'Open in GitHub', url: pr.htmlUrl },
    ],
  };
}

// --- OS notification ---

export interface OsNotificationOptions {
  title: string;
  body: string;
  severity?: 'info' | 'success' | 'warning' | 'error' | 'merged';
  id?: string;
  prOwner?: string;
  prRepo?: string;
  prNumber?: number;
  sessionId?: string;
  actions?: { label: string; action: string; url?: string }[];
}

/** Map a built `InAppNotification` (the legacy in-app overlay shape) to the
 *  OS-notification payload. Action URLs default to the `open-url` routing in
 *  FlyoutApp's handleToastAction; PR context comes from repoFullName/prNumber.
 */
export function inAppToOsOptions(n: import('@/types').InAppNotification): OsNotificationOptions {
  const [prOwner, prRepo] = n.repoFullName?.split('/') ?? [undefined, undefined];
  return {
    title: n.title,
    body: n.message,
    severity: n.severity,
    prOwner,
    prRepo,
    prNumber: n.prNumber,
    actions: n.actions.map((a) => ({ label: a.label, action: 'open-url', url: a.url })),
  };
}

export async function sendOsNotification(options: OsNotificationOptions): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  const severity = options.severity ?? 'info';
  const id =
    options.id ??
    (options.prOwner && options.prRepo && options.prNumber
      ? `${options.prOwner}/${options.prRepo}#${options.prNumber}`
      : `${options.title}-${Date.now()}`);
  const payload = {
    id,
    severity,
    title: options.title,
    body: options.body,
    prOwner: options.prOwner,
    prRepo: options.prRepo,
    prNumber: options.prNumber,
    sessionId: options.sessionId,
    actions: options.actions ?? [],
  };
  if (severity === 'merged') {
    const { playMergeSoundIfEnabled } = await import('@/services/merge-celebration');
    playMergeSoundIfEnabled();
  }
  await invoke('show_flyout_toast', { payload });
}
