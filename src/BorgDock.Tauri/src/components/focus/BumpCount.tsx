import { type HTMLAttributes, useEffect, useRef } from 'react';
import { EASE_STD, motionOK } from '@/utils/motion';

/** How long a count grows and settles when it changes (the mockup's `.bump`). */
export const BUMP_MS = 300;

export interface BumpCountProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  value: number;
}

/**
 * BumpCount — a number that scales to 1.3 and back over `BUMP_MS` when it
 * changes (Focus column counts, the "Merged today" tally). It never moves
 * on mount, only on a change, and not under reduced motion.
 */
export function BumpCount({ value, ...rest }: BumpCountProps) {
  const ref = useRef<HTMLElement>(null);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    const el = ref.current;
    if (!el || !motionOK() || typeof el.animate !== 'function') return;
    el.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.3)', offset: 0.4 },
        { transform: 'scale(1)' },
      ],
      { duration: BUMP_MS, easing: EASE_STD },
    );
  }, [value]);

  return (
    <b ref={ref} data-count={value} {...rest}>
      {value}
    </b>
  );
}
