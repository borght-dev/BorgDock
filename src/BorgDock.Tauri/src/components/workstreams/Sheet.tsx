import clsx from 'clsx';
import { FocusTrap } from 'focus-trap-react';
import { type ReactNode, useEffect, useId } from 'react';

interface SheetProps {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
  className?: string;
}

/**
 * Sheet — a modal over the main window for one workstream task: adding
 * records, confirming an outcome, a decision, a merge. Esc and the backdrop
 * close it; focus stays inside while it is open and goes back on close.
 */
export function Sheet({ title, subtitle, onClose, children, footer, wide, className }: SheetProps) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Claim the key: Esc closes the sheet, not the view under it.
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <FocusTrap
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: false,
        returnFocusOnDeactivate: true,
        tabbableOptions: { displayCheck: 'none' },
      }}
    >
      <div className="bd-modal-backdrop" role="presentation" onClick={onClose}>
        <div
          className={clsx(
            'bd-modal bd-dp-sheet bd-ws-sheet',
            wide && 'bd-ws-sheet--wide',
            className,
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="bd-dp-sheet__head">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </header>
          <div className="bd-dp-sheet__body">{children}</div>
          <footer className="bd-dp-sheet__foot">{footer}</footer>
        </div>
      </div>
    </FocusTrap>
  );
}
