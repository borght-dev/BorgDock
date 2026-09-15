import clsx from 'clsx';

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
}

export function Seg2<T extends string = string>({
  value,
  options,
  onChange,
  full,
  size = 'md',
}: Seg2Props<T>) {
  return (
    <div
      className={clsx(
        size === 'sm'
          ? 'h-[26px] p-[2px] gap-[1px] rounded-[5px] border border-[var(--color-input-border)] bg-[var(--color-input-bg)]'
          : 'p-[3px] gap-[2px] rounded-[7px] border border-[var(--color-subtle-border)] bg-[var(--color-surface-hover)]',
        full ? 'grid' : 'inline-flex',
      )}
      style={full ? { gridTemplateColumns: `repeat(${options.length}, 1fr)` } : undefined}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              'transition-colors',
              size === 'sm'
                ? 'rounded-[3px] px-[9px] text-[11px]'
                : 'rounded-[5px] px-[14px] py-[6px] text-[11.5px]',
              active
                ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)] font-semibold'
                : 'text-[var(--color-text-tertiary)] font-medium hover:text-[var(--color-text-secondary)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
