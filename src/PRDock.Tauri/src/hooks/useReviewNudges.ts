import { useCallback, useEffect, useRef } from 'react';
import { buildReviewNudgeNotification, sendOsNotification } from '@/services/notification';
import type { ReviewSlaTier } from '@/services/review-sla';
import { formatReviewWaitTime, getReviewSlaTier } from '@/services/review-sla';
import { useNotificationStore } from '@/stores/notification-store';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import type { AppSettings } from '@/types';

function nudgeIntervalMs(baseMinutes: number, tier: ReviewSlaTier, escalation: boolean): number {
  if (!escalation) return baseMinutes * 60_000;
  switch (tier) {
    case 'fresh':
      return baseMinutes * 2 * 60_000;
    case 'aging':
      return baseMinutes * 60_000;
    case 'stale':
      return Math.max(baseMinutes * 0.5, 15) * 60_000;
  }
}

export function useReviewNudges(settings: AppSettings) {
  const lastNudgedRef = useRef<Map<string, number>>(new Map());
  const isFirstPoll = useRef(true);

  const checkNudges = useCallback(() => {
    const { reviewNudgeEnabled, reviewNudgeIntervalMinutes, reviewNudgeEscalation } =
      settings.notifications;
    if (!reviewNudgeEnabled) return;

    // Don't nudge when the app is in the foreground and visible
    if (document.visibilityState === 'visible') return;

    const username = settings.gitHub.username;
    if (!username) return;

    const state = usePrStore.getState();
    const reviewQueue = state.needsMyReview();

    if (reviewQueue.length === 0) return;

    const now = Date.now();

    for (const pr of reviewQueue) {
      const prk = `${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}#${pr.pullRequest.number}`;
      const requestedAt = state.getReviewRequestedAt(prk, username);
      if (!requestedAt) continue;

      const tier = getReviewSlaTier(requestedAt);
      const interval = nudgeIntervalMs(reviewNudgeIntervalMinutes, tier, reviewNudgeEscalation);
      const lastNudged = lastNudgedRef.current.get(prk) ?? 0;

      if (now - lastNudged < interval) continue;

      const waitTime = formatReviewWaitTime(requestedAt);
      const notification = buildReviewNudgeNotification(pr.pullRequest, waitTime, tier);

      useNotificationStore.getState().show(notification);
      lastNudgedRef.current.set(prk, now);

      if (!useUiStore.getState().isSidebarVisible) {
        sendOsNotification({
          title: notification.title,
          body: notification.message,
          prOwner: pr.pullRequest.repoOwner,
          prRepo: pr.pullRequest.repoName,
          prNumber: pr.pullRequest.number,
        }).catch(() => {});
      }
    }

    // Clean up entries for PRs no longer in the review queue
    const activeKeys = new Set(
      reviewQueue.map(
        (pr) => `${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}#${pr.pullRequest.number}`,
      ),
    );
    for (const key of lastNudgedRef.current.keys()) {
      if (!activeKeys.has(key)) {
        lastNudgedRef.current.delete(key);
      }
    }
  }, [settings.notifications, settings.gitHub.username]);

  // Run nudge check whenever PRs change (triggered by polling)
  const pullRequests = usePrStore((s) => s.pullRequests);

  useEffect(() => {
    if (pullRequests.length === 0) return;

    // Skip the very first poll — don't nudge on startup
    if (isFirstPoll.current) {
      isFirstPoll.current = false;
      return;
    }

    checkNudges();
  }, [pullRequests, checkNudges]);

  // Also run a periodic check independent of polling (in case polls are infrequent)
  useEffect(() => {
    if (!settings.notifications.reviewNudgeEnabled) return;

    const intervalMs = Math.min(
      settings.notifications.reviewNudgeIntervalMinutes * 60_000,
      300_000,
    );
    const timer = setInterval(checkNudges, intervalMs);
    return () => clearInterval(timer);
  }, [
    settings.notifications.reviewNudgeEnabled,
    settings.notifications.reviewNudgeIntervalMinutes,
    checkNudges,
  ]);
}
