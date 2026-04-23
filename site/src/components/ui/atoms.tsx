import type { PillVariant, StatusKind } from './types';

/* --- StatusDot --- */

interface StatusDotProps {
  status?: StatusKind;
  size?: number;
}

const STATUS_COLOR: Record<StatusKind, string> = {
  green: 'var(--color-status-green)',
  red: 'var(--color-status-red)',
  yellow: 'var(--color-status-yellow)',
  gray: 'var(--color-status-gray)',
};

export function StatusDot({ status = 'green', size = 8 }: StatusDotProps) {
  const color = STATUS_COLOR[status];
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: status === 'red' ? `0 0 0 3px ${color}22` : 'none',
      }}
    />
  );
}

/* --- Avatar --- */

interface AvatarProps {
  initials: string;
  mine?: boolean;
  size?: number;
}

export function Avatar({ initials, mine = false, size = 20 }: AvatarProps) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 600,
        color: 'white',
        flexShrink: 0,
        background: mine ? '#1D9E75' : '#534AB7',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {initials}
    </span>
  );
}

/* --- BranchChip --- */

export function BranchChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-code)',
        fontSize: 11,
        padding: '1px 6px',
        borderRadius: 4,
        background: 'var(--color-surface-raised)',
        color: 'var(--color-text-secondary)',
      }}
    >
      {children}
    </span>
  );
}

/* --- Pill --- */

interface PillProps {
  variant?: PillVariant;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

const PILL_TOKENS: Record<PillVariant, [bg: string, fg: string, border: string]> = {
  success: [
    'var(--color-success-badge-bg)',
    'var(--color-success-badge-fg)',
    'var(--color-success-badge-border)',
  ],
  warning: [
    'var(--color-warning-badge-bg)',
    'var(--color-warning-badge-fg)',
    'var(--color-warning-badge-border)',
  ],
  error: [
    'var(--color-error-badge-bg)',
    'var(--color-error-badge-fg)',
    'var(--color-error-badge-border)',
  ],
  accent: [
    'var(--color-accent-subtle)',
    'var(--color-accent)',
    'var(--color-purple-border)',
  ],
};

export function Pill({ variant = 'success', children, icon = null }: PillProps) {
  const [bg, fg, border] = PILL_TOKENS[variant];
  return (
    <span
      className="prdock-pill"
      style={{ background: bg, color: fg, borderColor: border }}
    >
      {icon}
      {children}
    </span>
  );
}

/* --- WorktreeBadge --- */

export function WorktreeBadge({ slot }: { slot: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 9999,
        fontFamily: 'var(--font-code)',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--color-accent)',
        background: 'var(--color-accent-subtle)',
        border: '1px solid var(--color-purple-border)',
      }}
    >
      <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M4 2v12M12 8c0-3-2-4-4-4" />
      </svg>
      {slot}
    </span>
  );
}

/* --- IconBtn --- */

interface IconBtnProps {
  children: React.ReactNode;
  label?: string;
}

export function IconBtn({ children, label }: IconBtnProps) {
  return (
    <button
      type="button"
      aria-label={label}
      style={{
        background: 'transparent',
        border: 0,
        width: 22,
        height: 22,
        borderRadius: 5,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-tertiary)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
