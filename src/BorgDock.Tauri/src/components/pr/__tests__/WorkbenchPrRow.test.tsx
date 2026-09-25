import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { showPrMock, openPrDetailMock, mergeMock } = vi.hoisted(() => ({
  showPrMock: vi.fn().mockResolvedValue(undefined),
  openPrDetailMock: vi.fn().mockResolvedValue(undefined),
  mergeMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText: vi.fn() }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@/services/github/singleton', () => ({
  getClient: vi.fn(() => null),
  getClientForRepo: vi.fn(() => null),
}));
vi.mock('@/hooks/useClaudeActions', () => ({
  useClaudeActions: () => ({
    fixWithClaude: vi.fn(),
    monitorPr: vi.fn(),
    resolveConflicts: vi.fn(),
    getMonitorPrompt: vi.fn(),
    getFixPrompt: vi.fn(),
  }),
}));
vi.mock('@/services/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/navigation')>()),
  showPr: showPrMock,
}));
vi.mock('@/services/pr-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/pr-actions')>()),
  mergePrWithToast: mergeMock,
}));
vi.mock('@/services/windows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/windows')>()),
  openPrDetail: openPrDetailMock,
}));

import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { FIXTURE_ME, listPr } from '../__fixtures__/pr-list-data';
import { rowActionFor, WorkbenchPrRow } from '../WorkbenchPrRow';

const PR = listPr({ number: 42, title: 'Add cool feature', repo: 'acme/app' });
/** Same number, other repository. */
const TWIN = listPr({ number: 42, title: 'Site change', repo: 'acme/site' });
const DETAIL = { owner: 'acme', repo: 'app', number: 42 };
const POP_OUT = { owner: 'acme', repo: 'app', number: 42 };

function row(key = 'acme/app#42') {
  return document.querySelector<HTMLElement>(`.bd-wb-row[data-pr-key="${key}"]`)!;
}

