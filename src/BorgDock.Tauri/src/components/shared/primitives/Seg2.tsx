import clsx from 'clsx';
import { SlidingHighlight } from './SlidingHighlight';

export interface Seg2Option<T extends string = string> {
  value: T;
  label: string;
}

export interface Seg2Props<T extends string = string> {
  value: T;
  options: ReadonlyArray<Seg2Option<T>>;
  onChange: (next: T) => void;
  full?: boolean;
  /** sm = 26px toolbar control. Default md. */
  size?: 'sm' | 'md';
  /** Accessible name for the group. */
  ariaLabel?: string;
}

/**
 * Seg2 — segmented control. The same control as the Pull requests filter
 * (`.bd-filter`): a sliding highlight moves to the chosen option over
 * `--motion-move` (instant under reduced motion). Each option is a button
 * with `aria-pressed`.
 */
export function Seg2<T extends string = string>({
  value,
  options,
  onChange,
  full,
  size = 'md',
  ariaLabel,
}: Seg2Props<T>) {
  return (
    <SlidingHighlight
      activeKey={value}
      role="group"
      aria-label={ariaLabel}
      className={clsx('bd-filter bd-seg', size === 'sm' && 'bd-seg--sm', full && 'bd-seg--full')}
      style={full ? { gridTemplateColumns: `repeat(${options.length}, 1fr)` } : undefined}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            data-highlight-key={o.value}
            onClick={() => onChange(o.value)}
            className={clsx('bd-filter__item', active && 'bd-filter__item--active')}
          >
            {o.label}
          </button>
        );
      })}
    </SlidingHighlight>
  );
}
