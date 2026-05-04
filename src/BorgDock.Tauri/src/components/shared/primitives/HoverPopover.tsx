import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface HoverPopoverProps {
  /** Trigger element. Hovering it (or the popover) keeps the popover open. */
  children: ReactNode;
  /** Content rendered inside the popover. */
  content: ReactNode;
  /** Maximum width of the popover. Default 520px. */
  maxWidth?: number;
  /** Maximum height before content scrolls. Default 360px. */
  maxHeight?: number;
  /** Delay (ms) before hiding after the cursor leaves both trigger and popover. */
  hideDelayMs?: number;
  /** Optional extra style on the trigger wrapper. */
  triggerStyle?: CSSProperties;
}

/**
 * Lightweight hover popover with smart placement. Renders into a fixed-position
 * portal (avoids `overflow: hidden` clipping on ancestor cards), flips
 * horizontally if it would overflow the viewport, and bridges the gap between
 * trigger and popover so the user can move the cursor into the content without
 * dismissing it.
 */
export function HoverPopover({
  children,
  content,
  maxWidth = 520,
  maxHeight = 360,
  hideDelayMs = 120,
  triggerStyle,
}: HoverPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number | null>(null);

  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    // Default: anchor below trigger, flushed to its left edge.
    let left = r.left;
    let top = r.bottom + margin;
    if (left + maxWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - maxWidth - margin);
    }
    if (top + maxHeight > window.innerHeight - margin) {
      // Flip above the trigger.
      top = Math.max(margin, r.top - maxHeight - margin);
    }
    setPos({ left, top });
  }, [maxWidth, maxHeight]);

  const cancelHide = () => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), hideDelayMs);
  };

  const handleEnter = () => {
    cancelHide();
    computePosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onScroll = () => computePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, computePosition]);

  useEffect(() => () => cancelHide(), []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={scheduleHide}
        onFocus={handleEnter}
        onBlur={scheduleHide}
        style={{ display: 'inline-block', ...triggerStyle }}
      >
        {children}
      </span>
      {open && pos && (
        <div
          role="tooltip"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            width: maxWidth,
            maxHeight,
            overflow: 'auto',
            zIndex: 1000,
            background: 'var(--color-card-background)',
            border: '1px solid var(--color-strong-border)',
            borderRadius: 8,
            boxShadow: '0 10px 32px rgba(0,0,0,0.35)',
            padding: '12px 14px',
            color: 'var(--color-text-primary)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
