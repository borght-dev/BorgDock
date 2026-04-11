import type { ReviewSlaTier } from '@/services/review-sla';
import type { InAppNotification, PullRequest, PullRequestWithChecks } from '@/types';

export interface StateTransition {
  type: 'checkFailed' | 'allChecksPassed' | 'reviewChangesRequested' | 'reviewRequested' | 'merged' | 'becameMergeable';
  pr: PullRequest;
  detail?: string;
}

export function isReadyToMerge(pr: PullRequestWithChecks): boolean {
  return (
    pr.overallStatus === 'green' &&
    !pr.pullRequest.isDraft &&
    pr.pullRequest.mergeable !== false &&
    pr.pullRequest.reviewStatus === 'approved'
  );
}

// --- State transition detection ---

export function detectStateTransitions(
  oldPrs: PullRequestWithChecks[],
  newPrs: PullRequestWithChecks[],
  username?: string,
): StateTransition[] {
  const transitions: StateTransition[] = [];
  const oldByKey = new Map(oldPrs.map((p) => [prKey(p.pullRequest), p]));

  for (const cur of newPrs) {
    const key = prKey(cur.pullRequest);
    const prev = oldByKey.get(key);
    if (!prev) continue;

    // Check transitions: not red -> red
    if (prev.overallStatus !== 'red' && cur.overallStatus === 'red') {
      const previousFailedNames = new Set(prev.failedCheckNames);
      for (const failedName of cur.failedCheckNames) {
        if (!previousFailedNames.has(failedName)) {
          transitions.push({
            type: 'checkFailed',
            pr: cur.pullRequest,
            detail: failedName,
          });
        }
      }

      // Edge case: all current failures were already known, still notify first
      if (
        cur.failedCheckNames.length > 0 &&
        cur.failedCheckNames.every((n) => previousFailedNames.has(n))
      ) {
        transitions.push({
          type: 'checkFailed',
          pr: cur.pullRequest,
          detail: cur.failedCheckNames[0],
        });
      }
    }

    // Check transitions: not green -> green
    if (prev.overallStatus !== 'green' && cur.overallStatus === 'green') {
      transitions.push({
        type: 'allChecksPassed',
        pr: cur.pullRequest,
      });
    }

    // Review transitions: -> changesRequested
    if (
      prev.pullRequest.reviewStatus !== cur.pullRequest.reviewStatus &&
      cur.pullRequest.reviewStatus === 'changesRequested'
    ) {
      transitions.push({
        type: 'reviewChangesRequested',
        pr: cur.pullRequest,
      });
    }

    // Merged transition: was not merged -> now merged
    if (!prev.pullRequest.mergedAt && cur.pullRequest.mergedAt) {
      transitions.push({
        type: 'merged',
        pr: cur.pullRequest,
      });
    }

    // Became mergeable transition: was not ready → now ready
    if (!isReadyToMerge(prev) && isReadyToMerge(cur)) {
      transitions.push({
        type: 'becameMergeable',
        pr: cur.pullRequest,
      });
    }

    // Review requested transition: user is now a requested reviewer but wasn't before
    if (username) {
      const uLower = username.toLowerCase();
      const wasPending = prev.pullRequest.requestedReviewers.some(
        (r) => r.toLowerCase() === uLower,
      );
      const isPending = cur.pullRequest.requestedReviewers.some(
        (r) => r.toLowerCase() === uLower,
      );
      if (!wasPending && isPending) {
        transitions.push({
          type: 'reviewRequested',
          pr: cur.pullRequest,
          detail: username,
        });
      }
    }
  }

  return transitions;
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
        url: `prdock://fix/${encodeURIComponent(pr.repoOwner)}/${encodeURIComponent(pr.repoName)}/${pr.number}`,
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
        url: `prdock://fix/${encodeURIComponent(pr.repoOwner)}/${encodeURIComponent(pr.repoName)}/${pr.number}`,
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
    actions: [
      { label: 'Start Review', url: `${pr.htmlUrl}/files` },
    ],
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
      { label: 'Merge', url: `prdock://merge/${encodeURIComponent(pr.repoOwner)}/${encodeURIComponent(pr.repoName)}/${pr.number}` },
      { label: 'Open in GitHub', url: pr.htmlUrl },
    ],
  };
}

// --- OS notification ---

export interface OsNotificationButton {
  label: string;
  action: string;
}

export interface OsNotificationOptions {
  title: string;
  body: string;
  prOwner?: string;
  prRepo?: string;
  prNumber?: number;
  buttons?: OsNotificationButton[];
}

export async function sendOsNotification(options: OsNotificationOptions): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('send_notification', {
    title: options.title,
    body: options.body,
    prOwner: options.prOwner,
    prRepo: options.prRepo,
    prNumber: options.prNumber,
    buttons: options.buttons,
  });
}

// --- Helpers ---

function prKey(pr: PullRequest): string {
  return `${pr.repoOwner}/${pr.repoName}#${pr.number}`;
}
