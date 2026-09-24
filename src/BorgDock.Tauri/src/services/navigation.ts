import { flushSync } from 'react-dom';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { type ActiveSection, type MainView, useUiStore } from '@/stores/ui-store';
import { withViewTransition } from '@/utils/motion';

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
