import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

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
  disabled?: boolean;
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
  disabled = false,
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
    const width = Math.min(maxWidth, window.innerWidth - margin * 2);
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin);
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
    if (disabled) return;
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

  // Run cancelHide once on unmount; cancelHide is stable for the life of the
  // component (defined via useRef + closure), so adding it to deps is harmless
  // but biome insists.
  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount-only cleanup
  useEffect(() => () => cancelHide(), []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={scheduleHide}
        onFocus={handleEnter}
        onBlur={() => {
          cancelHide();
          setOpen(false);
        }}
        style={{ display: 'inline-block', ...triggerStyle }}
      >
        {children}
      </span>
      {open &&
        !disabled &&
        pos &&
        createPortal(
          <div
            role="tooltip"
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: Math.min(maxWidth, window.innerWidth - 16),
              maxHeight: Math.min(maxHeight, window.innerHeight - 16),
              overflow: 'auto',
              zIndex: 1000,
              background: 'var(--color-card-background)',
              border: '1px solid var(--color-strong-border)',
              borderRadius: 8,
              boxShadow: 'var(--elevation-2)',
              padding: '12px 14px',
              color: 'var(--color-text-primary)',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
