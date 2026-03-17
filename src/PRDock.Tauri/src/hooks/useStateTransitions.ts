import { useRef, useCallback } from 'react';
import type { PullRequestWithChecks, AppSettings } from '@/types';
import { useNotificationStore } from '@/stores/notification-store';
import {
  detectStateTransitions,
  buildCheckFailedNotification,
  buildAllChecksPassedNotification,
  sendOsNotification,
} from '@/services/notification';

export function useStateTransitions(settings: AppSettings) {
  const previousPrsRef = useRef<PullRequestWithChecks[]>([]);

  const processTransitions = useCallback(
    (newPrs: PullRequestWithChecks[]) => {
      const oldPrs = previousPrsRef.current;
      previousPrsRef.current = newPrs;

      // Skip first poll (no previous data to compare)
      if (oldPrs.length === 0) return;

      const transitions = detectStateTransitions(oldPrs, newPrs);

      for (const transition of transitions) {
        let notification;

        switch (transition.type) {
          case 'checkFailed':
            if (!settings.notifications.toastOnCheckStatusChange) continue;
            notification = buildCheckFailedNotification(
              transition.pr,
              transition.detail ?? 'Unknown check'
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
        }

        if (notification) {
          useNotificationStore.getState().show(notification);

          // Also fire OS notification
          sendOsNotification(notification.title, notification.message).catch(() => {});
        }
      }
    },
    [settings.notifications]
  );

  return { processTransitions };
}
