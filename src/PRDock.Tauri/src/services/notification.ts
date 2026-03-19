import type { InAppNotification, PullRequest, PullRequestWithChecks } from '@/types';

export interface StateTransition {
  type: 'checkFailed' | 'allChecksPassed' | 'reviewChangesRequested';
  pr: PullRequest;
  detail?: string;
}

// --- State transition detection ---

export function detectStateTransitions(
  oldPrs: PullRequestWithChecks[],
  newPrs: PullRequestWithChecks[],
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
        url: `prdock://fix/${pr.repoOwner}/${pr.repoName}/${pr.number}`,
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
        url: `prdock://fix/${pr.repoOwner}/${pr.repoName}/${pr.number}`,
      },
    ],
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

// --- OS notification ---

export async function sendOsNotification(title: string, body: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('send_notification', { title, body });
}

// --- Helpers ---

function prKey(pr: PullRequest): string {
  return `${pr.repoOwner}/${pr.repoName}#${pr.number}`;
}
