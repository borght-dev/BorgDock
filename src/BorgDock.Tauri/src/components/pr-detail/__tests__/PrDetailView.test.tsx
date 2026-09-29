import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openPrDetailMock, getCheckRunsForRef } = vi.hoisted(() => ({
  openPrDetailMock: vi.fn().mockResolvedValue(undefined),
  getCheckRunsForRef: vi.fn().mockResolvedValue([]),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('@/services/github/singleton', () => ({
  getClient: () => ({}),
  getClientForRepo: () => ({}),
}));
vi.mock('@/services/github/checks', () => ({ getCheckRunsForRef, getJobLog: vi.fn() }));
vi.mock('@/services/windows', () => ({ openPrDetail: openPrDetailMock }));
vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn().mockResolvedValue(undefined),
    resolveConflicts: vi.fn(),
    monitorPr: vi.fn(),
    getMonitorPrompt: vi.fn(),
    getFixPrompt: vi.fn(),
  }),
}));
// The tabs have their own tests; here they only need to say which one shows.
vi.mock('../OverviewTab', () => ({ OverviewTab: () => <div data-testid="overview-tab" /> }));
vi.mock('../CommitsTab', () => ({ CommitsTab: () => <div data-testid="commits-tab" /> }));
vi.mock('../FilesTab', () => ({ FilesTab: () => <div data-testid="files-tab" /> }));
vi.mock('../DiscussionTab', () => ({ DiscussionTab: () => <div data-testid="discussion-tab" /> }));
vi.mock('../ChecksTab', () => ({
  ChecksTab: ({ grouped }: { grouped?: boolean }) => (
    <div data-testid="checks-tab" data-grouped={grouped ? 'true' : 'false'} />
  ),
}));
// The list under the detail view: one selected Workbench row, like PrRowCore.
vi.mock('@/components/layout/SectionView', () => ({
  SectionView: () => (
    <div className="bd-wb-row" data-pr-key="acme/app#7" data-selected="true">
      <span className="bd-wb-row__title">Add the thing</span>
    </div>
  ),
}));

import { ViewStack } from '@/components/layout/ViewStack';
import { popView, showPr } from '@/services/navigation';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';

const PR: PullRequestWithChecks = {
  pullRequest: {
    number: 7,
    title: 'Add the thing',
    headRef: 'feat/thing',
    headSha: 'sha1',
    baseRef: 'main',
    authorLogin: 'mira',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2026-09-20T10:00:00Z',
    updatedAt: '2026-09-24T10:00:00Z',
    isDraft: false,
    mergeable: true,
    htmlUrl: 'https://github.com/acme/app/pull/7',
    body: '',
    repoOwner: 'acme',
    repoName: 'app',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: 12,
    deletions: 3,
    changedFiles: 2,
    commitCount: 1,
    requestedReviewers: [],
  },
  overallStatus: 'red',
  failedCheckNames: ['CI / unit', 'CI / lint'],
  failedCheckSuiteIds: [4, 4],
  pendingCheckNames: [],
  passedCount: 5,
  skippedCount: 0,
  totalCheckCount: 7,
};

const TARGET = { owner: 'acme', repo: 'app', number: 7 };
const doc = document as unknown as { startViewTransition?: unknown };

function listCovered(): boolean {
  return document
    .querySelector('.bd-viewstack__list')!
    .classList.contains('bd-viewstack__list--covered');
}

const settingsBefore = useSettingsStore.getState().settings;

describe('PrDetailView', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: { ...settingsBefore, ui: { ...settingsBefore.ui } },
    });
    useUiStore.setState({
      viewStack: [{ kind: 'list' }],
      activeSection: 'prs',
      selectedPrKey: null,
      selectedPrNumber: null,
    });
    useQuickReviewStore.setState({ state: 'idle' });
    usePrStore.setState({ pullRequests: [PR], closedPullRequests: [], username: 'koen' });
    openPrDetailMock.mockClear();
  });

  afterEach(() => {
    delete doc.startViewTransition;
    useSettingsStore.setState({ settings: settingsBefore });
    usePrStore.setState({ pullRequests: [] });
  });

  it('shows the PR from the list at once: header, readiness, actions, tabs', async () => {
    render(<ViewStack />);
    await act(() => showPr(TARGET));

    expect(screen.getByRole('heading', { level: 1, name: 'Add the thing' })).toBeInTheDocument();
    expect(screen.getByText('acme/app')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Not ready: 2 checks failing');
    expect(screen.getByRole('button', { name: 'Rerun failed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fix with Claude' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d.*$/, ''))).toEqual([
      'Overview',
      'Checks',
      'Files',
      'Commits',
      'Discussion',
    ]);
    // Reading font root, no pop-out chrome.
    expect(document.querySelector('.bd-detail')).toBeInTheDocument();
    expect(document.querySelector('[data-pr-detail-panel-close]')).not.toBeInTheDocument();
    await waitFor(() => expect(getCheckRunsForRef).toHaveBeenCalled());
  });

  it('honours the initial tab and groups the Checks tab', async () => {
    render(<ViewStack />);
    await act(() => showPr({ ...TARGET, tab: 'checks' }));
    expect(screen.getByRole('tab', { name: /Checks/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('checks-tab')).toHaveAttribute('data-grouped', 'true');
  });

  it('switches tabs with J and K', async () => {
    render(<ViewStack />);
    await act(() => showPr(TARGET));
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByRole('tab', { name: /Checks/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByRole('tab', { name: /Files/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('Back pops to the list', async () => {
    render(<ViewStack />);
    await act(() => showPr(TARGET));
    expect(useUiStore.getState().viewStack).toHaveLength(2);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    });
    await waitFor(() => expect(useUiStore.getState().viewStack).toHaveLength(1));
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(useUiStore.getState().selectedPrKey).toBe('acme/app#7');
  });

  it('Esc pops too', async () => {
    render(<ViewStack />);
    await act(() => showPr(TARGET));
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => expect(useUiStore.getState().viewStack).toHaveLength(1));
  });

  it('"Open in window" opens the pop-out and returns to the list', async () => {
    render(<ViewStack />);
    await act(() => showPr(TARGET));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open in window' }));
    });
    expect(openPrDetailMock).toHaveBeenCalledWith(TARGET);
    await waitFor(() => expect(useUiStore.getState().viewStack).toHaveLength(1));
  });

  it('covers the list inside the push transition and uncovers it inside the pop', async () => {
    // Record, for every transition, whether the list is covered before the
    // update (old snapshot) and after it (new snapshot).
    const snapshots: { oldCovered: boolean; nextCovered: boolean }[] = [];
    doc.startViewTransition = vi.fn((cb: () => void) => {
      const oldCovered = listCovered();
      cb();
      snapshots.push({ oldCovered, nextCovered: listCovered() });
      return { updateCallbackDone: Promise.resolve(), finished: Promise.resolve() };
    });

    render(<ViewStack />);
    await act(() => showPr(TARGET));
    await act(() => popView());

    expect(snapshots).toEqual([
      { oldCovered: false, nextCovered: true },
      { oldCovered: true, nextCovered: false },
    ]);
    // The row opened keeps its selection on the way back.
    expect(document.querySelector('.bd-wb-row')).toHaveAttribute('data-selected', 'true');
  });
});
