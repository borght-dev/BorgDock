import clsx from 'clsx';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

interface PrPopoverProps {
  /** The button that opened it: placement, and focus returns there on close. */
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** `menu` for a list of choices, `dialog` for a panel of controls. */
  role: 'menu' | 'dialog';
  label: string;
  /** Which edge of the anchor it lines up with. */
  align?: 'start' | 'end';
  width?: number;
  className?: string;
  children: ReactNode;
}

const GAP = 6;
const MARGIN = 8;

/**
 * PrPopover — the Pull requests list's floating panels (group, sort,
 * display, filter, save view): portalled to the body under its anchor,
 * closed by Esc (focus goes back to the anchor), a click outside, the window
 * losing focus or a resize. It is only in the DOM while open, so the list's
 * single-key shortcuts stand down exactly then (`isOverlayOpen` looks for
 * `role="menu"` and `role="dialog"`).
 */
export function PrPopover({
  anchor,
  onClose,
  role,
  label,
  align = 'end',
  width = 240,
  className,
  children,
}: PrPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  // The latest onClose, so the listeners below are set up once per opening.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const viewport = typeof window === 'undefined' ? 1024 : window.innerWidth;
    const preferred = align === 'end' ? rect.right - width : rect.left;
    const left = Math.max(MARGIN, Math.min(preferred, viewport - width - MARGIN));
    setPosition({ top: rect.bottom + GAP, left });
  }, [anchor, align, width]);

  useEffect(() => {
    const first =
      ref.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      ref.current?.querySelector<HTMLElement>('input, button:not([disabled])');
    first?.focus();
    const close = () => onCloseRef.current();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !anchor.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Esc closes the panel, not the view or the list selection.
      event.preventDefault();
      event.stopPropagation();
      close();
      anchor.current?.focus();
    };
    const onBlur = () => close();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      role={role}
      aria-label={label}
      className={clsx('bd-prl-pop', className)}
      // Off screen until placed, still focusable.
      style={{ width, ...(position ?? { top: -9999, left: -9999 }) }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Open state for a popover and the ref of the button that opens it. */
export function usePopover<T extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<T>(null);
  const close = useRef(() => setOpen(false)).current;
  return { open, setOpen, toggle: () => setOpen((was) => !was), close, anchor };
}
