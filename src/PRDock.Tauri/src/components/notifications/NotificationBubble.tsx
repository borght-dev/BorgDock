import { useEffect, useState, useCallback, useRef } from 'react';
import clsx from 'clsx';
import type { InAppNotification, NotificationSeverity } from '@/types';

const SEVERITY_STYLES: Record<
  NotificationSeverity,
  { icon: string; barColor: string; iconBg: string; iconColor: string }
> = {
  success: {
    icon: '\u2713',
    barColor: 'var(--color-status-green)',
    iconBg: 'var(--color-action-success-bg)',
    iconColor: 'var(--color-status-green)',
  },
  error: {
    icon: '\u2715',
    barColor: 'var(--color-status-red)',
    iconBg: 'var(--color-action-danger-bg)',
    iconColor: 'var(--color-status-red)',
  },
  warning: {
    icon: '\u26A0',
    barColor: 'var(--color-status-yellow)',
    iconBg: 'var(--color-warning-badge-bg)',
    iconColor: 'var(--color-status-yellow)',
  },
  info: {
    icon: 'i',
    barColor: 'var(--color-accent)',
    iconBg: 'var(--color-accent-subtle)',
    iconColor: 'var(--color-accent)',
  },
};

const AUTO_DISMISS_MS = 5000;
const TICK_MS = 50;

export interface NotificationBubbleProps {
  notification: InAppNotification;
  onDismiss: () => void;
}

export function NotificationBubble({ notification, onDismiss }: NotificationBubbleProps) {
  const [progress, setProgress] = useState(1);
  const [isVisible, setIsVisible] = useState(false);
  const pausedRef = useRef(false);
  const elapsedRef = useRef(0);

  const severity = notification.severity;
  const styles = SEVERITY_STYLES[severity];

  // Slide-in animation
  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      elapsedRef.current += TICK_MS;
      const fraction = 1 - elapsedRef.current / AUTO_DISMISS_MS;
      setProgress(Math.max(0, fraction));
      if (elapsedRef.current >= AUTO_DISMISS_MS) {
        onDismiss();
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [onDismiss]);

  const handleMouseEnter = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    pausedRef.current = false;
  }, []);

  return (
    <div
      className={clsx(
        'w-[360px] rounded-xl overflow-hidden shadow-lg transition-transform duration-300',
        'bg-[var(--color-card-background)] border border-[var(--color-card-border)]',
        isVisible ? 'translate-x-0' : 'translate-x-[400px]'
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex">
        {/* Severity accent bar */}
        <div className="w-1 shrink-0" style={{ backgroundColor: styles.barColor }} />

        {/* Content */}
        <div className="flex flex-1 items-start gap-2.5 px-3 py-2.5">
          {/* Severity icon */}
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
            style={{ backgroundColor: styles.iconBg, color: styles.iconColor }}
          >
            {styles.icon}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--color-text-primary)] line-clamp-2">
              {notification.title}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)] line-clamp-2">
              {notification.message}
            </div>

            {/* Action buttons */}
            {notification.actions.length > 0 && (
              <div className="mt-1.5 flex gap-1.5">
                {notification.actions.map((action, i) => (
                  <a
                    key={i}
                    href={action.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      'rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors',
                      i === 0
                        ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:opacity-90'
                        : 'bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] border border-[var(--color-subtle-border)] hover:bg-[var(--color-surface-hover)]'
                    )}
                    onClick={onDismiss}
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Dismiss button */}
          <button
            className="shrink-0 rounded-md p-1 text-[var(--color-text-ghost)] hover:text-[var(--color-text-muted)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
            onClick={onDismiss}
          >
            <span className="text-xs">&#10005;</span>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[3px] bg-[var(--color-badge-progress-track)]">
        <div
          className="h-full transition-[width] ease-linear"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: styles.barColor,
            transitionDuration: `${TICK_MS}ms`,
          }}
        />
      </div>
    </div>
  );
}
