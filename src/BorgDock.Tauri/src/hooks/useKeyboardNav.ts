import { useCallback, useEffect, useRef } from 'react';
import { isOverlayOpen, showPr, showSection, showWorkItem } from '@/services/navigation';
import { isReady } from '@/services/pr-grouping';
import { openPrDetail } from '@/services/windows';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { SECTION_ORDER, useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';

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

      // Enter on a control (a button, a link, the "Why not the others?"
      // summary, a row's action) is that control's: never the list's.
      if (layoutV3 && e.key === 'Enter' && isOtherControl(e.target)) return;

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
        // R, M and O act on the selected row or card, found by its key.
        // The tab layout's index (below) is not the Workbench selection: a
        // filtered list and the Board's columns have their own order.
        if (isSelectionKey(e)) {
          const selected = selectedWorkbenchPr();
          if (selected) actOnSelection(e, selected);
          return;
        }
      }

      // The Focus board: J/K within a column, H/L (or ←/→) across columns,
      // Enter opens the selected card.
      if (layoutV3 && !e.defaultPrevented && isPlainKey(e) && !isOverlayOpen()) {
        const cards = live<HTMLElement>(BOARD_CARD_SELECTOR);
        if (cards.length > 0 && handleBoardKey(e, cards)) return;
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
      // Workbench work item rows: J/K move the selection, Enter opens the
      // selected item's full-screen detail view.
      if (layoutV3 && !e.defaultPrevented && isPlainKey(e) && !isOverlayOpen()) {
        const wiRows = live<HTMLElement>(WORK_ITEM_ROW_SELECTOR);
        if (wiRows.length > 0 && handleWorkItemRowKey(e, wiRows)) return;
      }
      // Ctrl/Cmd+Enter opens the selected Workbench row (or Focus card) in its own window.
      if (layoutV3 && !e.defaultPrevented && isPopOutShortcut(e) && !isOverlayOpen()) {
        const row = live<HTMLElement>(`${WORKBENCH_ROW_SELECTOR}, ${BOARD_CARD_SELECTOR}`).find(
          (r) => r.dataset.selected === 'true',
        );
        const target = row ? rowTarget(row) : null;
        if (target) {
          e.preventDefault();
          void openPrDetail(target);
          return;
        }
      }

      // R / M / O never reach the tab layout's index-based rules in the
      // Workbench layout (a held key, an open overlay): nothing happens.
      if (layoutV3 && isPlainKey(e) && isSelectionKey(e)) return;

      // The tab layout's keys below. Quick Review (Enter, Esc, J/K in its
      // file walk), menus and dialogs keep theirs.
      if (isOverlayOpen()) return;

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
      // Enter on a row's action button (Review, Merge) presses that button:
      // handled here so nothing else claims (or prevents) the key.
      if (e.target instanceof Element && e.target.closest('[data-pr-card-action]')) return true;
      const row = rows[current];
      const target = row ? rowTarget(row) : null;
      if (!target) return false;
      e.preventDefault();
      void showPr(inSection(target));
      return true;
    }
    default:
      return false;
  }
}

/** Rows of the Workbench Work items list (`WorkbenchWorkItemRow`). */
const WORK_ITEM_ROW_SELECTOR = '.bd-wi-wb-row[data-wi-id]';

/**
 * J/K/arrows over the Work items rows in DOM order (collapsed groups are
 * inert, so skipped) and Enter to open the selected one. The selection is
 * `ui-store.workItemsSelectedId`. Returns true when the key was handled.
 */
function handleWorkItemRowKey(e: KeyboardEvent, rows: HTMLElement[]): boolean {
  const current = rows.findIndex((row) => row.dataset.selected === 'true');
  const select = (index: number) => {
    const row = rows[index];
    const id = Number(row?.dataset.wiId);
    if (!row || !id) return;
    useUiStore.getState().setWorkItemsSelectedId(id);
    row.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
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
      // Enter on a row's ★ / ● toggle presses that toggle.
      if (e.target instanceof Element && e.target.closest('[data-wi-toggle]')) return true;
      const id = Number(rows[current]?.dataset.wiId);
      if (!id) return false;
      e.preventDefault();
      void showWorkItem(id);
      return true;
    }
    default:
      return false;
  }
}

/** R (Focus), M (Focus) and O: the keys that act on the selected PR. */
function isSelectionKey(e: KeyboardEvent): boolean {
  if (e.key === 'o') return true;
  if (useUiStore.getState().activeSection !== 'focus') return false;
  return (e.key === 'r' && !e.shiftKey) || e.key === 'm' || e.key === 'M';
}

/**
 * The Workbench layout's R / M / O on the selected PR: R starts Quick Review
 * for it, M queues its merge (with the Undo toast) only when it is ready to
 * merge, O opens it on GitHub.
 */
