import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, IconButton } from '@/components/shared/primitives';
import type { ToastPayload, ToastSeverity } from './flyout-mode';
import { TOAST_AUTOHIDE_MS } from './flyout-mode';

const SEVERITY_CONFIG: Record<
  ToastSeverity,
  { icon: string; stripe: string; glow: string; iconBg: string; iconColor: string; label: string }
> = {
  success: {
    icon: '✓',
    stripe: 'var(--color-toast-success-stripe)',
    glow: 'var(--color-toast-success-glow)',
    iconBg: 'var(--color-toast-success-icon-bg)',
    iconColor: 'var(--color-status-green)',
    label: 'Success',
  },
  error: {
    icon: '!',
    stripe: 'var(--color-toast-error-stripe)',
    glow: 'var(--color-toast-error-glow)',
    iconBg: 'var(--color-toast-error-icon-bg)',
    iconColor: 'var(--color-status-red)',
    label: 'Error',
  },
  warning: {
    icon: '⚠',
    stripe: 'var(--color-toast-warning-stripe)',
    glow: 'var(--color-toast-warning-glow)',
    iconBg: 'var(--color-toast-warning-icon-bg)',
    iconColor: 'var(--color-status-yellow)',
    label: 'Warning',
  },
  info: {
    icon: 'i',
    stripe: 'var(--color-toast-info-stripe)',
    glow: 'var(--color-toast-info-glow)',
    iconBg: 'var(--color-toast-info-icon-bg)',
    iconColor: 'var(--color-accent)',
    label: 'Info',
  },
  merged: {
    icon: '🎉',
    stripe: 'var(--color-toast-merged-stripe)',
    glow: 'var(--color-toast-merged-glow)',
    iconBg: 'var(--color-toast-merged-icon-bg)',
    iconColor: 'var(--color-toast-merged-icon-fg)',
    label: 'Merged',
  },
};

const MERGED_DISMISS_MS = 8000;

interface Props {
  queue: ToastPayload[];
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onDismiss: (id: string) => void;
  onActionClick: (toast: ToastPayload, action: string, url?: string) => void;
}

