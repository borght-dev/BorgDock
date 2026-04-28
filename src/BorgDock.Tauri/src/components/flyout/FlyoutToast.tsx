import { useEffect, useRef } from 'react';
import { Pill, type PillTone } from '@/components/shared/primitives';
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
      // style: transparent background required for Tauri transparent-window overlay; padding in px avoids Tailwind rounding
      style={{ background: 'transparent', padding: 16 }}
    >
      <div className="flex w-[320px] flex-col gap-2">
        {queue.map((toast) => (
          <div
            key={toast.id}
            data-toast=""
            data-testid={`flyout-toast-card-${toast.id}`}
            className="overflow-hidden rounded-[12px] border shadow-lg"
            // style: flyout-shadow custom property — no Tailwind shadow utility maps to this design token
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
              className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-[var(--color-text-primary)]"
            >
              <Pill tone={severityTone(toast.severity)}>{toast.severity}</Pill>
              <span>{toast.title}</span>
            </div>
            <div className="px-3 py-2 text-[12px] text-[var(--color-text-primary)]">
              {toast.body}
            </div>
            {toast.actions.length > 0 && (
              <div
                className="flex gap-1.5 border-t px-3 py-2 border-[var(--color-subtle-border)]"
              >
                {toast.actions.map((a) => (
                  <button
                    key={`${toast.id}-${a.action}`}
                    type="button"
                    onClick={() => onActionClick(toast, a.action, a.url)}
                    className="rounded-md px-2.5 py-1 text-[11px] font-semibold bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] border border-[var(--color-subtle-border)]"
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

function severityTone(severity: ToastPayload['severity']): PillTone {
  switch (severity) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'success':
      return 'success';
    case 'info':
    default:
      return 'neutral';
  }
}
