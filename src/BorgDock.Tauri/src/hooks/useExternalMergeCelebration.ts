import { useEffect, useRef } from 'react';
import { celebrateMerge, wasRecentlyCelebrated } from '@/services/merge-celebration';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';

function key(pr: { repoOwner: string; repoName: string; number: number }): string {
  return `${pr.repoOwner}/${pr.repoName}#${pr.number}`;
}

function openIds(prs: PullRequestWithChecks[]): Set<string> {
  const s = new Set<string>();
  for (const p of prs) s.add(key(p.pullRequest));
  return s;
}

/**
 * Watches the PR store for open→merged transitions and fires `celebrateMerge`
 * for each. Mounted once at the app root next to `useGitHubPolling`.
 */
export function useExternalMergeCelebration(): void {
  const prevOpenIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // Seed prevOpenIds from the current snapshot — never celebrate PRs that
    // were already merged before the app started watching.
    if (prevOpenIdsRef.current === null) {
      prevOpenIdsRef.current = openIds(usePrStore.getState().pullRequests);
    }

    const unsubscribe = usePrStore.subscribe((state, prevState) => {
      if (
        state.pullRequests === prevState.pullRequests &&
        state.closedPullRequests === prevState.closedPullRequests
      ) {
        return;
      }
      const prevOpen = prevOpenIdsRef.current ?? new Set<string>();

      const settings = useSettingsStore.getState().settings;
      const onlyMine = settings.notifications.onlyMyPRs;
      const username = settings.gitHub.username.toLowerCase();

      for (const p of state.closedPullRequests) {
        const pr = p.pullRequest;
        if (!pr.mergedAt) continue;
        const k = key(pr);
        if (!prevOpen.has(k)) continue;
        if (wasRecentlyCelebrated(pr)) continue;
        if (onlyMine && pr.authorLogin.toLowerCase() !== username) continue;

        celebrateMerge({
          number: pr.number,
          title: pr.title,
          repoOwner: pr.repoOwner,
          repoName: pr.repoName,
          htmlUrl: pr.htmlUrl,
        });
      }

      prevOpenIdsRef.current = openIds(state.pullRequests);
    });

    return () => {
      unsubscribe();
    };
  }, []);
}