export function FlyoutToast({ queue, onHoverEnter, onHoverLeave, onDismiss, onActionClick }: Props) {
  return (
    <div
      className="flex h-screen w-screen items-end justify-end"
      style={{ background: 'transparent', padding: 16 }}
    >
      <div className="flex w-[380px] flex-col gap-2.5">
        {queue.map((toast) => (
          <FlyoutToastCard
            key={toast.id}
            toast={toast}
            onHoverEnter={onHoverEnter}
            onHoverLeave={onHoverLeave}
            onDismiss={() => onDismiss(toast.id)}
            onActionClick={(action, url) => onActionClick(toast, action, url)}
          />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  toast: ToastPayload;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onDismiss: () => void;
  onActionClick: (action: string, url?: string) => void;
}

function FlyoutToastCard({ toast, onHoverEnter, onHoverLeave, onDismiss, onActionClick }: CardProps) {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter');
  const pausedRef = useRef(false);
  const elapsedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(performance.now());
  const progressRef = useRef<HTMLDivElement>(null);

  const config = SEVERITY_CONFIG[toast.severity];
  const isMerged = toast.severity === 'merged';
  const dismissMs = isMerged ? MERGED_DISMISS_MS : TOAST_AUTOHIDE_MS;

  const handleDismiss = useCallback(() => {
    setPhase('exit');
    setTimeout(onDismiss, 280);
  }, [onDismiss]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setPhase('visible'));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      if (!pausedRef.current) {
        const dt = now - lastTickRef.current;
        elapsedRef.current += dt;
        const fraction = Math.max(0, 1 - elapsedRef.current / dismissMs);
        if (progressRef.current) {
          progressRef.current.style.transform = `scaleX(${fraction})`;
        }
        if (elapsedRef.current >= dismissMs) {
          handleDismiss();
          return;
        }
      }
      lastTickRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [dismissMs, handleDismiss]);

  const handleMouseEnter = useCallback(() => {
    pausedRef.current = true;
    onHoverEnter();
  }, [onHoverEnter]);

  const handleMouseLeave = useCallback(() => {
    pausedRef.current = false;
    lastTickRef.current = performance.now();
    onHoverLeave();
  }, [onHoverLeave]);

  const hasPrContext = !!(toast.prOwner && toast.prRepo && toast.prNumber);
  const handleCardClick = useCallback(() => {
    if (!hasPrContext) return;
    onActionClick('open-pr');
  }, [hasPrContext, onActionClick]);

  return (
    <div
      data-toast=""
      data-testid={`flyout-toast-card-${toast.id}`}
      data-notification-severity={toast.severity}
      className={clsx('relative', isMerged ? 'w-[400px]' : 'w-[380px]', hasPrContext && 'cursor-pointer')}
      style={{
        animation:
          phase === 'enter' || phase === 'visible'
            ? 'toast-slide-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
            : 'toast-slide-out 0.28s ease-in forwards',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleCardClick}
      role="alert"
      aria-live={isMerged ? 'assertive' : 'polite'}
    >
      <div
        className={clsx('absolute rounded-2xl blur-lg', isMerged ? '-inset-2' : '-inset-1')}
        style={{
          background: config.glow,
          animation: isMerged
            ? 'toast-glow-pulse 1.8s ease-in-out infinite'
            : 'toast-glow-pulse 2.5s ease-in-out infinite',
        }}
      />

      <Card
        variant="default"
        className="relative overflow-hidden rounded-xl p-0 shadow-[var(--elevation-2)]"
        style={{
          background: 'var(--color-toast-bg)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          border: isMerged
            ? `1.5px solid color-mix(in srgb, ${config.stripe} 40%, transparent)`
            : `1px solid color-mix(in srgb, ${config.stripe} 25%, transparent)`,
          boxShadow: isMerged
            ? `0 0 0 1px color-mix(in srgb, ${config.stripe} 15%, transparent), 0 0 24px -4px ${config.glow}`
            : `0 0 0 1px color-mix(in srgb, ${config.stripe} 10%, transparent)`,
        }}
      >
        {isMerged && (
          <div
            className="absolute inset-0 pointer-events-none bg-[var(--color-toast-merged-shimmer)]"
            style={{ animation: 'toast-shimmer-sweep 2s ease-in-out infinite' }}
          />
        )}

        <div
          className={clsx('w-full', isMerged ? 'h-[4px]' : 'h-[3px]')}
          style={{
            background: isMerged
              ? `linear-gradient(90deg, ${config.stripe}, color-mix(in srgb, ${config.stripe} 80%, #F5B73B), ${config.stripe})`
              : `linear-gradient(90deg, ${config.stripe}, color-mix(in srgb, ${config.stripe} 60%, transparent))`,
          }}
        />

        <div className={clsx('flex items-start gap-3', isMerged ? 'px-4 py-3.5' : 'px-3.5 py-3')}>
          <div
            className={clsx(
              'flex shrink-0 items-center justify-center font-black',
              isMerged ? 'h-11 w-11 rounded-xl text-xl' : 'h-9 w-9 rounded-lg text-sm',
            )}
            style={{
              backgroundColor: config.iconBg,
              color: config.iconColor,
              animation: isMerged
                ? 'toast-icon-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both, toast-merged-ring 1s ease-out 0.6s'
                : 'toast-icon-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both',
              border: `1px solid color-mix(in srgb, ${config.stripe} 20%, transparent)`,
            }}
          >
            {config.icon}
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <span
              className={clsx(
                'font-bold uppercase leading-none',
                isMerged ? 'text-[10px] tracking-[0.12em]' : 'text-[9px] tracking-[0.08em]',
              )}
              style={{ color: config.iconColor }}
            >
              {isMerged ? '🚀 Merged' : config.label}
            </span>

            <div
              className={clsx(
                'mt-0.5 font-semibold leading-snug line-clamp-2 text-[var(--color-text-primary)]',
                isMerged ? 'text-[14px]' : 'text-[13px]',
              )}
            >
              {toast.title}
            </div>

            <div className="mt-0.5 text-[11px] leading-relaxed line-clamp-2 text-[var(--color-text-tertiary)]">
              {toast.body}
            </div>

            {toast.actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {toast.actions.map((a) => (
                  <button
                    key={`${toast.id}-${a.action}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onActionClick(a.action, a.url);
                    }}
                    className="rounded-md px-2.5 py-1 text-[11px] font-semibold bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] border border-[var(--color-subtle-border)]"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <IconButton
            size={22}
            icon={
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            }
            aria-label="Dismiss"
            data-testid="dismiss-flyout-toast"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
          />
        </div>

        <div className="h-[2px]" style={{ background: 'var(--color-badge-progress-track)' }}>
          <div
            ref={progressRef}
            className="h-full origin-left"
            style={{
              background: isMerged
                ? `linear-gradient(90deg, ${config.stripe}, color-mix(in srgb, ${config.stripe} 80%, #F5B73B), ${config.stripe})`
                : `linear-gradient(90deg, ${config.stripe}, color-mix(in srgb, ${config.stripe} 70%, transparent))`,
              transform: 'scaleX(1)',
            }}
          />
        </div>
      </Card>
    </div>
  );
}
