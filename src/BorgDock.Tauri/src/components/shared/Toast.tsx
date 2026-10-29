import clsx from 'clsx';
import { Check, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  TOAST_DURATION_MS,
  type ToastTone,
  useToastStore,
  visibleToasts,
} from '@/stores/toast-store';

export interface ToastProps {
  title?: string;
  message: ReactNode;
  tone?: ToastTone;
  leading?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Drawn on the action button: the key that also runs it. */
  actionKey?: string;
  /** Draws the toast as a pending action whose time drains over this many ms. */
  countdownMs?: number;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onDismiss?: () => void;
}

function CloseButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      className="bd-toast__close"
      aria-label="Dismiss notification"
      onClick={onDismiss}
    >
      <X size={12} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}

/**
 * Toast — one message with an optional action ("Undo") and a close button.
 * With a `title` it is a card: an icon, the title, the message under it and
 * up to two actions below.
 * It slides up 16 px and fades in (`--motion-base`, `--ease-out`; instant
 * under reduced motion). Errors are announced assertively, the rest politely.
 */
export function Toast({
  title,
  message,
  tone = 'info',
  leading,
  actionLabel,
  onAction,
  actionKey,
  countdownMs,
  secondaryLabel,
  onSecondary,
  onDismiss,
}: ToastProps) {
  if (title) {
    const Icon = tone === 'success' ? Check : Info;
    return (
      <div
        className={clsx('bd-toast', 'bd-toast--card', `bd-toast--${tone}`)}
        data-toast=""
        data-tone={tone}
        role={tone === 'error' ? 'alert' : 'status'}
      >
        <span className="bd-toast__icon" aria-hidden="true">
          <Icon size={13} strokeWidth={2.5} />
        </span>
        <span className="bd-toast__content">
          <strong className="bd-toast__title">{title}</strong>
          <span className="bd-toast__message">{message}</span>
          {((actionLabel && onAction) || (secondaryLabel && onSecondary)) && (
            <span className="bd-toast__actions">
              {actionLabel && onAction && (
                <button type="button" className="bd-toast__action" onClick={onAction}>
                  {actionLabel}
                </button>
              )}
              {secondaryLabel && onSecondary && (
                <button
                  type="button"
                  className="bd-toast__action bd-toast__action--quiet"
                  onClick={onSecondary}
                >
                  {secondaryLabel}
                </button>
              )}
            </span>
          )}
        </span>
        {onDismiss && <CloseButton onDismiss={onDismiss} />}
      </div>
    );
  }
  return (
    <div
      className={clsx('bd-toast', `bd-toast--${tone}`)}
      data-toast=""
      data-tone={tone}
      data-countdown={countdownMs ? '' : undefined}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {leading}
      <span className="bd-toast__message">{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          className="bd-toast__action"
          aria-keyshortcuts={actionKey}
          onClick={onAction}
        >
          {actionLabel}
          {actionKey && (
            <kbd className="bd-toast__key" aria-hidden="true">
              {actionKey}
            </kbd>
          )}
        </button>
      )}
      {onDismiss && <CloseButton onDismiss={onDismiss} />}
      {countdownMs ? (
        <span
          className="bd-toast__countdown"
          style={{ animationDuration: `${countdownMs}ms` }}
          aria-hidden="true"
        />
      ) : null}
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
          title={toast.title}
          message={toast.message}
          tone={toast.tone}
          leading={toast.leading}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction ? () => act(toast.id) : undefined}
          actionKey={toast.actionKey}
          countdownMs={toast.countdown ? (toast.durationMs ?? TOAST_DURATION_MS) : undefined}
          secondaryLabel={toast.secondaryLabel}
          onSecondary={toast.onSecondary ? () => act(toast.id, 'secondary') : undefined}
          onDismiss={toast.dismissible === false ? undefined : () => dismiss(toast.id)}
        />
      ))}
    </div>
  );
}
