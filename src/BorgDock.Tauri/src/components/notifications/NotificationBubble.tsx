import { openUrl } from '@tauri-apps/plugin-opener';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InAppNotification, NotificationSeverity } from '@/types';
import { Card, IconButton, Pill } from '@/components/shared/primitives';

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

  const handleDismiss = useCallback(() => {
    setPhase('exit');
    setTimeout(onDismiss, 280);
  }, [onDismiss]);

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
  }, [dismissMs, handleDismiss]);

  const handleMouseEnter = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    pausedRef.current = false;
    lastTickRef.current = performance.now();
  }, []);

  return (
    <div
      data-toast
      data-notification-severity={severity}
      className={clsx('relative', isMerged ? 'w-[400px]' : 'w-[380px]')}
      // style: severity-driven glow color token names (--color-toast-{severity}-glow) vary per render
      style={{
        animation:
          phase === 'enter' || phase === 'visible'
            ? 'toast-slide-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
            : 'toast-slide-out 0.28s ease-in forwards',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live={isMerged ? 'assertive' : 'polite'}
    >
      {/* Outer glow — bigger and more intense for merged */}
      <div
        className={clsx('absolute rounded-2xl blur-lg', isMerged ? '-inset-2' : '-inset-1')}
        // style: severity-driven glow background — token name varies per render
        style={{
          background: config.glow,
          animation: isMerged
            ? 'toast-glow-pulse 1.8s ease-in-out infinite'
            : 'toast-glow-pulse 2.5s ease-in-out infinite',
        }}
      />

      {/* Card shell — elevation + backdrop */}
      <Card
        variant="default"
        className="relative overflow-hidden rounded-xl p-0 shadow-[var(--elevation-2)]"
        // style: severity-driven border + box-shadow — token names (--color-toast-{severity}-stripe/glow) vary per render
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
        {/* Shimmer overlay for merged — sweeps across the card */}
        {isMerged && (
          <div
            className="absolute inset-0 pointer-events-none bg-[var(--color-toast-merged-shimmer)]"
            // style: animation — no Tailwind utility for custom keyframe
            style={{
              animation: 'toast-shimmer-sweep 2s ease-in-out infinite',
            }}
          />
        )}

        {/* Top severity stripe */}
        <div
          className={clsx('w-full', isMerged ? 'h-[4px]' : 'h-[3px]')}
          // style: severity-driven stripe gradient — token names vary per render
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
              isMerged ? 'h-11 w-11 rounded-xl text-xl' : 'h-9 w-9 rounded-lg text-sm',
            )}
            // style: severity-driven icon-disc colors + border — token names vary per render
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
              // style: severity-driven label color — token name varies per render
              style={{ color: config.iconColor }}
            >
              {isMerged ? '🚀 Merged' : config.label}
            </span>

            {/* Title */}
            <div
              className={clsx(
                'mt-0.5 font-semibold leading-snug line-clamp-2 text-[var(--color-text-primary)]',
                isMerged ? 'text-[14px]' : 'text-[13px]',
              )}
            >
              {notification.title}
            </div>

            {/* Message */}
            <div
              className="mt-0.5 text-[11px] leading-relaxed line-clamp-2 text-[var(--color-text-tertiary)]"
            >
              {notification.message}
            </div>

            {/* Action buttons */}
            {notification.actions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {notification.actions.map((action, i) => (
                  <Pill key={i} tone="ghost">
                    <a
                      href={action.url}
                      onClick={(e) => {
                        e.preventDefault();
                        openUrl(action.url).catch(console.error);
                        handleDismiss();
                      }}
                    >
                      {action.label}
                    </a>
                  </Pill>
                ))}
              </div>
            )}
          </div>

          {/* Dismiss button */}
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
            data-testid="dismiss-notification"
            onClick={() => handleDismiss()}
          />
        </div>

        {/* Progress bar */}
        <div
          className="h-[2px]"
          // style: progress track background — static token but required inline for co-location with fill below
          style={{ background: 'var(--color-badge-progress-track)' }}
        >
          <div
            ref={progressRef}
            className="h-full origin-left"
            // style: severity-driven progress-fill gradient + raf-tweened transform — token names and values vary per render
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
