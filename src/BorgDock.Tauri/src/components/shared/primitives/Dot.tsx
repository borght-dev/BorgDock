import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type DotTone = 'green' | 'red' | 'yellow' | 'gray' | 'merged';

export interface DotProps extends HTMLAttributes<HTMLSpanElement> {
  /** Status tone — drives the fill colour via tokens. */
  tone: DotTone;
  /** Animate a soft pulse ring. Default false. */
  pulse?: boolean;
  /** Square pixel size. Default 8. */
  size?: number;
}

/**
 * Dot — tiny status indicator.
 * Replaces ad-hoc status dots across sidebar header, tray indicators, floating badge.
 */
export function Dot({ tone, pulse = false, size = 8, className, style, ...rest }: DotProps) {
  return (
    <span
      className={clsx('bd-dot', `bd-dot--${tone}`, className)}
      style={{
        width: size,
        height: size,
        animation: pulse ? 'bd-pulse-dot 2.6s ease-in-out infinite' : undefined,
        ...style,
      }}
      {...rest}
    />
  );
}
