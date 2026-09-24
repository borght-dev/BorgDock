import clsx from 'clsx';
import { type HTMLAttributes, type ReactNode, useLayoutEffect, useRef, useState } from 'react';

export type SlidingHighlightVariant = 'fill' | 'underline';

export interface SlidingHighlightProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Key of the active item. The descendant carrying a matching
   * `data-highlight-key` attribute is measured; `null` or no match hides the
   * highlight.
   */
  activeKey: string | null;
  /**
   * `fill` sits behind the active item (segmented control, rail).
   * `underline` is a 2px accent bar under it (tabs). Default `fill`.
   */
  variant?: SlidingHighlightVariant;
  /** Extra classes for the highlight element itself. */
  highlightClassName?: string;
  children: ReactNode;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function findItem(container: HTMLElement, key: string): HTMLElement | null {
  for (const el of container.querySelectorAll<HTMLElement>('[data-highlight-key]')) {
    if (el.getAttribute('data-highlight-key') === key) return el;
  }
  return null;
}

function measure(container: HTMLElement, item: HTMLElement): Box {
  const c = container.getBoundingClientRect();
  const r = item.getBoundingClientRect();
  return {
    x: r.left - c.left - container.clientLeft + container.scrollLeft,
    y: r.top - c.top - container.clientTop + container.scrollTop,
    width: r.width,
    height: r.height,
  };
}

/**
 * SlidingHighlight — wraps a row or column of items and draws one absolutely
 * placed highlight under the active one, sliding it over `--motion-move` when
 * the active item changes. Mark each item with `data-highlight-key`.
 *
 * The active item is looked up afresh on every measurement, which happens when
 * `activeKey` changes, when the container or any item resizes
 * (ResizeObserver), and when items are added or removed (MutationObserver) —
 * never per frame. The only dependency is the `activeKey` string, so it works
 * without the React Compiler's memoisation.
 *
 * The highlight does not animate when it first appears: on mount, and when the
 * matching item only mounts after `activeKey` was set, it stays hidden until
 * the item exists and then appears in place.
 */
export function SlidingHighlight({
  activeKey,
  variant = 'fill',
  highlightClassName,
  className,
  children,
  ...rest
}: SlidingHighlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The last measured box stays in place while the highlight is hidden, so
  // hiding fades it out where it was instead of sliding it to the corner.
  const [box, setBox] = useState<Box | null>(null);
  const [visible, setVisible] = useState(false);
  const shownRef = useRef<Box | null>(null);
  // True while the highlight is (re)appearing, so it is placed without a
  // transition instead of sliding in from its last position or the corner.
  const [instant, setInstant] = useState(true);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const item = activeKey === null ? null : findItem(container, activeKey);
      const next = item ? measure(container, item) : null;
      const prev = shownRef.current;
      if (sameBox(prev, next)) return;
      shownRef.current = next;
      if (next === null) {
        setVisible(false);
        return;
      }
      if (prev === null) setInstant(true);
      setBox(next);
      setVisible(true);
    };
    update();

    // Watch every item, not only the active one: a sibling whose count grows
    // shifts the active item without resizing it.
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    const observeItems = () => {
      if (!resizeObserver) return;
      resizeObserver.observe(container);
      for (const el of container.querySelectorAll('[data-highlight-key]'))
        resizeObserver.observe(el);
    };
    observeItems();

    // Items mounting, unmounting or reordering: observe the new ones and
    // re-measure (this is also how a late-mounting active item gets found).
    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            observeItems();
            update();
          });
    mutationObserver?.observe(container, { childList: true, subtree: true });

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [activeKey]);

  // Re-enable the transition one frame after an instant placement.
  useLayoutEffect(() => {
    if (!visible || !instant) return;
    const id = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(id);
  }, [visible, instant]);

  const style =
    box === null
      ? undefined
      : variant === 'underline'
        ? { width: box.width, transform: `translateX(${box.x}px)` }
        : {
            width: box.width,
            height: box.height,
            transform: `translate(${box.x}px, ${box.y}px)`,
          };

  return (
    <div ref={containerRef} className={clsx('bd-slide', className)} {...rest}>
      <span
        aria-hidden="true"
        className={clsx(
          'bd-slide__hl',
          `bd-slide__hl--${variant}`,
          !visible && 'bd-slide__hl--hidden',
          instant && 'bd-slide__hl--instant',
          highlightClassName,
        )}
        style={style}
      />
      {children}
    </div>
  );
}
