import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { PullRequestWithChecks, WorkItem } from '@/types';
import { formatSyncedAgo, Rail } from '../Rail';

function pr(number: number, status: 'green' | 'red' | 'yellow' = 'green'): PullRequestWithChecks {
  return {
    pullRequest: {
      number,
      title: `PR ${number}`,
      headRef: `feature/${number}`,
      baseRef: 'main',
      authorLogin: 'someone',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2026-09-20T10:00:00Z',
      updatedAt: '2026-09-24T10:00:00Z',
      isDraft: false,
      htmlUrl: '',
      body: '',
      repoOwner: 'octo',
      repoName: 'app',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 1,
      deletions: 1,
      changedFiles: 1,
      commitCount: 1,
      requestedReviewers: [],
    },
    overallStatus: status,
    failedCheckNames: status === 'red' ? ['build'] : [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: status === 'green' ? 3 : 2,
    skippedCount: 0,
    totalCheckCount: 3,
  } as PullRequestWithChecks;
}

function navButton(name: RegExp) {
  return within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', {
    name,
  });
}

describe('Rail', () => {
  beforeEach(() => {
    usePrStore.setState({ username: '', rateLimit: null, lastPollTime: null, isPolling: false });
    usePrStore.getState().setPullRequests([pr(1), pr(2)]);
    useWorkItemsStore.setState({ workItems: [] });
    useUiStore.setState({ activeSection: 'focus', viewStack: [{ kind: 'list' }] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the workspace name and the four sections in order', () => {
    render(<Rail />);
    expect(screen.getByText('BorgDock')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const labels = within(nav)
      .getAllByRole('button')
      .map((b) => b.querySelector('.bd-rail__label')?.textContent);
    expect(labels).toEqual(['Focus', 'Pull requests', 'Work items', 'Worktrees']);
  });

  it('marks the active section and puts the sliding highlight behind it', () => {
    useUiStore.setState({ activeSection: 'prs' });
    render(<Rail />);
    expect(navButton(/Pull requests/)).toHaveAttribute('aria-current', 'page');
    expect(navButton(/Focus/)).not.toHaveAttribute('aria-current');
    expect(navButton(/Pull requests/)).toHaveAttribute('data-highlight-key', 'prs');
    expect(document.querySelector('.bd-slide__hl')).toBeInTheDocument();
  });

  it('shows the open PR count, not red while nothing fails', () => {
    render(<Rail />);
    const count = navButton(/Pull requests/).querySelector('.bd-rail__count');
    expect(count).toHaveTextContent('2');
    expect(count).not.toHaveClass('bd-rail__count--hot');
  });

  it('turns the PR count red when a PR is failing', () => {
    usePrStore.getState().setPullRequests([pr(1), pr(2, 'red'), pr(3)]);
    render(<Rail />);
    const count = navButton(/Pull requests/).querySelector('.bd-rail__count');
    expect(count).toHaveTextContent('3');
    expect(count).toHaveClass('bd-rail__count--hot');
  });

  it('shows the work item count only when there are work items', () => {
    const { unmount } = render(<Rail />);
    expect(navButton(/Work items/).querySelector('.bd-rail__count')).toBeNull();
    unmount();
    useWorkItemsStore.setState({ workItems: [{ id: 1 }, { id: 2 }] as unknown as WorkItem[] });
    render(<Rail />);
    expect(navButton(/Work items/).querySelector('.bd-rail__count')).toHaveTextContent('2');
  });

  it('switches the section on click', () => {
    render(<Rail />);
    fireEvent.click(navButton(/Worktrees/));
    expect(useUiStore.getState().activeSection).toBe('worktrees');
    expect(navButton(/Worktrees/)).toHaveAttribute('aria-current', 'page');
  });

  it('returns to the list when a section is picked from a detail view', () => {
    useUiStore.setState({
      viewStack: [{ kind: 'list' }, { kind: 'pr-detail', owner: 'o', repo: 'r', number: 1 }],
    });
    render(<Rail />);
    fireEvent.click(navButton(/Work items/));
    expect(useUiStore.getState().activeSection).toBe('workitems');
    expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }]);
  });

  it('advertises keys 1 to 4', () => {
    render(<Rail />);
    expect(navButton(/Focus/)).toHaveAttribute('aria-keyshortcuts', '1');
    expect(navButton(/Worktrees/)).toHaveAttribute('aria-keyshortcuts', '4');
  });

  it('shows the sync line and refreshes it every 10 seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
    usePrStore.setState({ lastPollTime: new Date('2026-09-24T11:59:48Z') });
    render(<Rail />);
    expect(screen.getByText('Synced 12 s ago')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('Synced 22 s ago')).toBeInTheDocument();
  });

  it('says so while a poll is running', () => {
    usePrStore.setState({ isPolling: true, lastPollTime: new Date() });
    render(<Rail />);
    expect(screen.getByText('Syncing…')).toBeInTheDocument();
  });

  it('shows the rate meter with requests left', () => {
    usePrStore.setState({
      rateLimit: { remaining: 4837, limit: 5000, resetAt: new Date(), pool: 'graphql' },
    });
    render(<Rail />);
    const meter = screen.getByRole('meter', { name: 'GitHub requests left' });
    expect(meter).toHaveAttribute('aria-valuenow', '4837');
    expect(meter.querySelector('.bd-rail__meter-fill')).toHaveStyle({ width: '96.74%' });
    expect(screen.getByText('4,837 of 5,000 requests left (GraphQL)')).toBeInTheDocument();
  });

  it('marks the meter low under 10 percent', () => {
    usePrStore.setState({ rateLimit: { remaining: 120, limit: 5000, resetAt: new Date() } });
    render(<Rail />);
    expect(screen.getByRole('meter')).toHaveClass('bd-rail__meter--low');
  });

  it('omits the meter when no rate limit is known', () => {
    render(<Rail />);
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });
});

describe('formatSyncedAgo', () => {
  const now = new Date('2026-09-24T12:00:00Z').getTime();
  const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000);

  it.each([
    [null, 'Not synced yet'],
    [at(2), 'Synced just now'],
    [at(12), 'Synced 12 s ago'],
    [at(59), 'Synced 59 s ago'],
    [at(60), 'Synced 1 min ago'],
    [at(3599), 'Synced 59 min ago'],
    [at(7200), 'Synced 2 h ago'],
  ])('%s → %s', (time, expected) => {
    expect(formatSyncedAgo(time, now)).toBe(expected);
  });
});
