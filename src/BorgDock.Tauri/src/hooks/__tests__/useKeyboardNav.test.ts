import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import { useKeyboardNav } from '../useKeyboardNav';

// Mock the stores
const mockSelectPr = vi.fn();
const mockFilteredPrs = vi.fn<() => PullRequestWithChecks[]>(() => []);
const mockFocusPrs = vi.fn<() => PullRequestWithChecks[]>(() => []);
const mockNeedsMyReview = vi.fn<() => PullRequestWithChecks[]>(() => []);
const mockCollapseAllRepoGroups = vi.fn();
const mockStartSinglePr = vi.fn();
const mockStartSession = vi.fn();
const mockSetActiveSection = vi.fn();

const mockShowSection = vi.fn((_section: string) => Promise.resolve());
let mockOverlayOpen = false;

let mockSelectedPrNumber: number | null = null;
let mockActiveSection = 'prs';
let mockViewStack: { kind: string }[] = [{ kind: 'list' }];
let mockLayoutV3 = false;

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
        activeSection: mockActiveSection,
        viewStack: mockViewStack,
        collapseAllRepoGroups: mockCollapseAllRepoGroups,
        setActiveSection: mockSetActiveSection,
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
        filteredPrs: mockFilteredPrs,
        focusPrs: mockFocusPrs,
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
  isOverlayOpen: () => mockOverlayOpen,
}));

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: {
    getState: () => ({ settings: { ui: { layoutV3: mockLayoutV3 } } }),
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
    mockLayoutV3 = false;
    mockOverlayOpen = false;
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

  it('collapses all repo groups on e key', () => {
    const prs = [makePr(1)];
    mockFilteredPrs.mockReturnValue(prs);

    renderHook(() => useKeyboardNav());
    fireKey('e');
    expect(mockCollapseAllRepoGroups).toHaveBeenCalled();
  });

  it('collapses all repo groups on E key', () => {
    const prs = [makePr(1)];
    mockFilteredPrs.mockReturnValue(prs);

    renderHook(() => useKeyboardNav());
    fireKey('E');
    expect(mockCollapseAllRepoGroups).toHaveBeenCalled();
  });

  it('dispatches refresh event on Ctrl+R', () => {
    const prs = [makePr(1)];
    mockFilteredPrs.mockReturnValue(prs);

    const listener = vi.fn();
    document.addEventListener('borgdock-refresh', listener);

    renderHook(() => useKeyboardNav());
    fireKey('r', { ctrlKey: true });

    expect(listener).toHaveBeenCalled();
    document.removeEventListener('borgdock-refresh', listener);
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
    (window as unknown as Record<string, unknown>).__borgdockQueueMerge = mockQueueMerge;

    renderHook(() => useKeyboardNav());
    fireKey('m');

    expect(mockQueueMerge).toHaveBeenCalledWith('test', 'repo', 42);

    delete (window as unknown as Record<string, unknown>).__borgdockQueueMerge;
  });

  it('does not call queueMerge on m key outside focus section', () => {
    mockActiveSection = 'prs';
    const pr = makePr(42);
    mockFilteredPrs.mockReturnValue([pr]);

    const mockQueueMerge = vi.fn();
    (window as unknown as Record<string, unknown>).__borgdockQueueMerge = mockQueueMerge;

    renderHook(() => useKeyboardNav());
    fireKey('m');

    expect(mockQueueMerge).not.toHaveBeenCalled();

    delete (window as unknown as Record<string, unknown>).__borgdockQueueMerge;
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

  describe('rail section keys (layoutV3)', () => {
    it.each([
      ['1', 'focus'],
      ['2', 'prs'],
      ['3', 'workitems'],
      ['4', 'worktrees'],
    ])('%s switches to %s', (key, section) => {
      mockLayoutV3 = true;
      renderHook(() => useKeyboardNav());
      fireKey(key);
      expect(mockShowSection).toHaveBeenCalledWith(section);
    });

    it('works with an empty PR list', () => {
      mockLayoutV3 = true;
      mockFilteredPrs.mockReturnValue([]);
      renderHook(() => useKeyboardNav());
      fireKey('2');
      expect(mockShowSection).toHaveBeenCalledWith('prs');
    });

    it('ignores keys past the last section and modified digits', () => {
      mockLayoutV3 = true;
      renderHook(() => useKeyboardNav());
      fireKey('5');
      fireKey('1', { ctrlKey: true });
      fireKey('1', { altKey: true });
      expect(mockShowSection).not.toHaveBeenCalled();
    });

    it('stays unbound in the tab layout', () => {
      mockLayoutV3 = false;
      renderHook(() => useKeyboardNav());
      fireKey('1');
      expect(mockShowSection).not.toHaveBeenCalled();
    });

    it('does not switch while typing in an input', () => {
      mockLayoutV3 = true;
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
      mockLayoutV3 = true;
      mockViewStack = [{ kind: 'list' }, { kind: 'pr-detail' }];
      mockSelectedPrNumber = 1;
      mockFilteredPrs.mockReturnValue([makePr(1), makePr(2)]);
      renderHook(() => useKeyboardNav());
      fireKey('ArrowDown');
      fireKey('Escape');
      fireKey('2');
      expect(mockSelectPr).not.toHaveBeenCalled();
      expect(mockShowSection).not.toHaveBeenCalled();
    });
  });

  describe('single-key guards (layoutV3)', () => {
    beforeEach(() => {
      mockLayoutV3 = true;
    });

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

  describe('slash and R in the rail layout', () => {
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
      mockLayoutV3 = true;
      const input = mountSearch();
      renderHook(() => useKeyboardNav());
      const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      expect(document.activeElement).toBe(input);
      expect(event.defaultPrevented).toBe(true);
    });

    it('/ is unbound in the tab layout', () => {
      const input = mountSearch();
      renderHook(() => useKeyboardNav());
      fireKey('/');
      expect(document.activeElement).not.toBe(input);
    });

    it('plain R refreshes outside Focus', () => {
      mockLayoutV3 = true;
      mockActiveSection = 'prs';
      const listener = vi.fn();
      document.addEventListener('borgdock-refresh', listener);
      renderHook(() => useKeyboardNav());
      fireKey('r');
      document.removeEventListener('borgdock-refresh', listener);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('plain R in Focus still starts Quick Review instead', () => {
      mockLayoutV3 = true;
      mockActiveSection = 'focus';
      const pr = makePr(1);
      mockFilteredPrs.mockReturnValue([pr]);
      mockFocusPrs.mockReturnValue([pr]);
      const listener = vi.fn();
      document.addEventListener('borgdock-refresh', listener);
      renderHook(() => useKeyboardNav());
      fireKey('r');
      document.removeEventListener('borgdock-refresh', listener);
      expect(listener).not.toHaveBeenCalled();
      expect(mockStartSinglePr).toHaveBeenCalledWith(pr);
    });

    it('plain R does not refresh in the tab layout', () => {
      const listener = vi.fn();
      document.addEventListener('borgdock-refresh', listener);
      mockFilteredPrs.mockReturnValue([makePr(1)]);
      renderHook(() => useKeyboardNav());
      fireKey('r');
      document.removeEventListener('borgdock-refresh', listener);
      expect(listener).not.toHaveBeenCalled();
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

    function card() {
      const el = document.createElement('div');
      el.setAttribute('data-pr-card', '');
      el.scrollIntoView = vi.fn();
      return el;
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

    it('scrolls the card in the live section, not one in an inert layer', () => {
      mockFilteredPrs.mockReturnValue([makePr(1), makePr(2)]);
      const staleFirst = card();
      const staleSecond = card();
      inertLayerWith(staleFirst, staleSecond);
      const first = card();
      const second = card();
      document.body.append(first, second);

      renderHook(() => useKeyboardNav());
      fireKey('ArrowDown');
      expect(second.scrollIntoView).toHaveBeenCalled();
      expect(staleSecond.scrollIntoView).not.toHaveBeenCalled();
    });
  });
});
