import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InAppNotification, NotificationSeverity } from '@/types';

const SEVERITY_CONFIG: Record<
  NotificationSeverity,
  {
    icon: string;
    stripe: string;
    glow: string;
    iconBg: string;
    iconColor: string;
    label: string;
  }
> = {
  success: {
    icon: '\u2713',
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
    icon: '\u26A0',
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

const AUTO_DISMISS_MS = 6000;
const MERGED_DISMISS_MS = 8000;

export interface NotificationBubbleProps {
  notification: InAppNotification;
  onDismiss: () => void;
}

export function NotificationBubble({ notification, onDismiss }: NotificationBubbleProps) {
  const [phase, setPhase] = useState<'enter' | 'visible' | 'exit'>('enter');
  const pausedRef = useRef(false);
  const elapsedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(performance.now());
  const progressRef = useRef<HTMLDivElement>(null);

  const severity = notification.severity;
  const config = SEVERITY_CONFIG[severity];
  const isMerged = severity === 'merged';
  const dismissMs = isMerged ? MERGED_DISMISS_MS : AUTO_DISMISS_MS;

  // Slide-in on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setPhase('visible'));
    return () => cancelAnimationFrame(t);
  }, []);

  // rAF-based progress bar + auto dismiss
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
  }, []);

  const handleDismiss = useCallback(() => {
    setPhase('exit');
    setTimeout(onDismiss, 280);
  }, [onDismiss]);

  const handleMouseEnter = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    pausedRef.current = false;
    lastTickRef.current = performance.now();
  }, []);

  return (
    <div
      className={clsx('relative', isMerged ? 'w-[400px]' : 'w-[380px]')}
      style={{
        animation:
          phase === 'enter' || phase === 'visible'
            ? 'toast-slide-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
            : 'toast-slide-out 0.28s ease-in forwards',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Outer glow — bigger and more intense for merged */}
      <div
        className={clsx(
          'absolute rounded-2xl blur-lg',
          isMerged ? '-inset-2' : '-inset-1',
        )}
        style={{
          background: config.glow,
          animation: isMerged
            ? 'toast-glow-pulse 1.8s ease-in-out infinite'
            : 'toast-glow-pulse 2.5s ease-in-out infinite',
        }}
      />

      {/* Card */}
      <div
        className="relative overflow-hidden rounded-xl"
        style={{
          background: 'var(--color-toast-bg)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          border: isMerged
            ? `1.5px solid color-mix(in srgb, ${config.stripe} 40%, transparent)`
            : `1px solid color-mix(in srgb, ${config.stripe} 25%, transparent)`,
          boxShadow: isMerged
            ? `0 12px 40px -4px rgba(0,0,0,0.22), 0 0 0 1px color-mix(in srgb, ${config.stripe} 15%, transparent), 0 0 24px -4px ${config.glow}`
            : `0 8px 32px -4px rgba(0,0,0,0.18), 0 0 0 1px color-mix(in srgb, ${config.stripe} 10%, transparent)`,
        }}
      >
        {/* Shimmer overlay for merged — sweeps across the card */}
        {isMerged && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'var(--color-toast-merged-shimmer)',
              animation: 'toast-shimmer-sweep 2s ease-in-out infinite',
            }}
          />
        )}

        {/* Top severity stripe */}
        <div
          className={clsx('w-full', isMerged ? 'h-[4px]' : 'h-[3px]')}
          style={{
            background: isMerged
              ? `linear-gradient(90deg, ${config.stripe}, color-mix(in srgb, ${config.stripe} 80%, #F5B73B), ${config.stripe})`
              : `linear-gradient(90deg, ${config.stripe}, color-mix(in srgb, ${config.stripe} 60%, transparent))`,
          }}
        />

        <div className={clsx('flex items-start gap-3', isMerged ? 'px-4 py-3.5' : 'px-3.5 py-3')}>
          {/* Severity icon */}
          <div
            className={clsx(
              'flex shrink-0 items-center justify-center font-black',
              isMerged
                ? 'h-11 w-11 rounded-xl text-xl'
                : 'h-9 w-9 rounded-lg text-sm',
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

          {/* Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            {/* Severity label */}
            <span
              className={clsx(
                'font-bold uppercase leading-none',
                isMerged ? 'text-[10px] tracking-[0.12em]' : 'text-[9px] tracking-[0.08em]',
              )}
              style={{ color: config.iconColor }}
            >
              {isMerged ? '🚀 Merged' : config.label}
            </span>

            {/* Title */}
            <div
              className={clsx(
                'mt-0.5 font-semibold leading-snug line-clamp-2',
                isMerged ? 'text-[14px]' : 'text-[13px]',
              )}
              style={{ color: 'var(--color-text-primary)' }}
            >
              {notification.title}
            </div>

            {/* Message */}
            <div
              className="mt-0.5 text-[11px] leading-relaxed line-clamp-2"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {notification.message}
            </div>

            {/* Action buttons */}
            {notification.actions.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                {notification.actions.map((action, i) => (
                  <a
                    key={i}
                    href={action.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      'rounded-md px-2.5 py-1 text-[10px] font-semibold transition-all duration-150',
                      i === 0
                        ? 'hover:brightness-110 hover:shadow-md'
                        : 'hover:brightness-110',
                    )}
                    style={
                      i === 0
                        ? {
                            background: config.stripe,
                            color: '#fff',
                            boxShadow: `0 2px 8px -2px color-mix(in srgb, ${config.stripe} 50%, transparent)`,
                          }
                        : {
                            background: 'var(--color-surface-raised)',
                            color: 'var(--color-text-secondary)',
                            border: '1px solid var(--color-subtle-border)',
                          }
                    }
                    onClick={() => handleDismiss()}
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Dismiss button */}
          <button
            className="shrink-0 rounded-md p-1.5 transition-all duration-150 hover:scale-110"
            style={{
              color: 'var(--color-text-muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-primary)';
              e.currentTarget.style.background = 'var(--color-icon-btn-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-muted)';
              e.currentTarget.style.background = 'transparent';
            }}
            onClick={() => handleDismiss()}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
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
      </div>
    </div>
  );
}
