import { beforeEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from '@/stores/notification-store';
import { usePrStore } from '@/stores/pr-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { DESIGN_PRS, DESIGN_WORK_ITEMS } from '../../../tests/e2e/fixtures/design-fixtures';
import { installTestSeed } from '../test-seed';

/**
 * Test-seed hook contract:
 *
 * - `installTestSeed({ isDev: true })` attaches `window.__borgdock_test_seed`
 *   and `window.__borgdock_test_toast`.
 * - `installTestSeed({ isDev: false })` attaches nothing.
 * - The seed pushes fixtures directly into the real Zustand stores so
 *   Playwright can exercise the production rendering pipeline without IPC.
 *
 * Assertions use the stores' real field names — `pullRequests` (not `prs`)
 * on the pr-store, `workItems` on the work-items-store, and the notification
 * store's existing `show` action via `__borgdock_test_toast`.
 */

describe('installTestSeed', () => {
  beforeEach(() => {
    // Reset pr-store data slice + derived cache flags used by selectors.
    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [],
      filter: 'all',
      searchQuery: '',
      sortBy: 'updated',
      username: '',
      isPolling: false,
      lastPollTime: null,
      rateLimit: null,
      reviewRequestTimestamps: {},
      _cacheKey: '',
      _cachedPriorityScores: null,
      _cachedTeamReviewLoad: null,
      _cachedCounts: null,
      _viewCacheKey: '',
      _cachedFilteredPrs: null,
      _cachedGroupedByRepo: null,
      _cachedNeedsMyReview: null,
      _cachedFocusPrs: null,
    });

    // Reset work-items-store to an empty slice.
    useWorkItemsStore.setState({
      workItems: [],
    });

    // Reset the notification store so toast assertions aren't polluted.
    useNotificationStore.setState({
      active: [],
      queue: [],
      activeNotification: null,
      notifications: [],
    });

    // Clean up any hooks attached by a previous test.
    delete (window as { __borgdock_test_seed?: unknown }).__borgdock_test_seed;
    delete (window as { __borgdock_test_toast?: unknown }).__borgdock_test_toast;
  });

  it('attaches a global function when called in dev', () => {
    installTestSeed({ isDev: true });
    expect(typeof window.__borgdock_test_seed).toBe('function');
  });

  it('does nothing in non-dev', () => {
    installTestSeed({ isDev: false });
    expect(window.__borgdock_test_seed).toBeUndefined();
    expect(window.__borgdock_test_toast).toBeUndefined();
  });

  it('seeds PRs into the pr-store', () => {
    installTestSeed({ isDev: true });
    window.__borgdock_test_seed?.({ prs: DESIGN_PRS });

    const state = usePrStore.getState();
    expect(state.pullRequests).toHaveLength(DESIGN_PRS.length);
    expect(state.pullRequests[0]!.pullRequest.number).toBe(DESIGN_PRS[0]!.pullRequest.number);
  });

  it('seeds work items into the work-items-store', () => {
    installTestSeed({ isDev: true });
    window.__borgdock_test_seed?.({ workItems: DESIGN_WORK_ITEMS });

    const state = useWorkItemsStore.getState();
    expect(state.workItems).toHaveLength(DESIGN_WORK_ITEMS.length);
    expect(state.workItems[0]!.id).toBe(DESIGN_WORK_ITEMS[0]!.id);
  });

  it('accepts partial payloads without touching unrelated stores', () => {
    installTestSeed({ isDev: true });
    window.__borgdock_test_seed?.({ prs: DESIGN_PRS.slice(0, 2) });

    expect(usePrStore.getState().pullRequests).toHaveLength(2);
    expect(useWorkItemsStore.getState().workItems).toHaveLength(0);
  });

  it('exposes __borgdock_test_toast in dev', () => {
    installTestSeed({ isDev: true });
    expect(typeof window.__borgdock_test_toast).toBe('function');

    window.__borgdock_test_toast?.({
      kind: 'success',
      title: 'Saved',
      message: 'Settings updated',
    });

    const notifState = useNotificationStore.getState();
    expect(notifState.active).toHaveLength(1);
    expect(notifState.active[0]!.notification.title).toBe('Saved');
    expect(notifState.active[0]!.notification.severity).toBe('success');
  });
});
