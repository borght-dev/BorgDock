import { useEffect, useRef } from 'react';
import type { ToastPayload } from './flyout-mode';
import { TOAST_AUTOHIDE_MS } from './flyout-mode';

interface Props {
  queue: ToastPayload[];
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onExpire: () => void;
  onActionClick: (toast: ToastPayload, action: string, url?: string) => void;
}

export function FlyoutToast({ queue, onHoverEnter, onHoverLeave, onExpire, onActionClick }: Props) {
  const hoveredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (queue.length === 0) return;
    if (hoveredRef.current) return;
    timerRef.current = setTimeout(() => onExpire(), TOAST_AUTOHIDE_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [queue, onExpire]);

  return (
    <div
      className="flex h-screen w-screen items-end justify-end"
      style={{ background: 'transparent', padding: 16 }}
    >
      <div className="flex w-[320px] flex-col gap-2">
        {queue.map((toast) => (
          <div
            key={toast.id}
            data-testid={`flyout-toast-card-${toast.id}`}
            className="overflow-hidden rounded-[12px] border shadow-lg"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-strong-border)',
              boxShadow: 'var(--flyout-shadow)',
            }}
            onMouseEnter={() => {
              hoveredRef.current = true;
              if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = undefined;
              }
              onHoverEnter();
            }}
            onMouseLeave={() => {
              hoveredRef.current = false;
              timerRef.current = setTimeout(() => onExpire(), TOAST_AUTOHIDE_MS);
              onHoverLeave();
            }}
          >
            <div
              className="px-3 py-2 text-[11px] font-semibold text-white"
              style={{ background: severityColor(toast.severity) }}
            >
              {toast.title}
            </div>
            <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
              {toast.body}
            </div>
            {toast.actions.length > 0 && (
              <div
                className="flex gap-1.5 border-t px-3 py-2"
                style={{ borderColor: 'var(--color-subtle-border)' }}
              >
                {toast.actions.map((a) => (
                  <button
                    key={`${toast.id}-${a.action}`}
                    type="button"
                    onClick={() => onActionClick(toast, a.action, a.url)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-semibold"
                    style={{
                      background: 'var(--color-surface-hover)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-subtle-border)',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function severityColor(severity: ToastPayload['severity']): string {
  switch (severity) {
    case 'error':
      return 'linear-gradient(90deg,#dc2646,#b01834)';
    case 'warning':
      return 'linear-gradient(90deg,#d97706,#b05800)';
    case 'success':
      return 'linear-gradient(90deg,#05966a,#046e4e)';
    case 'info':
      return 'linear-gradient(90deg,#7c6af6,#5b45e8)';
  }
}
