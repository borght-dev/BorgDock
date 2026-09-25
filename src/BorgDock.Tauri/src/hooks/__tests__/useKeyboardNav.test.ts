import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import { useKeyboardNav } from '../useKeyboardNav';

// Mock the stores
const mockSelectPr = vi.fn();
const mockNeedsMyReview = vi.fn<() => PullRequestWithChecks[]>(() => []);
const mockCollapseAllRepoGroups = vi.fn();
const mockStartSinglePr = vi.fn();
const mockStartSession = vi.fn();
const mockSetActiveSection = vi.fn();

const mockShowSection = vi.fn((_section: string) => Promise.resolve());
const mockPushView = vi.fn((_view: unknown) => Promise.resolve());
const mockShowPr = vi.fn((_target: unknown) => Promise.resolve());
const mockOpenPrDetail = vi.fn((_target: unknown) => Promise.resolve());
const mockSelectPrKey = vi.fn();
const mockShowWorkItem = vi.fn((_id: number) => Promise.resolve());
const mockSetWorkItemsSelectedId = vi.fn();
let mockOverlayOpen = false;

let mockSelectedPrNumber: number | null = null;
let mockActiveSection = 'prs';
let mockViewStack: { kind: string }[] = [{ kind: 'list' }];
let mockPullRequests: PullRequestWithChecks[] = [];

vi.mock('@/stores/ui-store', () => ({
  SECTION_ORDER: ['focus', 'prs', 'workitems', 'worktrees'],
  useUiStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        selectPr: mockSelectPr,
        selectedPrNumber: mockSelectedPrNumber,
      }),
    {
      getState: () => ({
        selectedPrNumber: mockSelectedPrNumber,
        selectedPrKey: mockSelectedPrNumber === null ? null : `test/repo#${mockSelectedPrNumber}`,
        activeSection: mockActiveSection,
        viewStack: mockViewStack,
        collapseAllRepoGroups: mockCollapseAllRepoGroups,
        setActiveSection: mockSetActiveSection,
        selectPr: mockSelectPr,
        selectPrKey: mockSelectPrKey,
        setWorkItemsSelectedId: mockSetWorkItemsSelectedId,
      }),
    },
  ),
}));

vi.mock('@/stores/pr-store', () => ({
  usePrStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        pullRequests: [],
        filter: '',
      }),
    {
      getState: () => ({
        pullRequests: mockPullRequests,
        needsMyReview: mockNeedsMyReview,
      }),
    },
  ),
}));

vi.mock('@/stores/quick-review-store', () => ({
  useQuickReviewStore: {
    getState: () => ({
      startSinglePr: mockStartSinglePr,
      startSession: mockStartSession,
    }),
  },
}));

vi.mock('@/services/navigation', () => ({
  showSection: (section: string) => mockShowSection(section),
  pushView: (view: unknown) => mockPushView(view),
  showPr: (target: unknown) => mockShowPr(target),
  showWorkItem: (id: number) => mockShowWorkItem(id),
  isOverlayOpen: () => mockOverlayOpen,
}));

