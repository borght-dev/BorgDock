import clsx from 'clsx';
import { usePrStore, type PrFilter } from '@/stores/pr-store';

const filters: { key: PrFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My PRs' },
  { key: 'failing', label: 'Failing' },
  { key: 'ready', label: 'Ready' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'closed', label: 'Closed' },
];

export function FilterBar() {
  const filter = usePrStore((s) => s.filter);
  const setFilter = usePrStore((s) => s.setFilter);
  const counts = usePrStore((s) => s.counts);

  const c = counts();

  return (
    <div className="flex gap-1 overflow-x-auto px-3 py-1.5 border-b border-[var(--color-separator)]">
      {filters.map((f) => {
        const isActive = filter === f.key;
        const count = c[f.key];

        return (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx(
              'flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]'
                : 'text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-filter-chip-bg)]',
            )}
          >
            {f.label}
            {count > 0 && (
              <span
                className={clsx(
                  'rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium',
                  isActive
                    ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)]',
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
