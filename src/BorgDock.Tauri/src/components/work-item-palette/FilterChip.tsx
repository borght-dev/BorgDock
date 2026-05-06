// src/components/work-item-palette/FilterChip.tsx
import type { ReactNode } from 'react';

export interface FilterChipProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'warning';
}

export function FilterChip({ active, onClick, children, icon, tone = 'default' }: FilterChipProps) {
  const isWarn = tone === 'warning';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ? 'true' : 'false'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 22,
        padding: '0 9px',
        fontSize: 11,
        fontWeight: 500,
        border: '1px solid',
        borderColor: active
          ? isWarn
            ? 'var(--color-warning-badge-border)'
            : 'var(--color-purple-border)'
          : 'var(--color-subtle-border)',
        background: active
          ? isWarn
            ? 'var(--color-warning-badge-bg)'
            : 'var(--color-accent-subtle)'
          : 'transparent',
        color: active
          ? isWarn
            ? 'var(--color-warning-badge-fg)'
            : 'var(--color-accent)'
          : 'var(--color-text-tertiary)',
        borderRadius: 4,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {icon}
      {children}
    </button>
  );
}
