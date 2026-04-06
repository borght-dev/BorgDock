import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardNav } from '../useKeyboardNav';
import type { PullRequest, PullRequestWithChecks } from '@/types';

// Mock the stores
const mockSelectPr = vi.fn();
const mockFilteredPrs = vi.fn<() => PullRequestWithChecks[]>(() => []);
const mockFocusPrs = vi.fn<() => PullRequestWithChecks[]>(() => []);
const mockNeedsMyReview = vi.fn<() => PullRequestWithChecks[]>(() => []);
const mockCollapseAllRepoGroups = vi.fn();
const mockCollapseAllPrs = vi.fn();
const mockStartSinglePr = vi.fn();
const mockStartSession = vi.fn();

let mockSelectedPrNumber: number | null = null;
let mockActiveSection = 'prs';

vi.mock('@/stores/ui-store', () => ({
  useUiStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        selectPr: mockSelectPr,
        selectedPrNumber: mockSelectedPrNumber,
      }),
    {
      getState: () => ({
        activeSection: mockActiveSection,
        collapseAllRepoGroups: mockCollapseAllRepoGroups,
        collapseAllPrs: mockCollapseAllPrs,
      }),
    },
  ),
}));

vi.mock('@/stores/pr-store', () => ({
  usePrStore: {
    getState: () => ({
      filteredPrs: mockFilteredPrs,
      focusPrs: mockFocusPrs,
      needsMyReview: mockNeedsMyReview,
    }),
  },
}));

vi.mock('@/stores/quick-review-store', () => ({
  useQuickReviewStore: {
    getState: () => ({
      startSinglePr: mockStartSinglePr,
      startSession: mockStartSession,
    }),
  },
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(),
}));

function makePr(number: number): PullRequestWithChecks {
  return {
    pullRequest: {
      number,
      title: `PR #${number}`,
      headRef: 'feature',
      baseRef: 'main',
      authorLogin: 'testuser',
      authorAvatarUrl: '',
      state: 'open',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      isDraft: false,
      htmlUrl: `https://github.com/test/repo/pull/${number}`,
      body: '',
      repoOwner: 'test',
      repoName: 'repo',
      reviewStatus: 'none',
      commentCount: 0,
      labels: [],
      additions: 10,
      deletions: 5,
      changedFiles: 2,
      commitCount: 1,
      requestedReviewers: [],
    } as PullRequest,
    checks: [],
    overallStatus: 'green',
    failedCheckNames: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
  };
}

function fireKey(key: string, options: Partial<KeyboardEvent> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...options });
  document.dispatchEvent(event);
}

