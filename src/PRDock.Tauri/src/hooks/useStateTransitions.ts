import { useCallback, useRef } from 'react';
import {
  buildAllChecksPassedNotification,
  buildBecameMergeableNotification,
  buildCheckFailedNotification,
  buildPrMergedNotification,
  buildReviewRequestedNotification,
  detectStateTransitions,
  sendOsNotification,
} from '@/services/notification';
import type { OsNotificationButton } from '@/services/notification';
import { useNotificationStore } from '@/stores/notification-store';
import type { AppSettings, InAppNotification, PullRequestWithChecks } from '@/types';

/** Context-aware OS buttons per transition type */
const CI_FAILURE_BUTTONS: OsNotificationButton[] = [
  { label: 'Fix with Claude', action: 'fix-with-claude' },
  { label: 'Re-run', action: 'rerun' },
];

const MERGEABLE_BUTTONS: OsNotificationButton[] = [
  { label: 'Merge', action: 'merge' },
  { label: 'Open in GitHub', action: 'open' },
];

const DEFAULT_PR_BUTTONS: OsNotificationButton[] = [
  { label: 'Merge', action: 'merge' },
  { label: 'Approve changes', action: 'approve' },
  { label: 'Bypass Merge', action: 'bypass' },
];

export function useStateTransitions(settings: AppSettings) {
  const previousPrsRef = useRef<PullRequestWithChecks[]>([]);
  const dedupRef = useRef(new Map<string, number>());

  const isDuplicate = useCallback(
    (type: string, pr: { repoOwner: string; repoName: string; number: number }) => {
      const key = `${type}:${pr.repoOwner}/${pr.repoName}#${pr.number}`;
      const now = Date.now();
      const windowMs = (settings.notifications.deduplicationWindowSeconds ?? 60) * 1000;
      const lastSeen = dedupRef.current.get(key);

      if (lastSeen && now - lastSeen < windowMs) {
        return true;
      }

      // Clean up old entries
      for (const [k, ts] of dedupRef.current) {
        if (now - ts > windowMs * 2) dedupRef.current.delete(k);
      }

      dedupRef.current.set(key, now);
      return false;
    },
    [settings.notifications.deduplicationWindowSeconds],
  );

  const processTransitions = useCallback(
    (newPrs: PullRequestWithChecks[]) => {
      const oldPrs = previousPrsRef.current;
      previousPrsRef.current = newPrs;

      // Skip first poll (no previous data to compare)
      if (oldPrs.length === 0) return;

      const username = settings.gitHub.username;
      const transitions = detectStateTransitions(oldPrs, newPrs, username);

      for (const transition of transitions) {
        // Filter to only the user's own PRs when enabled
        if (
          settings.notifications.onlyMyPRs &&
          username &&
          !transition.pr.authorLogin.toLowerCase().includes(username.toLowerCase())
        ) {
          continue;
        }

        // Deduplication check
        if (isDuplicate(transition.type, transition.pr)) continue;

        let notification: InAppNotification | undefined;
        let osButtons: OsNotificationButton[] | undefined = DEFAULT_PR_BUTTONS;

        switch (transition.type) {
          case 'checkFailed':
            if (!settings.notifications.toastOnCheckStatusChange) continue;
            notification = buildCheckFailedNotification(
              transition.pr,
              transition.detail ?? 'Unknown check',
            );
            osButtons = CI_FAILURE_BUTTONS;
            break;
          case 'allChecksPassed':
            if (!settings.notifications.toastOnCheckStatusChange) continue;
            notification = buildAllChecksPassedNotification(transition.pr);
            break;
          case 'reviewChangesRequested':
            if (!settings.notifications.toastOnReviewUpdate) continue;
            notification = {
              title: 'Changes requested',
              message: `#${transition.pr.number} ${transition.pr.title}`,
              severity: 'warning' as const,
              launchUrl: transition.pr.htmlUrl,
              prNumber: transition.pr.number,
              repoFullName: `${transition.pr.repoOwner}/${transition.pr.repoName}`,
              actions: [{ label: 'Open in GitHub', url: transition.pr.htmlUrl }],
            };
            break;
          case 'reviewRequested':
            if (!settings.notifications.toastOnReviewUpdate) continue;
            notification = buildReviewRequestedNotification(
              transition.pr,
              transition.detail ?? username,
            );
            break;
          case 'becameMergeable':
            if (!settings.notifications.toastOnMergeable) continue;
            notification = buildBecameMergeableNotification(transition.pr);
            osButtons = MERGEABLE_BUTTONS;
            break;
          case 'merged':
            notification = buildPrMergedNotification(transition.pr);
            osButtons = undefined; // no buttons for merged
            break;
        }

        if (notification) {
          useNotificationStore.getState().show(notification);

          sendOsNotification({
            title: notification.title,
            body: notification.message,
            prOwner: transition.pr.repoOwner,
            prRepo: transition.pr.repoName,
            prNumber: transition.pr.number,
            buttons: osButtons,
          }).catch(console.debug); /* fire-and-forget: OS notification */
        }
      }
    },
    [settings.notifications, settings.gitHub.username, isDuplicate],
  );

  return { processTransitions };
}
