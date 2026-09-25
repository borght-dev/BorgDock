// src/components/work-item-palette/FilterChip.tsx
import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface FilterChipProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'warning';
  /** `data-highlight-key` for the palette's SlidingHighlight. */
  highlightKey?: string;
}

/**
 * A state filter tab in the work item palette. The wash behind the active tab
 * is the palette's SlidingHighlight (`.bd-wp-filters__hl`), so the chip itself
 * only changes its text colour.
 */
export function FilterChip({
  active,
  onClick,
  children,
  icon,
  tone = 'default',
  highlightKey,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ? 'true' : 'false'}
      data-highlight-key={highlightKey}
      className={clsx(
        'bd-wp-filter',
        active && 'bd-wp-filter--on',
        tone === 'warning' && 'bd-wp-filter--warn',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
