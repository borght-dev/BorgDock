import { type HTMLAttributes, type RefObject, useEffect, useRef, useState } from 'react';

export interface ResizableWidthOptions {
  /** `localStorage` key the width is kept under. */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** Room the rest of the container keeps; the width never takes it. */
  reserve: number;
  /** Names the separator for assistive tech: "Thread list width". */
  label: string;
  /** The width on screen when a drag starts, if CSS can draw it other than `width`. */
  measure?: () => number | undefined;
}

const STEP = 16;

/** The remembered width, or null when the user never set one. */
function readWidth({ storageKey, minWidth, maxWidth }: ResizableWidthOptions): number | null {
  try {
    const width = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(width) && width >= minWidth) return Math.min(maxWidth, width);
  } catch {}
  return null;
}

/**
 * A column width the user drags (or sets with the arrow keys, Home and End)
 * on a separator, remembered across launches; double-click resets it. The
 * width stays within its bounds and leaves `reserve` of the container.
 * `chosen` is false until the user sets a width (and again after a reset),
 * so CSS can keep its own default for narrow windows meanwhile.
 */
export function useResizableWidth(
  containerRef: RefObject<HTMLElement | null>,
  options: ResizableWidthOptions,
) {
  const { storageKey, defaultWidth, minWidth, reserve, label, measure } = options;
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [chosenWidth, setChosenWidth] = useState(() => readWidth(options));
  const preferredWidth = chosenWidth ?? defaultWidth;
  const [containerWidth, setContainerWidth] = useState(0);
  const [resizing, setResizing] = useState(false);
  const maxWidth = containerWidth
    ? Math.max(minWidth, Math.min(options.maxWidth, containerWidth - reserve))
    : options.maxWidth;
  const width = Math.max(minWidth, Math.min(maxWidth, preferredWidth));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0) setContainerWidth(container.clientWidth);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  function save(next: number) {
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {}
  }

  function change(next: number) {
    const clamped = Math.max(minWidth, Math.min(maxWidth, next));
    setChosenWidth(clamped);
    save(clamped);
  }

  function reset() {
    setChosenWidth(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }

  const separatorProps: HTMLAttributes<HTMLDivElement> = {
    role: 'separator',
    tabIndex: 0,
    'aria-label': label,
    'aria-orientation': 'vertical',
    'aria-valuemin': minWidth,
    'aria-valuemax': maxWidth,
    'aria-valuenow': width,
    title: 'Drag to resize. Double-click to reset. Arrow keys adjust width.',
    onPointerDown: (event) => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, x: event.clientX, width: measure?.() ?? width };
      setResizing(true);
    },
    onPointerMove: (event) => {
      const start = drag.current;
      if (!start || start.pointerId !== event.pointerId) return;
      setChosenWidth(Math.max(minWidth, Math.min(maxWidth, start.width + event.clientX - start.x)));
    },
    onLostPointerCapture: () => {
      if (!drag.current) return;
      drag.current = null;
      setResizing(false);
      save(width);
    },
    onDoubleClick: reset,
    onKeyDown: (event) => {
      const current = chosenWidth ?? measure?.() ?? width;
      const next = {
        ArrowLeft: current - STEP,
        ArrowRight: current + STEP,
        Home: minWidth,
        End: maxWidth,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      change(next);
    },
  };

  return { width, chosen: chosenWidth !== null, resizing, separatorProps };
}
