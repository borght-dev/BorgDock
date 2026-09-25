import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mergePr, rerunChecks, fixWithClaude, sendOsNotification } = vi.hoisted(() => ({
  mergePr: vi.fn(),
  rerunChecks: vi.fn(),
  fixWithClaude: vi.fn(),
  sendOsNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/services/pr-actions', () => ({
  mergePr,
  rerunChecks,
  bypassMergePr: vi.fn(),
  closePr: vi.fn(),
  toggleDraftPr: vi.fn(),
  checkoutPrBranch: vi.fn(),
  openPrInBrowser: vi.fn(),
}));
vi.mock('@/services/notification', () => ({ sendOsNotification }));
vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude,
    resolveConflicts: vi.fn(),
    monitorPr: vi.fn(),
    getMonitorPrompt: vi.fn(),
    getFixPrompt: vi.fn(),
  }),
}));

import { PROGRESS_RESULT_MS } from '@/hooks/useProgressAction';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import { WorkbenchActionBar } from '../ActionBar';
import type { PrActions } from '../usePrActions';

function makePr(
  pr: Partial<PullRequest> = {},
  over: Partial<PullRequestWithChecks> = {},
): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 9,
      title: 'Ship it',
      headRef: 'feat/ship',
      baseRef: 'main',
      authorLogin: 'mira',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-09-20T10:00:00Z',
      updatedAt: '2026-09-24T10:00:00Z',
      isDraft: false,
      mergeable: true,
      htmlUrl: 'https://github.com/acme/app/pull/9',
      body: '',
      repoOwner: 'acme',
      repoName: 'app',
      reviewStatus: 'approved',
      commentCount: 0,
      labels: [],
      additions: 1,
      deletions: 1,
      changedFiles: 1,
      commitCount: 1,
      requestedReviewers: [],
      ...pr,
    },
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 3,
    skippedCount: 0,
    totalCheckCount: 3,
    ...over,
  };
}

const FAILING = makePr(
  { reviewStatus: 'none' },
  {
    overallStatus: 'red',
    failedCheckNames: ['CI / unit'],
    failedCheckSuiteIds: [44],
    passedCount: 2,
  },
);