function actOnSelection(e: KeyboardEvent, pr: PullRequestWithChecks): void {
  const p = pr.pullRequest;
  if (e.key === 'r') {
    e.preventDefault();
    useQuickReviewStore.getState().startSinglePr(pr);
    return;
  }
  if (e.key === 'o') {
    e.preventDefault();
    import('@tauri-apps/plugin-opener')
      .then(({ openUrl }) => openUrl(p.htmlUrl))
      .catch(console.error);
    return;
  }
  e.preventDefault();
  if (p.state !== 'open' || p.mergedAt || !isReady(pr)) return;
  const queueMerge = (window as unknown as Record<string, unknown>).__borgdockQueueMerge as
    | QueueMergeFn
    | undefined;
  queueMerge?.(p.repoOwner, p.repoName, p.number);
}

/** Row and card bodies: Enter on them is the list's (open the PR). */
const LIST_BODY_SELECTOR = '.bd-wb-row, .bd-fb-card__main';

/** Anything Enter activates by itself: buttons, links, summaries, fields. */
const CONTROL_SELECTOR =
  'button, a[href], summary, input, select, textarea, [role="button"], [role="link"], [role="tab"]';

/** `target` is a control other than a Workbench row or Focus card body. */
function isOtherControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const control = target.closest(CONTROL_SELECTOR);
  return control !== null && !control.matches(LIST_BODY_SELECTOR);
}

/** Cards of the Focus board (`FocusBoard`), each inside a `[data-col]` column. */
const BOARD_CARD_SELECTOR = '.bd-fb-card[data-pr-key]';

/**
 * J/K/↓/↑ within a Focus board column, H/L/←/→ to the neighbouring column
 * that has cards (same position, clamped), Enter opens the selected card.
 * With nothing selected, any move selects the first card. Returns true when
 * the key was handled.
 */
function handleBoardKey(e: KeyboardEvent, cards: HTMLElement[]): boolean {
  const columns: HTMLElement[][] = [];
  const byColumn = new Map<Element | null, HTMLElement[]>();
  for (const card of cards) {
    const col = card.closest('[data-col]');
    let list = byColumn.get(col);
    if (!list) {
      list = [];
      byColumn.set(col, list);
      columns.push(list);
    }
    list.push(card);
  }
  let colIndex = columns.findIndex((col) => col.some((c) => c.dataset.selected === 'true'));
  const rowIndex =
    colIndex < 0 ? -1 : columns[colIndex]!.findIndex((c) => c.dataset.selected === 'true');

  const select = (card: HTMLElement | undefined) => {
    if (!card) return;
    useUiStore
      .getState()
      .selectPrKey(card.dataset.prKey ?? null, Number(card.dataset.prNumber) || null);
    card.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };

  const key = e.key;
  const vertical = key === 'j' || key === 'k' || key === 'ArrowDown' || key === 'ArrowUp';
  const horizontal = key === 'h' || key === 'l' || key === 'ArrowLeft' || key === 'ArrowRight';
  if (vertical || horizontal) {
    e.preventDefault();
    if (colIndex < 0) {
      select(columns[0]?.[0]);
      return true;
    }
    const column = columns[colIndex]!;
    if (vertical) {
      const down = key === 'j' || key === 'ArrowDown';
      select(column[Math.max(0, Math.min(column.length - 1, rowIndex + (down ? 1 : -1)))]);
      return true;
    }
    colIndex += key === 'l' || key === 'ArrowRight' ? 1 : -1;
    const next = columns[colIndex];
    if (next) select(next[Math.min(rowIndex, next.length - 1)]);
    return true;
  }
  if (key === 'Enter') {
    if (e.target instanceof Element && e.target.closest('[data-fb-action]')) return true;
    const card = colIndex < 0 ? undefined : columns[colIndex]![rowIndex];
    const target = card ? rowTarget(card) : null;
    if (!target) return false;
    e.preventDefault();
    void showPr(inSection(target));
    return true;
  }
  return false;
}

/** Focus opens rows and cards without leaving Focus, so Back returns there. */
function inSection<T extends { owner: string; repo: string; number: number }>(target: T) {
  return useUiStore.getState().activeSection === 'focus'
    ? { ...target, keepSection: true }
    : target;
}

/** The PR of the selected Workbench row or Focus card on screen, from the store. */
function selectedWorkbenchPr() {
  const el = live<HTMLElement>(`${WORKBENCH_ROW_SELECTOR}, ${BOARD_CARD_SELECTOR}`).find(
    (r) => r.dataset.selected === 'true',
  );
  const key = el?.dataset.prKey;
  if (!key) return undefined;
  const prs = usePrStore.getState().pullRequests ?? [];
  return prs.find(
    (pr) =>
      `${pr.pullRequest.repoOwner}/${pr.pullRequest.repoName}#${pr.pullRequest.number}` === key,
  );
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
