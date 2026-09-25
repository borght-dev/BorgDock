import { type RefObject, useEffect, useRef } from 'react';
import { isOverlayOpen } from '@/services/navigation';

/** Key → handler. A handler that returns `false` leaves the key alone. */
export type DetailKeyMap = Record<string, () => unknown>;

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
 * useDetailViewKeys — single-key shortcuts of a detail view pushed on the
 * main window's view stack (plans/ui-overhaul-workbench.md, section 7: `J` /
 * `K` switch tabs, `R` reruns failed checks, `F` fixes with Claude).
 *
 * A key counts only when the view is the one on screen (`root` is connected
 * and not inside an inert or aria-hidden layer, which a covered or leaving
 * view is), no modifier but Shift is held, it is not a repeat, focus is not
 * in a text field, and no menu, dialog or Quick Review owns the keyboard.
 * The map is read at key time, so handlers may close over fresh state.
 */
export function useDetailViewKeys(
  root: RefObject<HTMLElement | null>,
  keys: DetailKeyMap,
  enabled = true,
): void {
  const keysRef = useRef(keys);
  keysRef.current = keys;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = root.current;
      if (!el?.isConnected || el.closest('[inert], [aria-hidden="true"]')) return;
      if (isEditable(e.target) || isEditable(document.activeElement)) return;
      if (isOverlayOpen()) return;
      const handler = keysRef.current[e.key];
      if (!handler) return;
      if (handler() === false) return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [root, enabled]);
}