describe('useKeyboardNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedPrNumber = null;
    mockActiveSection = 'prs';
    mockFilteredPrs.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a focusedIndex ref', () => {
    const { result } = renderHook(() => useKeyboardNav());
    expect(result.current.focusedIndex).toBeDefined();
    expect(result.current.focusedIndex.current).toBe(0);
  });

  it('navigates down with ArrowDown', () => {
    const prs = [makePr(1), makePr(2), makePr(3)];
    mockFilteredPrs.mockReturnValue(prs);

    const { result } = renderHook(() => useKeyboardNav());

    fireKey('ArrowDown');
    expect(mockSelectPr).toHaveBeenCalledWith(2);
    expect(result.current.focusedIndex.current).toBe(1);
  });

  it('navigates down with j key', () => {
    const prs = [makePr(1), makePr(2)];
    mockFilteredPrs.mockReturnValue(prs);

    renderHook(() => useKeyboardNav());
    fireKey('j');
    expect(mockSelectPr).toHaveBeenCalledWith(2);
  });

  it('navigates up with ArrowUp', () => {
    const prs = [makePr(1), makePr(2), makePr(3)];
    mockFilteredPrs.mockReturnValue(prs);

    const { result } = renderHook(() => useKeyboardNav());

    // Move down first
    fireKey('ArrowDown');
    fireKey('ArrowDown');
    expect(result.current.focusedIndex.current).toBe(2);

    fireKey('ArrowUp');
    expect(result.current.focusedIndex.current).toBe(1);
    expect(mockSelectPr).toHaveBeenCalledWith(2);
  });

  it('navigates up with k key', () => {
    const prs = [makePr(1), makePr(2)];
    mockFilteredPrs.mockReturnValue(prs);

    const { result } = renderHook(() => useKeyboardNav());
    fireKey('ArrowDown');
    fireKey('k');
    expect(result.current.focusedIndex.current).toBe(0);
  });

  it('does not go below the last PR', () => {
    const prs = [makePr(1), makePr(2)];
    mockFilteredPrs.mockReturnValue(prs);

    const { result } = renderHook(() => useKeyboardNav());
    fireKey('ArrowDown');
    fireKey('ArrowDown');
    fireKey('ArrowDown');
    expect(result.current.focusedIndex.current).toBe(1);
  });

  it('does not go above index 0', () => {
    const prs = [makePr(1), makePr(2)];
    mockFilteredPrs.mockReturnValue(prs);

    const { result } = renderHook(() => useKeyboardNav());
    fireKey('ArrowUp');
    expect(result.current.focusedIndex.current).toBe(0);
  });

  it('clears selection on Escape when a PR is selected', () => {
    mockSelectedPrNumber = 42;

    const prs = [makePr(1)];
    mockFilteredPrs.mockReturnValue(prs);

    // Re-render so the hook picks up the updated selectedPrNumber
    renderHook(() => useKeyboardNav());
    fireKey('Escape');
    expect(mockSelectPr).toHaveBeenCalledWith(null);
  });

  it('does nothing when no PRs exist', () => {
    mockFilteredPrs.mockReturnValue([]);

    renderHook(() => useKeyboardNav());
    fireKey('ArrowDown');
    expect(mockSelectPr).not.toHaveBeenCalled();
  });

  it('does not intercept when typing in an input', () => {
    const prs = [makePr(1), makePr(2)];
    mockFilteredPrs.mockReturnValue(prs);

    renderHook(() => useKeyboardNav());

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
    });
    Object.defineProperty(event, 'target', { value: input });
    document.dispatchEvent(event);

    expect(mockSelectPr).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does not intercept when typing in a textarea', () => {
    const prs = [makePr(1), makePr(2)];
    mockFilteredPrs.mockReturnValue(prs);

    renderHook(() => useKeyboardNav());

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    const event = new KeyboardEvent('keydown', {
      key: 'j',
      bubbles: true,
    });
    Object.defineProperty(event, 'target', { value: textarea });
    document.dispatchEvent(event);

    expect(mockSelectPr).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it('does not intercept when typing in contentEditable', () => {
    const prs = [makePr(1), makePr(2)];
    mockFilteredPrs.mockReturnValue(prs);

    renderHook(() => useKeyboardNav());

    const div = document.createElement('div');
    div.contentEditable = 'true';
    // jsdom may not implement isContentEditable, so override it
    Object.defineProperty(div, 'isContentEditable', { value: true });
    document.body.appendChild(div);

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      bubbles: true,
    });
    Object.defineProperty(event, 'target', { value: div });
    document.dispatchEvent(event);

    expect(mockSelectPr).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  it('collapses all groups and PRs on e key', () => {
    const prs = [makePr(1)];
    mockFilteredPrs.mockReturnValue(prs);

    renderHook(() => useKeyboardNav());
    fireKey('e');
    expect(mockCollapseAllRepoGroups).toHaveBeenCalled();
    expect(mockCollapseAllPrs).toHaveBeenCalled();
  });

  it('collapses all groups and PRs on E key', () => {
    const prs = [makePr(1)];
    mockFilteredPrs.mockReturnValue(prs);

    renderHook(() => useKeyboardNav());
    fireKey('E');
    expect(mockCollapseAllRepoGroups).toHaveBeenCalled();
    expect(mockCollapseAllPrs).toHaveBeenCalled();
  });

  it('dispatches refresh event on Ctrl+R', () => {
    const prs = [makePr(1)];
    mockFilteredPrs.mockReturnValue(prs);

    const listener = vi.fn();
    document.addEventListener('prdock-refresh', listener);

    renderHook(() => useKeyboardNav());
    fireKey('r', { ctrlKey: true });

    expect(listener).toHaveBeenCalled();
    document.removeEventListener('prdock-refresh', listener);
  });

  it('starts quick review for single PR on r in focus section', () => {
    mockActiveSection = 'focus';
    const pr = makePr(1);
    mockFilteredPrs.mockReturnValue([pr]);
    mockFocusPrs.mockReturnValue([pr]);

    renderHook(() => useKeyboardNav());
    fireKey('r');
    expect(mockStartSinglePr).toHaveBeenCalledWith(pr);
  });

  it('starts quick review session for all on Shift+R', () => {
    const prs = [makePr(1), makePr(2)];
    mockFilteredPrs.mockReturnValue(prs);
    mockNeedsMyReview.mockReturnValue(prs);

    renderHook(() => useKeyboardNav());
    fireKey('R', { shiftKey: true });
    expect(mockStartSession).toHaveBeenCalledWith(prs);
  });

  it('does not start review session on Shift+R when no review PRs', () => {
    const prs = [makePr(1)];
    mockFilteredPrs.mockReturnValue(prs);
    mockNeedsMyReview.mockReturnValue([]);

    renderHook(() => useKeyboardNav());
    fireKey('R', { shiftKey: true });
    expect(mockStartSession).not.toHaveBeenCalled();
  });

  it('handles Enter key without error', () => {
    const prs = [makePr(1)];
    mockFilteredPrs.mockReturnValue(prs);

    renderHook(() => useKeyboardNav());
    expect(() => fireKey('Enter')).not.toThrow();
  });

  it('calls queueMerge on m key in focus section', () => {
    mockActiveSection = 'focus';
    const pr = makePr(42);
    mockFilteredPrs.mockReturnValue([pr]);
    mockFocusPrs.mockReturnValue([pr]);

    const mockQueueMerge = vi.fn();
    (window as unknown as Record<string, unknown>).__prdockQueueMerge = mockQueueMerge;

    renderHook(() => useKeyboardNav());
    fireKey('m');

    expect(mockQueueMerge).toHaveBeenCalledWith('test', 'repo', 42);

    delete (window as unknown as Record<string, unknown>).__prdockQueueMerge;
  });

  it('does not call queueMerge on m key outside focus section', () => {
    mockActiveSection = 'prs';
    const pr = makePr(42);
    mockFilteredPrs.mockReturnValue([pr]);

    const mockQueueMerge = vi.fn();
    (window as unknown as Record<string, unknown>).__prdockQueueMerge = mockQueueMerge;

    renderHook(() => useKeyboardNav());
    fireKey('m');

    expect(mockQueueMerge).not.toHaveBeenCalled();

    delete (window as unknown as Record<string, unknown>).__prdockQueueMerge;
  });

  it('scrolls focused card into view', () => {
    const prs = [makePr(1), makePr(2)];
    mockFilteredPrs.mockReturnValue(prs);

    const card = document.createElement('div');
    card.setAttribute('data-pr-card', '');
    card.scrollIntoView = vi.fn();
    const card2 = document.createElement('div');
    card2.setAttribute('data-pr-card', '');
    card2.scrollIntoView = vi.fn();
    document.body.appendChild(card);
    document.body.appendChild(card2);

    renderHook(() => useKeyboardNav());
    fireKey('ArrowDown');

    expect(card2.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });

    document.body.removeChild(card);
    document.body.removeChild(card2);
  });

  it('removes event listener on unmount', () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useKeyboardNav());
    unmount();
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    spy.mockRestore();
  });

  it('resets focused index when PR list shrinks', () => {
    const prs = [makePr(1), makePr(2), makePr(3)];
    mockFilteredPrs.mockReturnValue(prs);

    const { result, rerender } = renderHook(() => useKeyboardNav());

    // Move to last item
    fireKey('ArrowDown');
    fireKey('ArrowDown');
    expect(result.current.focusedIndex.current).toBe(2);

    // Now shrink the list
    mockFilteredPrs.mockReturnValue([makePr(1)]);
    rerender();

    expect(result.current.focusedIndex.current).toBe(0);
  });
});
