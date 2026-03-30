import { useCallback, useEffect } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  const handleConfirm = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onConfirm();
    },
    [onConfirm],
  );

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onCancel();
    },
    [onCancel],
  );

  if (!isOpen) return null;

  const confirmClasses =
    variant === 'danger'
      ? 'bg-[var(--color-action-danger-bg,#dc2626)] text-[var(--color-action-danger-fg,white)] hover:opacity-90'
      : 'bg-[var(--color-accent)] text-white hover:opacity-90';

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={handleCancel} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm rounded-xl border border-[var(--color-modal-border)] bg-[var(--color-modal-bg)] shadow-xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          <p className="mt-2 text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            {message}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={handleCancel}
              className="rounded-md border border-[var(--color-subtle-border)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
            >
              {cancelLabel}
            </button>
            <button
              onClick={handleConfirm}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${confirmClasses}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
