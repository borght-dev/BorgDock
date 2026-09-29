import clsx from 'clsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PrDetailView } from '@/components/pr-detail/PrDetailView';
import { WorkItemDetailView } from '@/components/work-items/WorkItemDetailView';
import { isOverlayOpen, popView, supportsViewTransitions } from '@/services/navigation';
import { type MainView, useUiStore } from '@/stores/ui-store';
import { motionMs, motionOK } from '@/utils/motion';
import { SectionView } from './SectionView';

type DetailView = Exclude<MainView, { kind: 'list' }>;

/** Mouse "back" (XButton1) as reported in `MouseEvent.button`. */
const MOUSE_BACK_BUTTON = 3;

function viewKey(view: DetailView): string {
  return view.kind === 'pr-detail'
    ? `pr:${view.owner}/${view.repo}#${view.number}`
    : `wi:${view.id}`;
}

function DetailBody({ view }: { view: DetailView }) {
  if (view.kind === 'pr-detail') {
    return (
      <PrDetailView
        owner={view.owner}
        repo={view.repo}
        number={view.number}
        initialTab={view.initialTab}
      />
    );
  }
  return <WorkItemDetailView id={view.id} />;
}

function isEditable(el: EventTarget | Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  );
}

/**
 * ViewStack — the main window's body (plans/ui-overhaul-workbench.md,
 * section 3). Renders the list (the active section) and, when a detail view
 * is pushed, that view on top of it.
 *
 * - The list stays mounted but `inert` and hidden while a detail view is
 *   showing, so its scroll position and selection survive the round trip.
 * - Push and pop go through `services/navigation`, which wraps them in
 *   `withViewTransition`. Where the View Transitions API is missing the
 *   fallback plays here: the detail slides up 12 px and fades in over
 *   `--motion-push`, and on pop it fades back down while the list returns.
 * - `Esc` (no input focused, no dialog or overlay open), `Alt+ArrowLeft`
 *   and the mouse back button pop when a detail view is showing. Focus moves
 *   into a pushed view and comes back to where it was on pop (navigation.ts).
 */
export function ViewStack() {
  const viewStack = useUiStore((s) => s.viewStack);
  const depth = viewStack.length;
  const topView = viewStack[depth - 1];
  const detail: DetailView | null = topView && topView.kind !== 'list' ? topView : null;
  const detailKey = detail ? viewKey(detail) : null;
  const fallback = !supportsViewTransitions();

  // The detail view that was just popped, kept for the fallback's exit
  // animation. Worked out while rendering (not in an effect), so the popped
  // view never leaves the tree: it stays the same mounted instance until its
  // animation ends, instead of being unmounted and mounted again.
  const [leaving, setLeaving] = useState<DetailView | null>(null);
  const [shown, setShown] = useState<{ detail: DetailView | null; depth: number }>({
    detail,
    depth,
  });
  const detailLayerRef = useRef<HTMLDivElement>(null);

  if (shown.detail !== detail || shown.depth !== depth) {
    // Only a pop that removes the view on screen animates out; a push or a
    // replace just brings the new view in. `detail` only changes identity
    // when the stack changes (the store is immutable).
    const popped =
      shown.detail !== null &&
      depth < shown.depth &&
      (detailKey === null || viewKey(shown.detail) !== detailKey);
    setShown({ detail, depth });
    setLeaving(popped && fallback && motionOK() ? shown.detail : null);
  }

  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setLeaving(null), motionMs('--motion-push', 260));
    return () => window.clearTimeout(timer);
  }, [leaving]);

  // Move focus into a newly shown detail view so keyboard users land in it
  // (focus inside the list is dropped anyway once the list turns inert).
  useLayoutEffect(() => {
    if (detailKey === null) return;
    detailLayerRef.current?.focus({ preventScroll: true });
  }, [detailKey]);

  const canPop = depth > 1;
  useEffect(() => {
    if (!canPop) return;

    // Keys that arrived while a menu, dialog or Quick Review was open. The
    // check runs in the capture phase, before any handler below can close
    // the overlay (React would have removed it by the bubble phase).
    const overlayAtKeydown = new WeakSet<KeyboardEvent>();
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (isOverlayOpen()) overlayAtKeydown.add(e);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const back =
        (e.key === 'Escape' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) ||
        (e.key === 'ArrowLeft' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey);
      if (!back) return;
      if (isEditable(e.target) || isEditable(document.activeElement)) return;
      if (overlayAtKeydown.has(e) || isOverlayOpen()) return;
      e.preventDefault();
      void popView();
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== MOUSE_BACK_BUTTON) return;
      if (isOverlayOpen()) return;
      e.preventDefault();
      void popView();
    };

    // Pop on window in the bubble phase, so document-level handlers (menus,
    // dialogs, useKeyboardNav) run first and can claim the key with
    // preventDefault; the capture listener remembers an overlay that such a
    // handler closes on the way.
    window.addEventListener('keydown', onKeyDownCapture, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('keydown', onKeyDownCapture, { capture: true });
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [canPop]);

  const exiting = leaving !== null && viewKey(leaving) !== detailKey ? leaving : null;

  return (
    <div className="bd-viewstack" data-view={topView?.kind ?? 'list'} data-depth={depth}>
      <div
        className={clsx(
          'bd-viewstack__layer',
          'bd-viewstack__list',
          detail !== null && 'bd-viewstack__list--covered',
        )}
        inert={detail !== null}
        // Focus lands here after Back when the element that had it is gone.
        tabIndex={-1}
      >
        <SectionView />
      </div>
      {exiting !== null && (
        // Same key as while it was on top: React keeps the view mounted for
        // its exit animation instead of mounting a copy (which would refetch).
        <div
          key={viewKey(exiting)}
          className="bd-viewstack__layer bd-viewstack__detail bd-viewstack__detail--leaving"
          aria-hidden="true"
          inert
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setLeaving(null);
          }}
        >
          <DetailBody view={exiting} />
        </div>
      )}
      {detail !== null && detailKey !== null && (
        <div
          key={detailKey}
          ref={detailLayerRef}
          className={clsx(
            'bd-viewstack__layer',
            'bd-viewstack__detail',
            fallback && 'bd-viewstack__detail--entering',
          )}
          data-view-key={detailKey}
          tabIndex={-1}
        >
          <DetailBody view={detail} />
        </div>
      )}
    </div>
  );
}
