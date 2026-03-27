import { useCallback, useRef } from 'react';
import {
  buildAllChecksPassedNotification,
  buildCheckFailedNotification,
  buildPrMergedNotification,
  detectStateTransitions,
  sendOsNotification,
} from '@/services/notification';
import { useNotificationStore } from '@/stores/notification-store';
import type { AppSettings, InAppNotification, PullRequestWithChecks } from '@/types';

export function useStateTransitions(settings: AppSettings) {
  const previousPrsRef = useRef<PullRequestWithChecks[]>([]);

  const processTransitions = useCallback(
    (newPrs: PullRequestWithChecks[]) => {
      const oldPrs = previousPrsRef.current;
      previousPrsRef.current = newPrs;

      // Skip first poll (no previous data to compare)
      if (oldPrs.length === 0) return;

      const transitions = detectStateTransitions(oldPrs, newPrs);

      const username = settings.gitHub.username;

      for (const transition of transitions) {
        // Filter to only the user's own PRs when enabled
        if (
          settings.notifications.onlyMyPRs &&
          username &&
          !transition.pr.authorLogin.toLowerCase().includes(username.toLowerCase())
        ) {
          continue;
        }

        let notification: InAppNotification | undefined;

        switch (transition.type) {
          case 'checkFailed':
            if (!settings.notifications.toastOnCheckStatusChange) continue;
            notification = buildCheckFailedNotification(
              transition.pr,
              transition.detail ?? 'Unknown check',
            );
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
          case 'merged':
            notification = buildPrMergedNotification(transition.pr);
            break;
        }

        if (notification) {
          useNotificationStore.getState().show(notification);

          // Also fire OS notification
          sendOsNotification(notification.title, notification.message).catch(() => {});
        }
      }
    },
    [settings.notifications, settings.gitHub.username],
  );

  return { processTransitions };
}
