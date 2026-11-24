import clsx from 'clsx';
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Space between the rail and the card, and the least distance to the window edge. */
const GAP = 8;

export interface RailFlyoutProps {
  /** Accessible name of the trigger and of the card it opens. */
  label: string;
  /** Class on the trigger button. */
  className?: string;
  /** Card width in px. */
  width?: number;
  /** The card. `close` closes the flyout, for actions that leave the main window. */
  card: (close: () => void) => ReactNode;
  /** Trigger content. A button holds it, so it takes no interactive elements. */
  children: ReactNode;
  /** Starts open, for stories and screenshots. */
  defaultOpen?: boolean;
}

interface Position {
  left: number;
  top: number;
}

function railEdge(trigger: HTMLElement): number {
  const rail = trigger.closest('.bd-rail') ?? trigger;
  return rail.getBoundingClientRect().right + GAP;
}

/**
 * RailFlyout — a rail block that opens a card beside the rail: the trigger is
 * one button, the card a dialog in a portal, level with the trigger and kept
 * inside the window. Outside clicks, Escape, a resize and the window losing
 * focus close it.
 */
export function RailFlyout({
  label,
  className,
  width = 340,
  card,
  children,
  defaultOpen = false,
}: RailFlyoutProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const trigger = triggerRef.current;
    const element = cardRef.current;
    if (!trigger || !element) return;
    const rect = trigger.getBoundingClientRect();
    const lowest = window.innerHeight - element.offsetHeight - GAP;
    setPosition({ left: railEdge(trigger), top: Math.max(GAP, Math.min(rect.top, lowest)) });
    element.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (cardRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={clsx('bd-rail__flyout', className)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            className="bd-railcard-layer"
            data-rail-flyout={label}
            style={{
              width,
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }}
          >
            {card(close)}
          </div>,
          document.body,
        )}
    </>
  );
}

export interface RailCardProps {
  title: ReactNode;
  /** Right of the title: "checked 40 s ago", "since 09:12". */
  meta?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** The card a rail block opens: a title row, a body that scrolls, and a footer. */
export function RailCard({ title, meta, footer, children }: RailCardProps) {
  return (
    <section className="bd-railcard">
      <header className="bd-railcard__head">
        <h2 className="bd-railcard__title">{title}</h2>
        {meta && <span className="bd-railcard__meta">{meta}</span>}
      </header>
      <div className="bd-railcard__body">{children}</div>
      {footer && <footer className="bd-railcard__foot">{footer}</footer>}
    </section>
  );
}
