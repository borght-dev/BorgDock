import { type ReactNode, useEffect, useRef, useState } from 'react';

const WIDTH_KEY = 'borgdock-dispatch-list-width';
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 260;
const MAX_WIDTH = 760;
const DETAIL_MIN_WIDTH = 320;
const DIVIDER_WIDTH = 6;

function readWidth(): number {
  try {
    const width = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(width) && width >= MIN_WIDTH) return Math.min(MAX_WIDTH, width);
  } catch {}
  return DEFAULT_WIDTH;
}

export function DispatchListSplit({
  list,
  detail,
  hidden,
}: {
  list: ReactNode;
  detail: ReactNode;
  hidden: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const [preferredWidth, setPreferredWidth] = useState(readWidth);
  const [containerWidth, setContainerWidth] = useState(0);
  const [resizing, setResizing] = useState(false);
  const maxWidth = containerWidth
    ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, containerWidth - DETAIL_MIN_WIDTH - DIVIDER_WIDTH))
    : MAX_WIDTH;
  const width = Math.max(MIN_WIDTH, Math.min(maxWidth, preferredWidth));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0) setContainerWidth(container.clientWidth);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function saveWidth(next: number) {
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {}
  }

  function changeWidth(next: number) {
    const clamped = Math.max(MIN_WIDTH, Math.min(maxWidth, next));
    setPreferredWidth(clamped);
    saveWidth(clamped);
  }

  return (
    <div
      ref={containerRef}
      className="bd-dp-split"
      hidden={hidden}
      data-resizing={resizing}
      style={{ gridTemplateColumns: `${width}px ${DIVIDER_WIDTH}px minmax(0, 1fr)` }}
    >
      {list}
      <div
        className="bd-dp-divider"
        role="separator"
        tabIndex={0}
        aria-label="Thread list width"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        title="Drag to resize. Double-click to reset. Arrow keys adjust width."
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, x: event.clientX, width };
          setResizing(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.pointerId !== event.pointerId) return;
          setPreferredWidth(
            Math.max(MIN_WIDTH, Math.min(maxWidth, start.width + event.clientX - start.x)),
          );
        }}
        onLostPointerCapture={() => {
          if (!drag.current) return;
          drag.current = null;
          setResizing(false);
          saveWidth(width);
        }}
        onDoubleClick={() => changeWidth(DEFAULT_WIDTH)}
        onKeyDown={(event) => {
          const next = {
            ArrowLeft: width - 16,
            ArrowRight: width + 16,
            Home: MIN_WIDTH,
            End: maxWidth,
          }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          event.stopPropagation();
          changeWidth(next);
        }}
      />
      {detail}
    </div>
  );
}
