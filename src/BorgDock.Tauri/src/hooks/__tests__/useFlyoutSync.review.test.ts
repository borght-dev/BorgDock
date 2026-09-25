import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, mainWindow, startSinglePr, openUrl } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  mainWindow: {
    unminimize: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
  },
  startSinglePr: vi.fn(),
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => mainWindow }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }));

import { listPr } from '@/components/pr/__fixtures__/pr-list-data';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import type { PullRequestWithChecks } from '@/types';
import {
  buildFlyoutPayload,
  type FlyoutPrActionPayload,
  handleFlyoutPrAction,
} from '../useFlyoutSync';

const pr = {
  pullRequest: {
    number: 42,
    repoOwner: 'acme',
    repoName: 'app',
    title: 'Review me',
    htmlUrl: 'https://github.com/acme/app/pull/42',
    headRef: 'feat/x',
    authorLogin: 'mira',
    labels: [],
  },
  overallStatus: 'green',
  failedCheckNames: [],
  pendingCheckNames: [],
  passedCount: 1,
  skippedCount: 0,
  totalCheckCount: 1,
} as unknown as PullRequestWithChecks;

function action(name: FlyoutPrActionPayload['action']): FlyoutPrActionPayload {
  return { repoOwner: 'acme', repoName: 'app', number: 42, action: name, failedCheckNames: [] };
}

const realStartSinglePr = useQuickReviewStore.getState().startSinglePr;

describe('the flyout Review action in the main window (flyout-pr-action)', () => {
  beforeEach(() => {
    for (const fn of [...Object.values(mainWindow), startSinglePr, openUrl, invoke]) fn.mockClear();
    useQuickReviewStore.setState({ startSinglePr });
    usePrStore.setState({ pullRequests: [pr] });
  });

  afterEach(() => {
    useQuickReviewStore.setState({ startSinglePr: realStartSinglePr });
    usePrStore.setState({ pullRequests: [] });
  });

  it('brings the main window forward and opens Quick Review for the PR', async () => {
    await handleFlyoutPrAction(action('review'));
    expect(mainWindow.unminimize).toHaveBeenCalled();
    expect(mainWindow.show).toHaveBeenCalled();
    expect(mainWindow.setFocus).toHaveBeenCalled();
    expect(startSinglePr).toHaveBeenCalledWith(pr);
    // Shown and focused, never toggled: show_or_focus_main hides a focused window.
    expect(invoke).not.toHaveBeenCalledWith('show_or_focus_main');
    // Review no longer opens the browser.
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('focuses the window before Quick Review opens', async () => {
    const order: string[] = [];
    mainWindow.setFocus.mockImplementationOnce(async () => {
      order.push('focus');
    });
    startSinglePr.mockImplementationOnce(() => order.push('review'));
    await handleFlyoutPrAction(action('review'));
    expect(order).toEqual(['focus', 'review']);
  });

  it('keeps Open in GitHub on the browser', async () => {
    await handleFlyoutPrAction(action('open'));
    expect(openUrl).toHaveBeenCalledWith(pr.pullRequest.htmlUrl);
    expect(startSinglePr).not.toHaveBeenCalled();
  });

  it('ignores a PR the main window no longer lists', async () => {
    usePrStore.setState({ pullRequests: [] });
    await handleFlyoutPrAction(action('review'));
    expect(startSinglePr).not.toHaveBeenCalled();
    expect(mainWindow.show).not.toHaveBeenCalled();
  });
});

describe('buildFlyoutPayload primaryAction', () => {
  const ME = 'koen';
  const NOW = Date.parse('2026-09-25T10:00:00Z');

  function primaryOf(prs: PullRequestWithChecks[], teams: string[] = []) {
    return buildFlyoutPayload(prs, ME, 'dark', 'Ctrl+G', null, 0, false, teams).pullRequests.map(
      (p) => [p.number, p.primaryAction],
    );
  }

  it('uses the main window rule: Review only when the review waits on me', () => {
    const requestedFromMe = listPr(
      { number: 1, title: 'a', repo: 'acme/app', author: 'mira', requestedReviewers: [ME] },
      NOW,
    );
    // GitHub's "pending" review state alone does not mean it waits on me.
    const pendingForOthers = listPr(
      {
        number: 2,
        title: 'b',
        repo: 'acme/app',
        author: 'mira',
        reviewStatus: 'pending',
        requestedReviewers: ['sasha'],
      },
      NOW,
    );
    const ready = listPr(
      { number: 3, title: 'c', repo: 'acme/app', author: ME, reviewStatus: 'approved' },
      NOW,
    );
    const failing = listPr(
      { number: 4, title: 'd', repo: 'acme/app', author: ME, checks: { total: 6, fail: 1 } },
      NOW,
    );
    expect(primaryOf([requestedFromMe, pendingForOthers, ready, failing])).toEqual([
      [1, 'review'],
      [2, null],
      [3, 'merge'],
      [4, null],
    ]);
  });

  it('counts a review requested from one of my teams', () => {
    const teamRequest = listPr({ number: 5, title: 'e', repo: 'acme/app', author: 'mira' }, NOW);
    teamRequest.pullRequest.requestedTeams = ['acme/web'];
    expect(primaryOf([teamRequest], ['acme/web'])).toEqual([[5, 'review']]);
    expect(primaryOf([teamRequest], [])).toEqual([[5, null]]);
  });
});
