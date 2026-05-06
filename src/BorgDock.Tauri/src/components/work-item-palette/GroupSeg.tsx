// src/components/work-item-palette/GroupSeg.tsx
import type { ReactNode } from 'react';

export interface GroupSegProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function GroupSeg({ active, onClick, children }: GroupSegProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ? 'true' : 'false'}
      style={{
        height: 20,
        padding: '0 7px',
        fontSize: 10.5,
        fontWeight: 500,
        border: 'none',
        background: active ? 'var(--color-accent-subtle)' : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
        borderRadius: 3,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