describe('WorkbenchPrRow', () => {
  beforeEach(() => {
    showPrMock.mockClear();
    openPrDetailMock.mockClear();
    useUiStore.setState({ selectedPrNumber: null, selectedPrKey: null });
    render(
      <>
        <WorkbenchPrRow prWithChecks={PR} />
        <WorkbenchPrRow prWithChecks={TWIN} />
      </>,
    );
  });

  afterEach(cleanup);

  it('selects and opens the PR (showPr) on click, at once', () => {
    fireEvent.click(row());
    expect(useUiStore.getState().selectedPrKey).toBe('acme/app#42');
    // The tab layout still reads the number.
    expect(useUiStore.getState().selectedPrNumber).toBe(42);
    expect(row()).toHaveAttribute('data-selected', 'true');
    expect(showPrMock).toHaveBeenCalledTimes(1);
    expect(showPrMock).toHaveBeenCalledWith(DETAIL);
    expect(openPrDetailMock).not.toHaveBeenCalled();
  });

  it('selects by owner/repo#number, so a same-numbered PR elsewhere stays unselected', () => {
    fireEvent.click(row());
    expect(row('acme/site#42')).not.toHaveAttribute('data-selected');
    fireEvent.click(row('acme/site#42'));
    expect(row('acme/site#42')).toHaveAttribute('data-selected', 'true');
    expect(row()).not.toHaveAttribute('data-selected');
  });

  it('opens the PR on Enter and Space from the focused row', () => {
    fireEvent.keyDown(row(), { key: 'Enter' });
    fireEvent.keyDown(row(), { key: ' ' });
    expect(showPrMock).toHaveBeenCalledTimes(2);
    expect(showPrMock).toHaveBeenCalledWith(DETAIL);
  });

  it('opens the pop-out on Ctrl+click and Cmd+click, and selects the row', () => {
    fireEvent.click(row(), { ctrlKey: true });
    fireEvent.click(row(), { metaKey: true });
    expect(openPrDetailMock).toHaveBeenCalledTimes(2);
    expect(openPrDetailMock).toHaveBeenCalledWith(POP_OUT);
    expect(showPrMock).not.toHaveBeenCalled();
    expect(row()).toHaveAttribute('data-selected', 'true');
  });

  it('opens the pop-out on Ctrl+Enter from the focused row', () => {
    fireEvent.keyDown(row(), { key: 'Enter', ctrlKey: true });
    expect(openPrDetailMock).toHaveBeenCalledWith(POP_OUT);
    expect(showPrMock).not.toHaveBeenCalled();
  });

  it('opens the pop-out on middle-click', () => {
    fireEvent(row(), new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(openPrDetailMock).toHaveBeenCalledWith(POP_OUT);
    expect(showPrMock).not.toHaveBeenCalled();
  });

  it('ignores other auxiliary buttons', () => {
    fireEvent(row(), new MouseEvent('auxclick', { bubbles: true, button: 3 }));
    expect(openPrDetailMock).not.toHaveBeenCalled();
  });

  it('labels the row with its title and number', () => {
    expect(row()).toHaveAccessibleName('Add cool feature, #42');
  });

  it('opens the context menu on right-click, with "Open in window" in the Workbench layout', () => {
    const settings = useSettingsStore.getState().settings;
    act(() => {
      useSettingsStore.setState({
        settings: { ...settings, ui: { ...settings.ui, layoutV3: true } },
      });
    });
    fireEvent.contextMenu(row(), { clientX: 10, clientY: 10 });
    const item = screen.getByRole('menuitem', { name: 'Open in window' });
    fireEvent.click(item);
    expect(openPrDetailMock).toHaveBeenCalledWith(POP_OUT);
    act(() => {
      useSettingsStore.setState({ settings });
    });
  });
});

describe('WorkbenchPrRow action slot', () => {
  /** A review is requested from me. */
  const REVIEW = listPr({
    number: 7,
    title: 'Needs my eyes',
    repo: 'acme/app',
    author: 'mira',
    requestedReviewers: [FIXTURE_ME],
  });
  /** Approved, green, mergeable. */
  const MERGE = listPr({
    number: 8,
    title: 'Ready to go',
    repo: 'acme/app',
    reviewStatus: 'approved',
  });

  beforeEach(() => {
    showPrMock.mockClear();
    mergeMock.mockReset();
    usePrStore.setState({ username: FIXTURE_ME, teams: [] });
    useQuickReviewStore.getState().endSession();
  });
  afterEach(() => {
    cleanup();
    useQuickReviewStore.getState().endSession();
  });

  const slot = (key: string) =>
    document.querySelector(`.bd-wb-row[data-pr-key="${key}"] .bd-row-action`);

  it.each([
    ['a review requested from me', REVIEW, 'review'],
    ['an approved, green PR', MERGE, 'merge'],
    [
      'an approved, green PR still waiting on my review (review first)',
      listPr({
        number: 5,
        title: 'x',
        repo: 'a/b',
        author: 'mira',
        reviewStatus: 'approved',
        requestedReviewers: [FIXTURE_ME],
      }),
      'review',
    ],
    [
      'a failing PR (rerun)',
      listPr({ number: 1, title: 'x', repo: 'a/b', checks: { total: 3, fail: 1 } }),
      null,
    ],
    ['my PR waiting on review (checkout)', listPr({ number: 2, title: 'x', repo: 'a/b' }), null],
    [
      'a PR by someone else (open)',
      listPr({ number: 3, title: 'x', repo: 'a/b', author: 'sasha' }),
      null,
    ],
    [
      'a merged PR',
      listPr({ number: 4, title: 'x', repo: 'a/b', reviewStatus: 'approved', mergedHoursAgo: 1 }),
      null,
    ],
  ] as const)('%s gets %s', (_label, pr, expected) => {
    expect(rowActionFor(pr, FIXTURE_ME)).toBe(expected);
    render(<WorkbenchPrRow prWithChecks={pr} />);
    const key = `${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}#${pr.pullRequest.number}`;
    if (expected)
      expect(slot(key)?.querySelector(`[data-row-action="${expected}"]`)).not.toBeNull();
    else expect(slot(key)).toBeNull();
  });

  it('puts the slot beside the row, never inside its role="button"', () => {
    render(<WorkbenchPrRow prWithChecks={REVIEW} />);
    const button = screen.getByRole('button', { name: 'Review #7' });
    expect(button.closest('[role="button"]')).toBeNull();
    const wrap = button.closest('.bd-wb-rowwrap');
    expect(wrap).toHaveAttribute('data-key', 'acme/app#7');
    expect(wrap?.querySelector('.bd-wb-row')).not.toHaveAttribute('data-key');
    // Tab order: the row, then its action.
    const tabbables = [...wrap!.querySelectorAll<HTMLElement>('[tabindex="0"], button')];
    expect(tabbables.map((el) => el.className.split(' ')[0])).toEqual(['bd-wb-row', 'bd-btn']);
  });

  it('keeps the wrapper when a PR has no action, so the row does not remount', () => {
    const own = listPr({ number: 2, title: 'x', repo: 'a/b' });
    render(<WorkbenchPrRow prWithChecks={own} />);
    expect(document.querySelector('.bd-wb-rowwrap')).not.toBeNull();
    expect(document.querySelector('.bd-row-action')).toBeNull();
  });

  it('Review opens Quick Review for the PR without opening the row', () => {
    render(<WorkbenchPrRow prWithChecks={REVIEW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review #7' }));
    expect(useQuickReviewStore.getState().state).toBe('reviewing');
    expect(useQuickReviewStore.getState().queue).toEqual([REVIEW]);
    expect(showPrMock).not.toHaveBeenCalled();
  });

  it('Enter on the slot button does not open the row', () => {
    render(<WorkbenchPrRow prWithChecks={REVIEW} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Review #7' }), { key: 'Enter' });
    expect(showPrMock).not.toHaveBeenCalled();
  });

  it('Merge fills while it runs, then reads Merged', async () => {
    let resolve: (ok: boolean) => void = () => {};
    mergeMock.mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    render(<WorkbenchPrRow prWithChecks={MERGE} />);
    const button = screen.getByRole('button', { name: 'Merge' });
    fireEvent.click(button);
    expect(mergeMock).toHaveBeenCalledWith({
      repoOwner: 'acme',
      repoName: 'app',
      number: 8,
      title: 'Ready to go',
      htmlUrl: 'https://github.com/acme/app/pull/8',
    });
    expect(button).toHaveAttribute('data-progress', 'busy');
    expect(button).toHaveTextContent('Merging');
    expect(showPrMock).not.toHaveBeenCalled();
    await act(async () => resolve(true));
    expect(button).toHaveAttribute('data-progress', 'done');
    expect(button).toHaveTextContent('Merged');
  });

  it('a failed merge goes back to rest', async () => {
    mergeMock.mockResolvedValue(false);
    render(<WorkbenchPrRow prWithChecks={MERGE} />);
    const button = screen.getByRole('button', { name: 'Merge' });
    await act(async () => fireEvent.click(button));
    expect(button).toHaveAttribute('data-progress', 'idle');
    expect(button).toHaveTextContent('Merge');
  });
});
