import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));

import { useActivityStore } from '@/stores/activity-store';
import { useAiUsageStore } from '@/stores/ai-usage-store';
import { useDiskSpaceStore } from '@/stores/disk-space-store';
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

/** The buttons of the bar the rail ends in, by accessible name, in the order they are drawn. */
function barButtons(): string[] {
  return [...document.querySelectorAll('.bd-rail__tools button')].map(
    (button) => button.getAttribute('aria-label') ?? '',
  );
}

describe('Rail', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(null);
    usePrStore.setState({ username: '', rateLimit: null, lastPollTime: null, isPolling: false });
    usePrStore.getState().setPullRequests([pr(1), pr(2)]);
    useWorkItemsStore.setState({ workItems: [] });
    useActivityStore.setState({ counts: null });
    useAiUsageStore.setState({ accounts: [], looked: true, readings: {} });
    useDiskSpaceStore.setState({ hosts: [], error: null, cleanup: {} });
    useUiStore.setState({
      activeSection: 'focus',
      viewStack: [{ kind: 'list' }],
      railCollapsed: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the workspace name and the five sections in order', () => {
    render(<Rail />);
    expect(screen.getByText('BorgDock')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    const labels = within(nav)
      .getAllByRole('button')
      .map((b) => b.querySelector('.bd-rail__label')?.textContent);
    expect(labels).toEqual(['Focus', 'Dispatch', 'Pull requests', 'Work items', 'Notes']);
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

  describe('folded', () => {
    it('folds to icons from its button and keeps the names for screen readers and hover', () => {
      render(<Rail />);
      fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }));

      expect(useUiStore.getState().railCollapsed).toBe(true);
      expect(screen.getByRole('complementary', { name: 'Navigation' })).toHaveAttribute(
        'data-collapsed',
        'true',
      );
      expect(screen.queryByText('BorgDock')).toBeNull();
      const prs = navButton(/Pull requests/);
      expect(prs.querySelector('.bd-rail__icon')).toBeInTheDocument();
      expect(prs.querySelector('.bd-rail__label')).toHaveClass('sr-only');
      expect(prs).toHaveAttribute('title', 'Pull requests · 2 (3)');
      expect(prs.querySelector('.bd-rail__count')).toHaveClass('bd-rail__count--badge');
    });

    it('caps a badge at 99+ and keeps a failing count red', () => {
      usePrStore
        .getState()
        .setPullRequests(
          Array.from({ length: 120 }, (_, i) => pr(i + 1, i === 0 ? 'red' : 'green')),
        );
      useUiStore.setState({ railCollapsed: true });
      render(<Rail />);
      const badge = navButton(/Pull requests/).querySelector('.bd-rail__count');
      expect(badge).toHaveTextContent('99+');
      expect(badge).toHaveClass('bd-rail__count--hot');
    });

    it('expands again from its button, and remembers the choice', async () => {
      const { persistToTauriStore } = await import('@/utils/tauri-persist');
      useUiStore.setState({ railCollapsed: true });
      render(<Rail />);
      const toggle = screen.getByRole('button', { name: 'Expand navigation' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);
      expect(useUiStore.getState().railCollapsed).toBe(false);
      expect(screen.getByText('BorgDock')).toBeInTheDocument();
      expect(persistToTauriStore).toHaveBeenCalledWith('ui-state.json', 'railCollapsed', false);
    });

    it('keeps the sync state for screen readers only', () => {
      usePrStore.setState({ lastPollTime: new Date() });
      useUiStore.setState({ railCollapsed: true });
      render(<Rail />);
      expect(document.querySelector('.bd-rail__sync')).toHaveClass('sr-only');
      expect(screen.queryByText(/^Synced .* ago|^Synced just now/)).toBeNull();
    });
  });

  it('switches the section on click', () => {
    render(<Rail />);
    fireEvent.click(navButton(/Notes/));
    expect(useUiStore.getState().activeSection).toBe('notes');
    expect(navButton(/Notes/)).toHaveAttribute('aria-current', 'page');
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

  it('advertises keys 1 to 5', () => {
    render(<Rail />);
    expect(navButton(/Focus/)).toHaveAttribute('aria-keyshortcuts', '1');
    expect(navButton(/Dispatch/)).toHaveAttribute('aria-keyshortcuts', '2');
    expect(navButton(/Pull requests/)).toHaveAttribute('aria-keyshortcuts', '3');
    expect(navButton(/Notes/)).toHaveAttribute('aria-keyshortcuts', '5');
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

  describe('the foot', () => {
    it("shows GitHub's requests as a row of the limits", () => {
      usePrStore.setState({
        rateLimit: { remaining: 4837, limit: 5000, resetAt: new Date(), pool: 'graphql' },
      } as never);
      render(<Rail />);
      expect(screen.getByRole('button', { name: 'Limits left' })).toHaveTextContent('GitHub97%');
    });

    it('shows no limits block without accounts and without a rate limit', () => {
      render(<Rail />);
      expect(screen.queryByRole('button', { name: 'Limits left' })).toBeNull();
    });

    it('ends in a bar: Settings in the corner, Open window, Recent, and the fold toggle', () => {
      render(<Rail />);
      expect(barButtons()).toEqual(['Settings', 'Open window', 'Recent', 'Collapse navigation']);
    });

    it('opens Settings from the corner', () => {
      render(<Rail />);
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      expect(mocks.invoke).toHaveBeenCalledWith('open_settings_window', {});
    });

    it('opens the window menu, which leaves Settings to its own button', () => {
      render(<Rail />);
      fireEvent.click(screen.getByRole('button', { name: 'Open window' }));
      const menu = screen.getByRole('menu', { name: 'Windows' });
      const items = within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.querySelector('span')?.textContent);
      expect(items).toEqual(['Worktrees', 'Quick note', 'Work items', 'SQL', "What's new"]);

      fireEvent.click(within(menu).getByRole('menuitem', { name: /Worktrees/ }));
      expect(mocks.invoke).toHaveBeenCalledWith('open_tool_window', { tool: 'worktrees' });
    });

    it('counts what needs you on the bell', () => {
      useActivityStore.setState({
        counts: { unread: 9, needsYou: 3, byCategory: {}, bySource: {}, revision: 1 },
      });
      render(<Rail />);
      const bell = screen.getByRole('button', { name: 'Recent · 3 need you' });
      const badge = bell.querySelector('.bd-rail__count--badge');
      expect(badge).toHaveTextContent('3');
      expect(badge).toHaveClass('bd-rail__count--hot');
    });
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
