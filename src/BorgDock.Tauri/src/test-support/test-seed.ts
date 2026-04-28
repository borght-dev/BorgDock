/**
 * Dev-only hook used by Playwright e2e tests to push deterministic
 * fixture data into the Zustand stores without going through IPC.
 *
 * Installed from `App.tsx` via `installTestSeed({ isDev: import.meta.env.DEV })`.
 * In production builds, the body is tree-shaken because `isDev` resolves to
 * the compile-time constant `false` and Vite/esbuild eliminates the dead
 * branch along with the imports it guards.
 *
 * Exposed globals:
 *   - `window.__borgdock_test_seed(payload)` — writes fixtures into the
 *     pr-store, work-items-store, and settings-store. Partial payloads
 *     only touch the stores named in the payload.
 *   - `window.__borgdock_test_toast(args)` — dispatches a toast through
 *     the real notification-store action so the motion spec exercises the
 *     same rendering path as production notifications.
 */

import { useNotificationStore } from '@/stores/notification-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { AppSettings, NotificationSeverity, PullRequestWithChecks, WorkItem } from '@/types';

export type TestSeedPayload = {
  prs?: PullRequestWithChecks[];
  workItems?: WorkItem[];
  settings?: Partial<AppSettings>;
};

export type TestSeedFn = (payload: TestSeedPayload) => void;

export type TestToastArgs = {
  kind: NotificationSeverity;
  title: string;
  message?: string;
};

export type TestToastFn = (args: TestToastArgs) => void;

/**
 * Starts a Quick Review session over the first N PRs in the pr-store.
 * Mirrors the keyboard-driven path (Shift+R / focusPrs) but without requiring
 * the seeded fixtures to set `requestedReviewers` to the test username.
 */
export type TestStartQuickReviewFn = (count?: number) => void;

declare global {
  interface Window {
    __borgdock_test_seed?: TestSeedFn;
    __borgdock_test_toast?: TestToastFn;
    __borgdock_test_start_quick_review?: TestStartQuickReviewFn;
    /**
     * Set by Playwright's `injectCompletedSetup` so the dev/test-only URL
     * deep-links (`?section=`, `?settings=open`, `?wizard=force`,
     * `?toast=test`) activate inside production-mode bundles too. Always
     * undefined in shipped builds; the Vite production bundle drops the
     * code that reads it because it's gated behind `import.meta.env.DEV`.
     */
    __PLAYWRIGHT__?: boolean;
  }
}

/**
 * Installs the `window.__borgdock_test_seed` and `window.__borgdock_test_toast`
 * hooks when `isDev` is true. In production builds this is a no-op.
 */
export function installTestSeed({ isDev }: { isDev: boolean }): void {
  if (!isDev) return;

  window.__borgdock_test_seed = (payload: TestSeedPayload) => {
    if (payload.prs) {
      // Route through the store's `setPullRequests` action so derived caches
      // (`_cacheKey`, `_cachedPriorityScores`, `_cachedFilteredPrs`, etc.)
      // are invalidated. Re-seeding within a single page lifetime would
      // otherwise serve stale view data from the previous seed.
      usePrStore.getState().setPullRequests(payload.prs);
    }
    if (payload.workItems) {
      useWorkItemsStore.setState({ workItems: payload.workItems });
    }
    if (payload.settings) {
      // Use the store's deep-merge action so nested slices (ui, gitHub, etc.)
      // keep their defaults when only a subset is supplied.
      useSettingsStore.getState().updateSettings(payload.settings);
    }
  };

  // External param is `kind` to keep the test-API surface stable; maps 1:1
  // to the notification store's `severity` field.
  window.__borgdock_test_toast = (args: TestToastArgs) => {
    useNotificationStore.getState().show({
      title: args.title,
      message: args.message ?? '',
      severity: args.kind,
      actions: [],
    });
  };

  window.__borgdock_test_start_quick_review = (count = 3) => {
    const all = usePrStore.getState().pullRequests;
    if (all.length === 0) return;
    useQuickReviewStore.getState().startSession(all.slice(0, Math.max(2, count)));
  };
}