vi.mock('@/services/windows', () => ({
  openPrDetail: (target: unknown) => mockOpenPrDetail(target),
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
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
    totalCheckCount: 1,
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
    mockViewStack = [{ kind: 'list' }];
    mockOverlayOpen = false;
    mockPullRequests = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /** A selected PR row on screen for `pr`, as `PrRow` draws it. */
  function mountSelectedRow(pr: PullRequestWithChecks) {
    const row = document.createElement('div');
    row.className = 'bd-wb-row';
    row.dataset.prKey = `test/repo#${pr.pullRequest.number}`;
    row.dataset.prNumber = String(pr.pullRequest.number);
    row.dataset.selected = 'true';
    document.body.appendChild(row);
  }

  it('clears the selection on Escape when a PR is selected', () => {
    mockSelectedPrNumber = 42;
    renderHook(() => useKeyboardNav());
    fireKey('Escape');
    expect(mockSelectPr).toHaveBeenCalledWith(null);
  });

  it('leaves Escape alone when nothing is selected', () => {
    renderHook(() => useKeyboardNav());
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(mockSelectPr).not.toHaveBeenCalled();
  });

  it('does nothing on J/K when no rows are on screen', () => {
    renderHook(() => useKeyboardNav());
    fireKey('ArrowDown');
    fireKey('j');
    expect(mockSelectPr).not.toHaveBeenCalled();
    expect(mockSelectPrKey).not.toHaveBeenCalled();
  });

  it.each([
    ['an input', () => document.createElement('input')],
    ['a textarea', () => document.createElement('textarea')],
    [
      'contentEditable',
      () => {
        const div = document.createElement('div');
        div.contentEditable = 'true';
        // jsdom may not implement isContentEditable, so override it
        Object.defineProperty(div, 'isContentEditable', { value: true });
        return div;
      },
    ],
  ])('does not intercept when typing in %s', (_name, make) => {
    const row = document.createElement('div');
    row.className = 'bd-wb-row';
    row.dataset.prKey = 'test/repo#1';
    row.dataset.prNumber = '1';
    document.body.appendChild(row);
    renderHook(() => useKeyboardNav());
    const field = make();
    document.body.appendChild(field);
    for (const key of ['j', 'k', 'ArrowDown', '2', 'r']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true });
      Object.defineProperty(event, 'target', { value: field });
      document.dispatchEvent(event);
    }
    expect(mockSelectPrKey).not.toHaveBeenCalled();
    expect(mockShowSection).not.toHaveBeenCalled();
  });

  it.each(['e', 'E'])('collapses every group on screen on %s', (key) => {
    for (const groupKey of ['needs-you', 'acme/app']) {
      const group = document.createElement('section');
      group.dataset.groupKey = groupKey;
      document.body.appendChild(group);
    }
    const hidden = document.createElement('div');
    hidden.setAttribute('inert', '');
    const covered = document.createElement('section');
    covered.dataset.groupKey = 'covered';
    hidden.appendChild(covered);
    document.body.appendChild(hidden);
    renderHook(() => useKeyboardNav());
    fireKey(key);
    expect(mockCollapseAllRepoGroups).toHaveBeenCalledWith(['needs-you', 'acme/app']);
  });

  it('dispatches refresh event on Ctrl+R', () => {
    const listener = vi.fn();
    document.addEventListener('borgdock-refresh', listener);
    renderHook(() => useKeyboardNav());
    fireKey('r', { ctrlKey: true });
    expect(listener).toHaveBeenCalled();
    document.removeEventListener('borgdock-refresh', listener);
  });

  it('starts quick review session for all on Shift+R', () => {
    const prs = [makePr(1), makePr(2)];
    mockNeedsMyReview.mockReturnValue(prs);
    renderHook(() => useKeyboardNav());
    fireKey('R', { shiftKey: true });
    expect(mockStartSession).toHaveBeenCalledWith(prs);
  });

  it('does not start review session on Shift+R when no review PRs', () => {
    mockNeedsMyReview.mockReturnValue([]);
    renderHook(() => useKeyboardNav());
    fireKey('R', { shiftKey: true });
    expect(mockStartSession).not.toHaveBeenCalled();
  });

  it('M in Focus queues the merge of the selected ready PR', () => {
    mockActiveSection = 'focus';
    const base = makePr(42);
    const pr = { ...base, pullRequest: { ...base.pullRequest, reviewStatus: 'approved' as const } };
    mockPullRequests = [pr];
    mountSelectedRow(pr);
    const queueMerge = vi.fn();
    (window as unknown as Record<string, unknown>).__borgdockQueueMerge = queueMerge;
    renderHook(() => useKeyboardNav());
    fireKey('m');
    delete (window as unknown as Record<string, unknown>).__borgdockQueueMerge;
    expect(queueMerge).toHaveBeenCalledWith('test', 'repo', 42);
  });

  it('M in Focus leaves a PR that is not ready alone', () => {
    mockActiveSection = 'focus';
    const pr = makePr(42);
    mockPullRequests = [pr];
    mountSelectedRow(pr);
    const queueMerge = vi.fn();
    (window as unknown as Record<string, unknown>).__borgdockQueueMerge = queueMerge;
    renderHook(() => useKeyboardNav());
    fireKey('m');
    delete (window as unknown as Record<string, unknown>).__borgdockQueueMerge;
    expect(queueMerge).not.toHaveBeenCalled();
  });

  it('does not call queueMerge on m key outside focus section', () => {
    mockActiveSection = 'prs';
    const pr = makePr(42);
    mockPullRequests = [pr];
    mountSelectedRow(pr);
    const queueMerge = vi.fn();
    (window as unknown as Record<string, unknown>).__borgdockQueueMerge = queueMerge;
    renderHook(() => useKeyboardNav());
    fireKey('m');
    delete (window as unknown as Record<string, unknown>).__borgdockQueueMerge;
    expect(queueMerge).not.toHaveBeenCalled();
  });

  it('removes event listener on unmount', () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useKeyboardNav());
    unmount();
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    spy.mockRestore();
  });

  describe('search shortcut', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    function mountSearch(value = ''): HTMLInputElement {
      const input = document.createElement('input');
      input.setAttribute('data-section-search', '');
      input.value = value;
      document.body.appendChild(input);
      return input;
    }

    it.each([
      ['k', { ctrlKey: true }],
      ['f', { ctrlKey: true }],
      ['k', { metaKey: true }],
      ['f', { metaKey: true }],
    ])('%s with %o focuses and selects the section search', (key, modifiers) => {
      const input = mountSearch('abc');
      renderHook(() => useKeyboardNav());

      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(3);
    });

    it('works while another input has focus', () => {
      const search = mountSearch();
      const other = document.createElement('textarea');
      document.body.appendChild(other);
      other.focus();
      renderHook(() => useKeyboardNav());

      other.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));

      expect(document.activeElement).toBe(search);
    });

    it('switches to the PR tab when the active section has no search', () => {
      renderHook(() => useKeyboardNav());
      fireKey('k', { ctrlKey: true });
      expect(mockSetActiveSection).toHaveBeenCalledWith('prs');
    });

    it('ignores the plain letter', () => {
      const input = mountSearch();
      renderHook(() => useKeyboardNav());
      fireKey('f');
      expect(document.activeElement).not.toBe(input);
    });
  });

  describe('rail section keys', () => {
    it.each([
      ['1', 'focus'],
      ['2', 'prs'],
      ['3', 'workitems'],
      ['4', 'worktrees'],
    ])('%s switches to %s', (key, section) => {
      renderHook(() => useKeyboardNav());
      fireKey(key);
      expect(mockShowSection).toHaveBeenCalledWith(section);
    });

    it('works with an empty PR list', () => {
      renderHook(() => useKeyboardNav());
      fireKey('2');
      expect(mockShowSection).toHaveBeenCalledWith('prs');
    });

    it('ignores keys past the last section and modified digits', () => {
      renderHook(() => useKeyboardNav());
      fireKey('5');
      fireKey('1', { ctrlKey: true });
      fireKey('1', { altKey: true });
      expect(mockShowSection).not.toHaveBeenCalled();
    });

    it('does not switch while typing in an input', () => {
      renderHook(() => useKeyboardNav());
      const input = document.createElement('input');
      document.body.appendChild(input);
      const event = new KeyboardEvent('keydown', { key: '2', bubbles: true });
      Object.defineProperty(event, 'target', { value: input });
      document.dispatchEvent(event);
      expect(mockShowSection).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });
  });

  describe('with a detail view on top of the list', () => {
    it('leaves list keys alone', () => {
      mockViewStack = [{ kind: 'list' }, { kind: 'pr-detail' }];
      mockSelectedPrNumber = 1;
      renderHook(() => useKeyboardNav());
      fireKey('ArrowDown');
      fireKey('Escape');
      fireKey('2');
      expect(mockSelectPr).not.toHaveBeenCalled();
      expect(mockShowSection).not.toHaveBeenCalled();
    });
  });

  describe('single-key guards', () => {
    it('ignores a held-down digit (key repeat)', () => {
      renderHook(() => useKeyboardNav());
      fireKey('2', { repeat: true });
      expect(mockShowSection).not.toHaveBeenCalled();
    });

    it('stands down while a menu, dialog or Quick Review is open', () => {
      mockOverlayOpen = true;
      const listener = vi.fn();
      document.addEventListener('borgdock-refresh', listener);
      renderHook(() => useKeyboardNav());
      fireKey('2');
      fireKey('r');
      document.removeEventListener('borgdock-refresh', listener);
      expect(mockShowSection).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('slash and R', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    function mountSearch(): HTMLInputElement {
      const input = document.createElement('input');
      input.setAttribute('data-section-search', '');
      document.body.appendChild(input);
      return input;
    }

    it('/ focuses the section search and is not typed into it', () => {
      const input = mountSearch();
      renderHook(() => useKeyboardNav());
      const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      expect(document.activeElement).toBe(input);
      expect(event.defaultPrevented).toBe(true);
    });

    it('plain R refreshes outside Focus', () => {
      mockActiveSection = 'prs';
      const listener = vi.fn();
      document.addEventListener('borgdock-refresh', listener);
      renderHook(() => useKeyboardNav());
      fireKey('r');
      document.removeEventListener('borgdock-refresh', listener);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('plain R in Focus still starts Quick Review instead, for the selected row', () => {
      mockActiveSection = 'focus';
      const pr = makePr(1);
      const other = makePr(2);
      mockPullRequests = [other, pr];
      const row = document.createElement('div');
      row.className = 'bd-wb-row';
      row.dataset.prKey = 'test/repo#1';
      row.dataset.selected = 'true';
      document.body.appendChild(row);
      const listener = vi.fn();
      document.addEventListener('borgdock-refresh', listener);
      renderHook(() => useKeyboardNav());
      fireKey('r');
      document.removeEventListener('borgdock-refresh', listener);
      row.remove();
      expect(listener).not.toHaveBeenCalled();
      expect(mockStartSinglePr).toHaveBeenCalledWith(pr);
    });

    it('R, M and O in Focus do nothing without a selected row', () => {
      mockActiveSection = 'focus';
      const pr = makePr(1);
      mockPullRequests = [pr];
      const queueMerge = vi.fn();
      (window as unknown as Record<string, unknown>).__borgdockQueueMerge = queueMerge;
      renderHook(() => useKeyboardNav());
      fireKey('r');
      fireKey('m');
      fireKey('m', { repeat: true });
      delete (window as unknown as Record<string, unknown>).__borgdockQueueMerge;
      expect(mockStartSinglePr).not.toHaveBeenCalled();
      expect(queueMerge).not.toHaveBeenCalled();
    });
  });

  describe('search and refresh from a detail view', () => {
    beforeEach(() => {
      mockViewStack = [{ kind: 'list' }, { kind: 'pr-detail' }];
    });
    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('Ctrl+R still refreshes, even with no PRs', () => {
      const listener = vi.fn();
      document.addEventListener('borgdock-refresh', listener);
      renderHook(() => useKeyboardNav());
      fireKey('r', { ctrlKey: true });
      document.removeEventListener('borgdock-refresh', listener);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+K goes back to the list of the current section to find its search', () => {
      mockActiveSection = 'workitems';
      renderHook(() => useKeyboardNav());
      fireKey('k', { ctrlKey: true });
      expect(mockShowSection).toHaveBeenCalledWith('workitems');
    });
  });

  describe('search in the live section only', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    function inertLayerWith(...children: HTMLElement[]) {
      const layer = document.createElement('div');
      layer.setAttribute('inert', '');
      layer.append(...children);
      document.body.appendChild(layer);
    }

    function searchInput() {
      const input = document.createElement('input');
      input.setAttribute('data-section-search', '');
      return input;
    }

    it('skips a search box inside an inert layer', () => {
      inertLayerWith(searchInput());
      const live = searchInput();
      document.body.appendChild(live);

      renderHook(() => useKeyboardNav());
      fireKey('k', { ctrlKey: true });
      expect(document.activeElement).toBe(live);
    });

    it('falls through to the PR list when the only search box is inert', () => {
      inertLayerWith(searchInput());
      renderHook(() => useKeyboardNav());
      fireKey('k', { ctrlKey: true });
      expect(mockSetActiveSection).toHaveBeenCalledWith('prs');
    });
  });

  describe('PR rows', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    /**
     * Rows as PrList draws them; `collapsed` ones sit in an inert
     * group. Rows 10 and 20 of different repos can share a number, so every
     * row carries its own `owner/repo#number` key.
     */
    function mountRows(
      rows: { n: number; repo?: string; selected?: boolean; collapsed?: boolean }[],
    ) {
      for (const { n, repo = `repo${n}`, selected, collapsed } of rows) {
        const parent = document.createElement('div');
        if (collapsed) parent.setAttribute('inert', '');
        const row = document.createElement('div');
        row.className = 'bd-wb-row';
        row.setAttribute('data-pr-row', '');
        row.dataset.prNumber = String(n);
        row.dataset.prOwner = 'acme';
        row.dataset.prRepo = repo;
        row.dataset.prKey = `acme/${repo}#${n}`;
        if (selected) row.dataset.selected = 'true';
        parent.appendChild(row);
        document.body.appendChild(parent);
      }
    }

    it('j and ArrowDown follow the drawn order, skipping collapsed groups', () => {
      mountRows([{ n: 10, selected: true }, { n: 11, collapsed: true }, { n: 12 }]);
      renderHook(() => useKeyboardNav());
      fireKey('j');
      expect(mockSelectPrKey).toHaveBeenLastCalledWith('acme/repo12#12', 12);
      fireKey('ArrowDown');
      expect(mockSelectPrKey).toHaveBeenLastCalledWith('acme/repo12#12', 12);
    });

    it('selects by key, so same-numbered PRs of two repos stay apart', () => {
      mountRows([
        { n: 7, repo: 'app', selected: true },
        { n: 7, repo: 'site' },
      ]);
      renderHook(() => useKeyboardNav());
      fireKey('j');
      expect(mockSelectPrKey).toHaveBeenLastCalledWith('acme/site#7', 7);
    });

    it('k and ArrowUp move up and stop at the first row', () => {
      mountRows([{ n: 10 }, { n: 12, selected: true }]);
      renderHook(() => useKeyboardNav());
      fireKey('k');
      expect(mockSelectPrKey).toHaveBeenLastCalledWith('acme/repo10#10', 10);
      document.body.innerHTML = '';
      mountRows([{ n: 10, selected: true }, { n: 12 }]);
      fireKey('ArrowUp');
      expect(mockSelectPrKey).toHaveBeenLastCalledWith('acme/repo10#10', 10);
    });

    it('selects the first row when nothing is selected', () => {
      mountRows([{ n: 10 }, { n: 12 }]);
      renderHook(() => useKeyboardNav());
      fireKey('j');
      expect(mockSelectPrKey).toHaveBeenLastCalledWith('acme/repo10#10', 10);
    });

    it('Enter opens the selected row in the detail view', () => {
      mountRows([
        { n: 12, repo: 'app' },
        { n: 12, repo: 'site', selected: true },
      ]);
      renderHook(() => useKeyboardNav());
      fireKey('Enter');
      expect(mockShowPr).toHaveBeenCalledWith({ owner: 'acme', repo: 'site', number: 12 });
      expect(mockOpenPrDetail).not.toHaveBeenCalled();
    });

    it('Ctrl+Enter and Cmd+Enter open the selected row in its own window', () => {
      mountRows([{ n: 10 }, { n: 12, selected: true }]);
      renderHook(() => useKeyboardNav());
      fireKey('Enter', { ctrlKey: true });
      fireKey('Enter', { metaKey: true });
      expect(mockOpenPrDetail).toHaveBeenCalledTimes(2);
      expect(mockOpenPrDetail).toHaveBeenCalledWith({ owner: 'acme', repo: 'repo12', number: 12 });
      expect(mockShowPr).not.toHaveBeenCalled();
    });

    it('Ctrl+Enter stands down while a menu or dialog is open', () => {
      mockOverlayOpen = true;
      mountRows([{ n: 12, selected: true }]);
      renderHook(() => useKeyboardNav());
      fireKey('Enter', { ctrlKey: true });
      expect(mockOpenPrDetail).not.toHaveBeenCalled();
    });

    it("Enter on a row's action button presses the button, not the row", () => {
      mountRows([{ n: 12, selected: true }]);
      const slot = document.createElement('span');
      slot.setAttribute('data-pr-card-action', '');
      const button = document.createElement('button');
      slot.appendChild(button);
      document.querySelector('.bd-wb-row')?.appendChild(slot);
      renderHook(() => useKeyboardNav());
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      expect(mockShowPr).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('leaves the keys to an open overlay (Quick Review)', () => {
      mockOverlayOpen = true;
      mockSelectedPrNumber = 10;
      mountRows([{ n: 10 }, { n: 12 }]);
      renderHook(() => useKeyboardNav());
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      fireKey('j');
      expect(event.defaultPrevented).toBe(false);
      expect(mockSelectPr).not.toHaveBeenCalled();
      expect(mockSelectPrKey).not.toHaveBeenCalled();
    });

    it('Enter without a selection does nothing', () => {
      mountRows([{ n: 10 }]);
      renderHook(() => useKeyboardNav());
      fireKey('Enter');
      fireKey('Enter', { ctrlKey: true });
      expect(mockShowPr).not.toHaveBeenCalled();
      expect(mockOpenPrDetail).not.toHaveBeenCalled();
    });

    it('leaves the keys to a row that already handled them', () => {
      mountRows([{ n: 10, selected: true }]);
      renderHook(() => useKeyboardNav());
      for (const ctrlKey of [false, true]) {
        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          ctrlKey,
          bubbles: true,
          cancelable: true,
        });
        event.preventDefault();
        document.dispatchEvent(event);
      }
      expect(mockPushView).not.toHaveBeenCalled();
      expect(mockOpenPrDetail).not.toHaveBeenCalled();
    });
  });
});

describe('useKeyboardNav on work item rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveSection = 'workitems';
    mockViewStack = [{ kind: 'list' }];
    mockOverlayOpen = false;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** Rows as WorkItemsSection draws them; `collapsed` ones sit in an inert group. */
  function mountWorkItems(rows: { id: number; selected?: boolean; collapsed?: boolean }[]) {
    for (const { id, selected, collapsed } of rows) {
      const parent = document.createElement('div');
      if (collapsed) parent.setAttribute('inert', '');
      const row = document.createElement('div');
      row.className = 'bd-wb-row bd-wi-wb-row';
      row.setAttribute('role', 'button');
      row.dataset.wiId = String(id);
      if (selected) row.dataset.selected = 'true';
      parent.appendChild(row);
      document.body.appendChild(parent);
    }
  }

  it('j / ArrowDown move down the drawn rows, skipping collapsed groups', () => {
    mountWorkItems([{ id: 101, selected: true }, { id: 102, collapsed: true }, { id: 103 }]);
    renderHook(() => useKeyboardNav());
    fireKey('j');
    expect(mockSetWorkItemsSelectedId).toHaveBeenLastCalledWith(103);
    fireKey('ArrowDown');
    expect(mockSetWorkItemsSelectedId).toHaveBeenLastCalledWith(103);
    // Work item rows never touch the PR selection.
    expect(mockSelectPr).not.toHaveBeenCalled();
    expect(mockSelectPrKey).not.toHaveBeenCalled();
  });

  it('k / ArrowUp move up and stop at the first row', () => {
    mountWorkItems([{ id: 101 }, { id: 102, selected: true }]);
    renderHook(() => useKeyboardNav());
    fireKey('k');
    expect(mockSetWorkItemsSelectedId).toHaveBeenLastCalledWith(101);
    document.body.innerHTML = '';
    mountWorkItems([{ id: 101, selected: true }, { id: 102 }]);
    fireKey('ArrowUp');
    expect(mockSetWorkItemsSelectedId).toHaveBeenLastCalledWith(101);
  });

  it('selects the first row when nothing is selected', () => {
    mountWorkItems([{ id: 101 }, { id: 102 }]);
    renderHook(() => useKeyboardNav());
    fireKey('j');
    expect(mockSetWorkItemsSelectedId).toHaveBeenLastCalledWith(101);
  });

  it('Enter opens the selected work item in the detail view', () => {
    mountWorkItems([{ id: 101 }, { id: 102, selected: true }]);
    renderHook(() => useKeyboardNav());
    fireKey('Enter');
    expect(mockShowWorkItem).toHaveBeenCalledWith(102);
    expect(mockShowPr).not.toHaveBeenCalled();
    expect(mockOpenPrDetail).not.toHaveBeenCalled();
  });

  it("Enter on a row's toggle presses the toggle, not the row", () => {
    mountWorkItems([{ id: 102, selected: true }]);
    const toggle = document.createElement('button');
    toggle.setAttribute('data-wi-toggle', 'track');
    document.body.appendChild(toggle);
    renderHook(() => useKeyboardNav());
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(mockShowWorkItem).not.toHaveBeenCalled();
  });

  it('stands down while a menu or dialog is open', () => {
    mockOverlayOpen = true;
    mountWorkItems([{ id: 101, selected: true }, { id: 102 }]);
    renderHook(() => useKeyboardNav());
    fireKey('j');
    fireKey('Enter');
    expect(mockSetWorkItemsSelectedId).not.toHaveBeenCalled();
    expect(mockShowWorkItem).not.toHaveBeenCalled();
  });
});
