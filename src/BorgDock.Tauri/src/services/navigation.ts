import { flushSync } from 'react-dom';
import { createLogger } from '@/services/logger';
import { openPrDetail } from '@/services/windows';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import {
  type ActiveSection,
  type MainView,
  type PrDetailTab,
  selectTopView,
  useUiStore,
} from '@/stores/ui-store';
import { withViewTransition } from '@/utils/motion';

const log = createLogger('navigation');

/**
 * In-window navigation for the main window's view stack
 * (plans/ui-overhaul-workbench.md, section 3).
 *
 * Every push and pop the user triggers goes through here so it runs inside
 * `withViewTransition`: the browser snapshots the old view, the store update
 * commits synchronously (`flushSync`), and view-transition names on both
 * sides morph into each other. `data-view-transition="push|pop"` sits on
 * <html> for the duration so motion.css can run the two directions
 * differently. Without the API, or under reduced motion, the update is
 * applied directly and `ViewStack` plays its CSS fallback.
 *
 * Focus follows the stack: a push remembers the focused element, and the
 * matching pop puts focus back on it (or on the list when it is gone).
 */

export type ViewTransitionDirection = 'push' | 'pop';

const DIRECTION_ATTR = 'data-view-transition';

/** Elements that had focus when each detail view was pushed, bottom first. */
const focusBeforePush: (Element | null)[] = [];

let transitionToken = 0;

/**
 * Runs `update` (a store change) inside a view transition. `afterCommit`
 * runs once React has committed it, still inside the transition's update
 * callback, so its effects (focus) are part of the new snapshot.
 */
function navigate(
  direction: ViewTransitionDirection,
  update: () => void,
  afterCommit?: () => void,
): Promise<void> {
  const token = ++transitionToken;
  const root = typeof document === 'undefined' ? null : document.documentElement;
  root?.setAttribute(DIRECTION_ATTR, direction);
  const run = () => {
    flushSync(update);
    afterCommit?.();
  };
  return withViewTransition(run, {
    onFinished: () => {
      // A newer navigation owns the attribute now.
      if (token === transitionToken) root?.removeAttribute(DIRECTION_ATTR);
    },
  });
}

/**
 * The ViewStack layer now showing: the top detail view, or the list. Focused
 * when the element that had focus before the push is gone.
 */
function visibleLayer(): HTMLElement | null {
  const layers = [...document.querySelectorAll<HTMLElement>('.bd-viewstack__layer')].filter(
    (layer) => !layer.hasAttribute('inert'),
  );
  return layers[layers.length - 1] ?? null;
}

function restoreFocus(target: Element | null | undefined) {
  if (typeof document === 'undefined') return;
  const el =
    target instanceof HTMLElement && target.isConnected && !target.closest('[inert]')
      ? target
      : visibleLayer();
  el?.focus({ preventScroll: true });
}

/** Push `view` on top of the main window's view stack. */
export function pushView(view: MainView): Promise<void> {
  focusBeforePush.push(typeof document === 'undefined' ? null : document.activeElement);
  return navigate('push', () => useUiStore.getState().pushView(view));
}

/** Pop the top view. Resolves without doing anything when the list is showing. */
export function popView(): Promise<void> {
  if (useUiStore.getState().viewStack.length <= 1) return Promise.resolve();
  const target = focusBeforePush.pop();
  return navigate(
    'pop',
    () => useUiStore.getState().popView(),
    () => restoreFocus(target),
  );
}

/**
 * Show a section's list. From a detail view this returns to the list first,
 * in the same transition, so the rail always lands on the list it names.
 */
export function showSection(section: ActiveSection): Promise<void> {
  const ui = useUiStore.getState();
  if (ui.viewStack.length <= 1) {
    ui.setActiveSection(section);
    return Promise.resolve();
  }
  // Back to the list: the focus remembered by the first push is the one
  // that belongs to it.
  const target = focusBeforePush[0];
  focusBeforePush.length = 0;
  return navigate(
    'pop',
    () => {
      const state = useUiStore.getState();
      state.setActiveSection(section);
      state.replaceView({ kind: 'list' });
    },
    () => restoreFocus(target),
  );
}

export interface ShowPrTarget {
  owner: string;
  repo: string;
  number: number;
  /** Tab to open on. Default Overview. */
  tab?: PrDetailTab;
  /**
   * Stay in the current section instead of switching to Pull requests, so
   * Back returns to it (Focus opens its rows and cards this way).
   */
  keepSection?: boolean;
}

/** Tauri label of the main window (`tauri.conf.json`). */
export const MAIN_WINDOW_LABEL = 'main';

/** Event another window sends the main window to open a PR (useFlyoutSync listens). */
export const OPEN_PR_DETAIL_EVENT = 'open-pr-detail';

/**
 * Label of the window this code runs in, read from the metadata Tauri
 * injects; null outside Tauri (unit tests, Storybook), which count as the
 * main window.
 */
