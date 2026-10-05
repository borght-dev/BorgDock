import { FocusTrap } from 'focus-trap-react';
import { X } from 'lucide-react';
import { type KeyboardEventHandler, type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './primitives';
import './review-previews.css';

interface DetailDialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  actions?: ReactNode;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}

export function DetailDialog({
  title,
  children,
  onClose,
  className = '',
  actions,
  onKeyDown,
}: DetailDialogProps) {
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !root.current?.contains(event.target as Node)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  return createPortal(
    <FocusTrap
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: false,
        initialFocus: () => root.current?.querySelector<HTMLElement>('[role="dialog"]') ?? false,
        fallbackFocus: () =>
          root.current?.querySelector<HTMLElement>('[role="dialog"]') as HTMLElement,
        tabbableOptions: { displayCheck: 'none' },
      }}
    >
      <div ref={root} className={`bd-preview-overlay ${className}`} data-detail-dialog>
        <button
          type="button"
          className="bd-preview-backdrop"
          tabIndex={-1}
          aria-label={`Dismiss ${title}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        />
        <div
          className="bd-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
          }}
        >
          <header className="bd-preview-header">
            <h2 id={titleId}>{title}</h2>
            {actions}
            <IconButton
              icon={<X size={15} aria-hidden />}
              aria-label={`Close ${title}`}
              tooltip="Close"
              onClick={onClose}
            />
          </header>
          <div className="bd-preview-body">{children}</div>
        </div>
      </div>
    </FocusTrap>,
    document.body,
  );
}
