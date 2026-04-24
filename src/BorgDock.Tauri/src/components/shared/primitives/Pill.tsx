import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export type PillTone = 'success' | 'warning' | 'error' | 'neutral' | 'draft' | 'ghost';

export interface PillProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Semantic tone — drives the background/foreground/border triple. */
  tone: PillTone;
  /** Optional leading icon rendered before the children. */
  icon?: ReactNode;
  /** Pill label. */
  children: ReactNode;
}

/**
 * Pill — compact status badge.
 * Replaces every ad-hoc `.badge`, `.status-chip`, `.branch-badge`, `.draft-indicator`
 * across the app once PR #3+ migrates consumers.
 */
export function Pill({ tone, icon, children, className, ...rest }: PillProps) {
  return (
    <span className={clsx('bd-pill', `bd-pill--${tone}`, className)} {...rest}>
      {icon}
      {children}
    </span>
  );
}
