import { useCallback, useEffect, useRef } from 'react';
import { isOverlayOpen, pushView, showSection } from '@/services/navigation';
import { openPrDetail } from '@/services/windows';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { SECTION_ORDER, useUiStore } from '@/stores/ui-store';

type QueueMergeFn = (owner: string, repo: string, prNumber: number) => void;

export function useKeyboardNav() {
  const focusedIndexRef = useRef(0);
  const selectPr = useUiStore((s) => s.selectPr);
  const selectedPrNumber = useUiStore((s) => s.selectedPrNumber);
  const pullRequests = usePrStore((s) => s.pullRequests);
  const filter = usePrStore((s) => s.filter);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Search and refresh work from any view.
      if (isSearchShortcut(e)) {
        e.preventDefault();
        focusSectionSearch();
        return;
      }

      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      if (isRefreshShortcut(e)) {
        e.preventDefault();
        dispatchRefresh();
        return;
      }

      // The rest are the list view's keys. A detail view on top of the list
      // has its own (ViewStack handles Esc / Alt+Left there).
      if (useUiStore.getState().viewStack.length > 1) return;

      // Single-key shortcuts of the rail layout (plan section 7): not on key
      // repeat, and not while a menu, dialog or Quick Review owns the keyboard.
      const layoutV3 = useSettingsStore.getState().settings.ui.layoutV3 ?? false;
      if (layoutV3 && isPlainKey(e) && !e.repeat && !isOverlayOpen()) {
        const section = railSectionForKey(e);
        if (section) {
          e.preventDefault();
          void showSection(section);
          return;
        }
        if (e.key === '/') {
          e.preventDefault();
          focusSectionSearch();
          return;
        }
        if (e.key === 'r' && useUiStore.getState().activeSection !== 'focus') {
          e.preventDefault();
          dispatchRefresh();
          return;
        }
      }

      // Workbench PR rows: J/K follow the rows as drawn ("Needs you" first,
      // then the groups; collapsed groups skipped) and Enter opens the
      // selected one in the detail view.
      if (layoutV3 && !e.defaultPrevented && isPlainKey(e)) {
        // A menu, dialog or Quick Review owns the keyboard.
        if (isOverlayOpen()) return;
        const rows = live<HTMLElement>(WORKBENCH_ROW_SELECTOR);
        if (rows.length > 0 && handleWorkbenchRowKey(e, rows, focusedIndexRef)) return;
      }
      // Ctrl/Cmd+Enter opens the selected Workbench row in its own window.
      if (layoutV3 && !e.defaultPrevented && isPopOutShortcut(e) && !isOverlayOpen()) {
        const row = live<HTMLElement>(WORKBENCH_ROW_SELECTOR).find(
          (r) => r.dataset.selected === 'true',
        );
        const target = row ? rowTarget(row) : null;
        if (target) {
          e.preventDefault();
          void openPrDetail(target);
          return;
        }
      }

      const filteredPrs = usePrStore.getState().filteredPrs();
      if (filteredPrs.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault();
          focusedIndexRef.current = Math.min(focusedIndexRef.current + 1, filteredPrs.length - 1);
          const pr = filteredPrs[focusedIndexRef.current];
          if (pr) selectPr(pr.pullRequest.number);
          // Scroll focused card into view
          scrollFocusedIntoView(focusedIndexRef.current);
          break;
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault();
          focusedIndexRef.current = Math.max(focusedIndexRef.current - 1, 0);
          const pr = filteredPrs[focusedIndexRef.current];
          if (pr) selectPr(pr.pullRequest.number);
          scrollFocusedIntoView(focusedIndexRef.current);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          // Already selected via arrow keys
          break;
        }
        case 'Escape': {
          e.preventDefault();
          if (selectedPrNumber !== null) {
            selectPr(null);
          }
          break;
        }
        case 'r': {
          // Ctrl+R is handled above; plain R in Focus starts Quick Review.
          if (useUiStore.getState().activeSection === 'focus' && !e.shiftKey) {
            // R in Focus: start Quick Review for selected PR
            e.preventDefault();
            const focusPrs = usePrStore.getState().focusPrs();
            const selected = focusPrs[focusedIndexRef.current];
            if (selected) {
              useQuickReviewStore.getState().startSinglePr(selected);
            }
          }
          break;
        }
        case 'R': {
          // Shift+R: start Quick Review session for all review-requested PRs
          if (e.shiftKey) {
            e.preventDefault();
            const reviewPrs = usePrStore.getState().needsMyReview();
            if (reviewPrs.length > 0) {
              useQuickReviewStore.getState().startSession(reviewPrs);
            }
          }
          break;
        }
        case 'e':
        case 'E': {
          e.preventDefault();
          useUiStore.getState().collapseAllRepoGroups();
          break;
        }
        case 'm':
        case 'M': {
          // Merge with undo toast — only in Focus section
          if (useUiStore.getState().activeSection !== 'focus') break;
          e.preventDefault();
          const focusPrs = usePrStore.getState().focusPrs();
          const selected = focusPrs[focusedIndexRef.current];
          if (!selected) break;
          const p = selected.pullRequest;
          const queueMerge = (window as unknown as Record<string, unknown>).__borgdockQueueMerge as
            | QueueMergeFn
            | undefined;
          if (queueMerge) {
            queueMerge(p.repoOwner, p.repoName, p.number);
          }
          break;
        }
        case 'o': {
          // Open PR in browser
          const pr = filteredPrs[focusedIndexRef.current];
          if (pr) {
            e.preventDefault();
            import('@tauri-apps/plugin-opener')
              .then(({ openUrl }) => openUrl(pr.pullRequest.htmlUrl))
              .catch(console.error);
          }
          break;
        }
      }
    },
    [selectPr, selectedPrNumber],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Reset focused index when PR list changes. pullRequests + filter are
  // subscribed via selectors so the component re-renders; we just want this
  // effect to re-run on those re-renders.
  useEffect(() => {
    void pullRequests;
    void filter;
    const filteredPrs = usePrStore.getState().filteredPrs();
    if (focusedIndexRef.current >= filteredPrs.length) {
      focusedIndexRef.current = Math.max(0, filteredPrs.length - 1);
    }
  }, [pullRequests, filter]);

  return { focusedIndex: focusedIndexRef };
}

