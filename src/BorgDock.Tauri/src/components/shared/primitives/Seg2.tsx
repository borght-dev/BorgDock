import clsx from 'clsx';

export interface Seg2Option<T extends string = string> { value: T; label: string }

export interface Seg2Props<T extends string = string> {
  value: T;
  options: ReadonlyArray<Seg2Option<T>>;
  onChange: (next: T) => void;
  full?: boolean;
}

export function Seg2<T extends string = string>({ value, options, onChange, full }: Seg2Props<T>) {
  return (
    <div
      className={clsx(
        'p-[3px] gap-[2px] rounded-[7px] border border-[var(--color-subtle-border)] bg-[var(--color-surface-hover)]',
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
              'rounded-[5px] px-[14px] py-[6px] text-[11.5px] transition-colors',
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