function actions(): PrActions {
  return {
    onMerge: vi.fn(),
    onBypassConfirm: vi.fn(),
    onBypassExecute: vi.fn(),
    onCloseConfirm: vi.fn(),
    onCloseExecute: vi.fn(),
    onToggleDraft: vi.fn(),
    onResolveConflicts: vi.fn(),
    onOpenInBrowser: vi.fn(),
    onCopyBranch: vi.fn(),
    onCheckoutToggle: vi.fn(),
    onOpenInT3: vi.fn(),
    actionStatus: '',
    isReady: false,
    checkoutOpen: false,
    setCheckoutOpen: vi.fn(),
    confirmClose: false,
    setConfirmClose: vi.fn(),
    confirmBypass: false,
    setConfirmBypass: vi.fn(),
    repoPath: '',
    worktreeSubfolder: '.worktrees',
    favoritePaths: undefined,
    favoritesOnlyDefault: false,
    windowsTerminalProfile: undefined,
  } as unknown as PrActions;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function button(action: string) {
  return document.querySelector<HTMLButtonElement>(`[data-action-bar-action="${action}"]`)!;
}

describe('WorkbenchActionBar', () => {
  beforeEach(() => {
    usePrStore.setState({ username: 'koen', teams: [] });
    mergePr.mockReset();
    rerunChecks.mockReset();
    fixWithClaude.mockReset();
    sendOsNotification.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('orders the primary action, then Checkout, Open in T3, Open in GitHub, More', () => {
    render(<WorkbenchActionBar pr={makePr()} actions={actions()} />);
    const order = [...document.querySelectorAll('[data-action-bar-action]')].map(
      (el) => (el as HTMLElement).dataset.actionBarAction,
    );
    expect(order).toEqual(['merge', 'checkout', 't3', 'browser', 'more']);
    expect(button('merge')).toHaveClass('bd-btn--primary');
  });

  it('fills while merging, flips to "Merged", then rests', async () => {
    vi.useFakeTimers();
    const request = deferred<boolean>();
    mergePr.mockReturnValue(request.promise);
    render(<WorkbenchActionBar pr={makePr()} actions={actions()} />);

    fireEvent.click(button('merge'));
    expect(button('merge')).toHaveAttribute('data-progress', 'busy');
    expect(button('merge')).toHaveTextContent('Merging');
    expect(button('merge')).toHaveAttribute('aria-busy', 'true');
    // A second click while busy does not merge twice.
    fireEvent.click(button('merge'));
    expect(mergePr).toHaveBeenCalledTimes(1);
    expect(mergePr).toHaveBeenCalledWith(
      expect.objectContaining({ repoOwner: 'acme', repoName: 'app', number: 9 }),
    );

    await act(async () => request.resolve(true));
    expect(button('merge')).toHaveAttribute('data-progress', 'done');
    expect(button('merge')).toHaveTextContent('Merged');

    act(() => vi.advanceTimersByTime(PROGRESS_RESULT_MS));
    expect(button('merge')).toHaveAttribute('data-progress', 'idle');
    expect(button('merge')).toHaveTextContent('Merge');
  });

  it('goes back to rest when the merge fails (the service toasts)', async () => {
    mergePr.mockResolvedValue(false);
    render(<WorkbenchActionBar pr={makePr()} actions={actions()} />);
    await act(async () => {
      fireEvent.click(button('merge'));
    });
    expect(button('merge')).toHaveAttribute('data-progress', 'idle');
    expect(button('merge')).toHaveTextContent('Merge');
  });

  it('for a failing PR: Rerun failed is primary, Fix with Claude next; R and F run them', async () => {
    rerunChecks.mockResolvedValue(true);
    fixWithClaude.mockResolvedValue(undefined);
    render(<WorkbenchActionBar pr={FAILING} actions={actions()} />);
    expect(button('rerun')).toHaveClass('bd-btn--primary');
    expect(button('rerun')).toHaveTextContent('Rerun failed');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'r' });
    });
    // No check runs in the view yet: the service fetches the head commit's.
    expect(rerunChecks).toHaveBeenCalledWith({
      repoOwner: 'acme',
      repoName: 'app',
      ref: 'feat/ship',
    });
    expect(button('rerun')).toHaveTextContent('Rerun started');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'f' });
    });
    expect(fixWithClaude).toHaveBeenCalledWith(FAILING, ['CI / unit'], [], [], '');
    expect(button('fix')).toHaveTextContent('Claude is on it');
  });

  it('reruns the view’s own failed check runs when it has them', async () => {
    rerunChecks.mockResolvedValue(true);
    const runs = [
      {
        id: 1,
        name: 'CI / unit',
        status: 'completed',
        conclusion: 'failure',
        htmlUrl: 'https://github.com/acme/app/actions/runs/7/job/1',
        checkSuiteId: 44,
      },
    ];
    render(<WorkbenchActionBar pr={FAILING} actions={actions()} checks={runs} />);
    await act(async () => {
      fireEvent.click(button('rerun'));
    });
    expect(rerunChecks).toHaveBeenCalledWith({ repoOwner: 'acme', repoName: 'app', checks: runs });
  });

  it('toasts when Fix with Claude throws', async () => {
    fixWithClaude.mockRejectedValue(new Error('No worktree'));
    render(<WorkbenchActionBar pr={FAILING} actions={actions()} />);
    await act(async () => {
      fireEvent.click(button('fix'));
    });
    expect(sendOsNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Fix with Claude failed', severity: 'error' }),
    );
    expect(button('fix')).toHaveTextContent('Fix with Claude');
  });

  it('Review opens Quick Review for this PR when a review is requested from you', () => {
    const start = vi.spyOn(useQuickReviewStore.getState(), 'startSinglePr');
    const pr = makePr({ reviewStatus: 'pending', requestedReviewers: ['koen'] });
    render(<WorkbenchActionBar pr={pr} actions={actions()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(start).toHaveBeenCalledWith(pr);
    start.mockRestore();
  });

  it('keeps R and F quiet when nothing is failing', () => {
    render(<WorkbenchActionBar pr={makePr()} actions={actions()} />);
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'f' });
    expect(rerunChecks).not.toHaveBeenCalled();
    expect(fixWithClaude).not.toHaveBeenCalled();
  });
});