const WORKBENCH_ROW_SELECTOR = '.bd-wb-row[data-pr-key]';

/**
 * J/K/arrows and Enter over the Workbench list's rows, in DOM order. Returns
 * true when the key was handled.
 */
function handleWorkbenchRowKey(
  e: KeyboardEvent,
  rows: HTMLElement[],
  focusedIndexRef: { current: number },
): boolean {
  const current = rows.findIndex((row) => row.dataset.selected === 'true');
  const select = (index: number) => {
    const row = rows[index];
    if (!row) return;
    focusedIndexRef.current = index;
    useUiStore
      .getState()
      .selectPrKey(row.dataset.prKey ?? null, Number(row.dataset.prNumber) || null);
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  switch (e.key) {
    case 'ArrowDown':
    case 'j':
      e.preventDefault();
      select(current < 0 ? 0 : Math.min(current + 1, rows.length - 1));
      return true;
    case 'ArrowUp':
    case 'k':
      e.preventDefault();
      select(current < 0 ? 0 : Math.max(current - 1, 0));
      return true;
    case 'Enter': {
      const row = rows[current];
      const target = row ? rowTarget(row) : null;
      if (!target) return false;
      e.preventDefault();
      void pushView({ kind: 'pr-detail', ...target });
      return true;
    }
    default:
      return false;
  }
}

/** The PR a Workbench row stands for, from its data attributes. */
function rowTarget(row: HTMLElement): { owner: string; repo: string; number: number } | null {
  const { prOwner: owner, prRepo: repo, prNumber } = row.dataset;
  if (!owner || !repo || !prNumber) return null;
  return { owner, repo, number: Number(prNumber) };
}

/** Ctrl+Enter (Cmd+Enter on macOS): open the selected PR in a pop-out window. */
function isPopOutShortcut(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
}

/** No modifier that changes what the key means (Shift is allowed: `/` needs it on some layouts). */
function isPlainKey(e: KeyboardEvent): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey;
}

/** `1`–`4` pick the rail's sections (the rail layout only; the caller checks). */
function railSectionForKey(e: KeyboardEvent) {
  if (e.shiftKey || !/^[1-9]$/.test(e.key)) return null;
  return SECTION_ORDER[Number(e.key) - 1] ?? null;
}

function isRefreshShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'r';
}

function dispatchRefresh(): void {
  document.dispatchEvent(new CustomEvent('borgdock-refresh'));
}

function isSearchShortcut(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (key === 'k' || key === 'f');
}

const SECTION_SEARCH_SELECTOR = 'input[data-section-search]';

/** First match of `selector` outside inert layers (a covered list, a section fading out). */
function live<T extends Element>(selector: string): T[] {
  return [...document.querySelectorAll<T>(selector)].filter((el) => !el.closest('[inert]'));
}

function findSectionSearch(): HTMLInputElement | null {
  return live<HTMLInputElement>(SECTION_SEARCH_SELECTOR)[0] ?? null;
}

/** Focuses and selects `input`; false when there is none or it could not take focus. */
function focusAndSelect(input: HTMLInputElement | null): boolean {
  if (!input) return false;
  input.focus();
  if (document.activeElement !== input) return false;
  input.select();
  return true;
}

/** Switch to the PR list, which always has a search box, and focus it. */
function focusPrSearch(): void {
  useUiStore.getState().setActiveSection('prs');
  requestAnimationFrame(() => focusAndSelect(findSectionSearch()));
}

/**
 * Focus the search of the section on screen. From a detail view this goes
 * back to the list first; a section without a search box (Focus, Worktrees)
 * jumps to the PR list's.
 */
function focusSectionSearch(): void {
  if (focusAndSelect(findSectionSearch())) return;
  const ui = useUiStore.getState();
  if (ui.viewStack.length > 1) {
    void showSection(ui.activeSection).then(() =>
      requestAnimationFrame(() => {
        if (!focusAndSelect(findSectionSearch())) focusPrSearch();
      }),
    );
    return;
  }
  focusPrSearch();
}

function scrollFocusedIntoView(index: number): void {
  // PR cards in the live section only; a covered list or a section fading
  // out keeps its cards in the DOM.
  const card = live('[data-pr-card]')[index];
  if (card) {
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
