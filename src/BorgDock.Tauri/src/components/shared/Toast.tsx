import clsx from 'clsx';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { type ToastTone, useToastStore, visibleToasts } from '@/stores/toast-store';

export interface ToastProps {
  message: ReactNode;
  tone?: ToastTone;
  leading?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

/**
 * Toast — one message with an optional action ("Undo") and a close button.
 * It slides up 16 px and fades in (`--motion-base`, `--ease-out`; instant
 * under reduced motion). Errors are announced assertively, the rest politely.
 */
export function Toast({
  message,
  tone = 'info',
  leading,
  actionLabel,
  onAction,
  onDismiss,
}: ToastProps) {
  return (
    <div
      className={clsx('bd-toast', `bd-toast--${tone}`)}
      data-toast=""
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {leading}
      <span className="bd-toast__message">{message}</span>
      {actionLabel && onAction && (
        <button type="button" className="bd-toast__action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className="bd-toast__close"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          <X size={12} strokeWidth={2.25} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * ToastViewport — the bottom-right stack of the store's toasts
 * (`stores/toast-store`), newest at the bottom, at most three drawn
 * (`visibleToasts`: toasts with an action stay in view). The polite live
 * region is always mounted, so screen readers hear the first toast too.
 * Mount once per window.
 */
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const act = useToastStore((s) => s.act);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="bd-toasts" aria-live="polite" data-toast-viewport="">
      {visibleToasts(toasts).map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          tone={toast.tone}
          leading={toast.leading}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction ? () => act(toast.id) : undefined}
          onDismiss={toast.dismissible === false ? undefined : () => dismiss(toast.id)}
        />
      ))}
    </div>
  );
}