function currentWindowLabel(): string | null {
  if (typeof window === 'undefined') return null;
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } };
    }
  ).__TAURI_INTERNALS__;
  return internals?.metadata?.currentWindow?.label ?? null;
}

export function isMainWindow(): boolean {
  const label = currentWindowLabel();
  return label === null || label === MAIN_WINDOW_LABEL;
}

function prDetailView({ owner, repo, number, tab }: ShowPrTarget): MainView {
  return tab
    ? { kind: 'pr-detail', owner, repo, number, initialTab: tab }
    : { kind: 'pr-detail', owner, repo, number };
}

function samePr(view: MainView, target: ShowPrTarget): boolean {
  return (
    view.kind === 'pr-detail' &&
    view.owner === target.owner &&
    view.repo === target.repo &&
    view.number === target.number
  );
}

/**
 * Open a pull request (plans/ui-overhaul-workbench.md, section 3). Every
 * "open this PR" path goes through here; only the explicit "Open in window"
 * actions call `openPrDetail` themselves.
 *
 * - In the main window with `ui.layoutV3` on: switch to Pull requests
 *   (unless `keepSection`), select the PR's row and push the full-screen
 *   detail view. A PR detail
 *   already on top is replaced, not stacked; the same PR on the same tab is
 *   left alone.
 * - In the main window with the flag off: the pop-out window, as before.
 * - In another window (the tray flyout): ask the main window, which applies
 *   the same rules and, when it pushes the view, brings itself to the front.
 *
 * The selection is set before the transition starts, so the row carries the
 * view-transition names in the old snapshot and morphs into the header.
 */
export async function showPr(target: ShowPrTarget): Promise<void> {
  const { owner, repo, number } = target;
  if (!isMainWindow()) {
    try {
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo(MAIN_WINDOW_LABEL, OPEN_PR_DETAIL_EVENT, target);
    } catch (err) {
      log.error('open-pr-detail emit failed', err, { owner, repo, number });
    }
    return;
  }

  if (!(useSettingsStore.getState().settings.ui?.layoutV3 ?? false)) {
    try {
      await openPrDetail({ owner, repo, number });
    } catch {
      // openPrDetail logs the failure.
    }
    return;
  }

  const ui = useUiStore.getState();
  const top = selectTopView(ui);
  ui.selectPrKey(`${owner}/${repo}#${number}`, number);
  const view = prDetailView(target);
  if (top.kind === 'pr-detail' && samePr(top, target)) {
    // Already showing: at most switch the tab, in place.
    if (target.tab !== undefined && top.initialTab !== target.tab) ui.replaceView(view);
    return;
  }

  const replacing = top.kind === 'pr-detail';
  if (!replacing) {
    focusBeforePush.push(typeof document === 'undefined' ? null : document.activeElement);
  }
  await navigate('push', () => {
    const state = useUiStore.getState();
    if (state.activeSection !== 'prs' && !target.keepSection) state.setActiveSection('prs');
    if (replacing) state.replaceView(view);
    else state.pushView(view);
  });
}

/**
 * Open a work item in the main window's full-screen detail view
 * (plans/ui-overhaul-workbench.md, phase 5). Selects its row first, so the
 * row's title carries the view-transition name in the old snapshot and
 * morphs into the header. A work item already on top is replaced, not
 * stacked; the same one is left alone. The section does not change, so Back
 * returns to the list the item was opened from.
 */
export async function showWorkItem(id: number): Promise<void> {
  const ui = useUiStore.getState();
  ui.setWorkItemsSelectedId(id);
  const top = selectTopView(ui);
  if (top.kind === 'work-item-detail' && top.id === id) return;
  const view: MainView = { kind: 'work-item-detail', id };
  const replacing = top.kind === 'work-item-detail';
  if (!replacing) {
    focusBeforePush.push(typeof document === 'undefined' ? null : document.activeElement);
  }
  await navigate('push', () => {
    const state = useUiStore.getState();
    if (replacing) state.replaceView(view);
    else state.pushView(view);
  });
}

/** True when `document.startViewTransition` exists, so push and pop use it. */
export function supportsViewTransitions(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition ===
      'function'
  );
}

/**
 * True when something on top of the main window owns the keyboard: Quick
 * Review, a dialog, a menu or a listbox. Elements inside an inert layer (the
 * list while a detail view is showing, a section fading out) do not count.
 * `Esc` / `Alt+Left` in ViewStack and the single-key shortcuts in
 * useKeyboardNav stand down while this is true.
 */
export function isOverlayOpen(): boolean {
  if (useQuickReviewStore.getState().state !== 'idle') return true;
  if (typeof document === 'undefined') return false;
  for (const el of document.querySelectorAll(
    '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
  )) {
    if (!el.closest('[inert]')) return true;
  }
  return false;
}
