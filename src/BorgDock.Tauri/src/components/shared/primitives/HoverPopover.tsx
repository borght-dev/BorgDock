import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

/** Space between trigger and popover, and the least distance to the window edge. */
const GAP = 8;
/** How far from the trigger's left edge the tooltip's arrow points. */
const ARROW_INSET = 16;
/** The arrow never sits closer than this to the tooltip's corner. */
const ARROW_EDGE = 12;
const TOOLTIP_DELAY_MS = 300;

export interface HoverPopoverProps {
  /** Trigger element. Hovering it (or the popover) keeps the popover open. */
  children: ReactNode;
  /** Content rendered inside the popover. */
  content: ReactNode;
  /** Maximum width of the popover. Default 520px. */
  maxWidth?: number;
  /** Maximum height before a panel's content scrolls. Default 360px. */
  maxHeight?: number;
  /** Delay (ms) before hiding after the cursor leaves both trigger and popover. */
  hideDelayMs?: number;
  /**
   * Delay (ms) before showing once the cursor rests on the trigger. Default 0
   * for a panel, 300 for a tooltip, so passing over one doesn't flash it.
   */
  showDelayMs?: number;
  /**
   * Shows only when this holds for the trigger as it opens. Pass
   * {@link isTextClipped} to explain text cut off with an ellipsis.
   */
  when?: (trigger: HTMLElement) => boolean;
  /**
   * `panel` (default): a card for rich content. `tooltip`: compact, as wide
   * as its content, with an arrow pointing at the trigger.
   */
  variant?: 'panel' | 'tooltip';
  /** Class on the trigger wrapper. With one, the class sets its display instead of `inline-block`. */
  triggerClassName?: string;
  /** Optional extra style on the trigger wrapper. */
  triggerStyle?: CSSProperties;
  disabled?: boolean;
}

/** True when the trigger's `[data-clip]` text, or the trigger itself, is cut off. */
export function isTextClipped(trigger: HTMLElement): boolean {
  const text = trigger.querySelector<HTMLElement>('[data-clip]') ?? trigger;
  return text.scrollWidth > text.clientWidth;
}

interface Placement {
  left: number;
  top: number;
  above: boolean;
  arrowX: number;
}

const PANEL_STYLE: CSSProperties = {
  overflow: 'auto',
  background: 'var(--color-card-background)',
  border: '1px solid var(--color-strong-border)',
  borderRadius: 8,
  boxShadow: 'var(--elevation-2)',
  padding: '12px 14px',
  color: 'var(--color-text-primary)',
  fontSize: 13,
  lineHeight: 1.5,
};

/**
 * Lightweight hover popover with smart placement. Renders into a fixed-position
 * portal (avoids `overflow: hidden` clipping on ancestor cards), stays inside
 * the window horizontally, flips above the trigger when it doesn't fit below,
 * and bridges the gap between trigger and popover so the user can move the
 * cursor into the content without dismissing it.
 */
export function HoverPopover({
  children,
  content,
  maxWidth = 520,
  maxHeight = 360,
  hideDelayMs = 120,
  variant = 'panel',
  showDelayMs = variant === 'tooltip' ? TOOLTIP_DELAY_MS : 0,
  when,
  triggerClassName,
  triggerStyle,
  disabled = false,
}: HoverPopoverProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const showTimer = useRef<number | null>(null);

  // Placed from the popover's measured size, before it paints.
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;
    const r = trigger.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = popover;
    const left = Math.max(GAP, Math.min(r.left, window.innerWidth - width - GAP));
    const above = r.bottom + GAP + height > window.innerHeight - GAP;
    const top = above ? Math.max(GAP, r.top - GAP - height) : r.bottom + GAP;
    const pointAt = r.left + Math.min(ARROW_INSET, r.width / 2) - left;
    const arrowX = Math.max(ARROW_EDGE, Math.min(pointAt, width - ARROW_EDGE));
    setPlacement({ left, top, above, arrowX });
  }, []);

  const clearTimer = (timer: { current: number | null }) => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const close = () => {
    clearTimer(showTimer);
    clearTimer(hideTimer);
    setOpen(false);
    setPlacement(null);
  };

  const scheduleHide = () => {
    clearTimer(showTimer);
    clearTimer(hideTimer);
    hideTimer.current = window.setTimeout(close, hideDelayMs);
  };

  const show = () => {
    const trigger = triggerRef.current;
    if (disabled || !trigger || (when && !when(trigger))) return;
    setOpen(true);
  };

  const handleEnter = () => {
    if (disabled) return;
    clearTimer(hideTimer);
    if (open) return;
    clearTimer(showTimer);
    if (showDelayMs > 0) showTimer.current = window.setTimeout(show, showDelayMs);
    else show();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    close();
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  // Clear both timers once on unmount; the refs outlive every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount-only cleanup
  useEffect(
    () => () => {
      clearTimer(showTimer);
      clearTimer(hideTimer);
    },
    [],
  );

  const tooltip = variant === 'tooltip';
  const position: CSSProperties = {
    position: 'fixed',
    left: placement?.left ?? 0,
    top: placement?.top ?? 0,
    zIndex: 1000,
    visibility: placement ? undefined : 'hidden',
  };

  return (
    <>
      <span
        ref={triggerRef}
        className={triggerClassName}
        onMouseEnter={handleEnter}
        onMouseLeave={scheduleHide}
        onFocus={handleEnter}
        onBlur={close}
        onKeyDown={handleKeyDown}
        style={triggerClassName ? triggerStyle : { display: 'inline-block', ...triggerStyle }}
      >
        {children}
      </span>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            className={tooltip ? 'bd-tooltip' : undefined}
            data-side={tooltip ? (placement?.above ? 'above' : 'below') : undefined}
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={() => clearTimer(hideTimer)}
            onMouseLeave={scheduleHide}
            style={
              tooltip
                ? ({
                    ...position,
                    maxWidth: Math.min(maxWidth, window.innerWidth - GAP * 2),
                    '--bd-tooltip-arrow-x': `${placement?.arrowX ?? ARROW_INSET}px`,
                  } as CSSProperties)
                : {
                    ...position,
                    ...PANEL_STYLE,
                    width: Math.min(maxWidth, window.innerWidth - GAP * 2),
                    maxHeight: Math.min(maxHeight, window.innerHeight - GAP * 2),
                  }
            }
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
