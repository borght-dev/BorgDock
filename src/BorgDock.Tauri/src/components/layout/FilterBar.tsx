import clsx from 'clsx';
import { type PrFilter, usePrStore } from '@/stores/pr-store';

const filters: { key: PrFilter; label: string; icon?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needsReview', label: 'Needs Review' },
  { key: 'mine', label: 'Mine' },
  { key: 'failing', label: 'Failing' },
  { key: 'ready', label: 'Ready' },
  { key: 'reviewing', label: 'Review' },
  { key: 'closed', label: 'Closed' },
];

export function FilterBar() {
  const filter = usePrStore((s) => s.filter);
  const setFilter = usePrStore((s) => s.setFilter);
  const counts = usePrStore((s) => s.counts);

  const c = counts();

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-2.5 pt-2 pb-1">
      {filters.map((f) => {
        const isActive = filter === f.key;
        const count = c[f.key];
        const isFailing = f.key === 'failing' && count > 0;
        const isNeedsReview = f.key === 'needsReview' && count > 0;

        return (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx(
              'flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150',
              isActive
                ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)] shadow-sm'
                : isFailing
                  ? 'text-[var(--color-status-red)] hover:bg-[var(--color-action-danger-bg)]'
                  : isNeedsReview
                    ? 'text-[var(--color-status-yellow)] hover:bg-[color-mix(in_srgb,var(--color-status-yellow)_10%,transparent)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]',
            )}
          >
            {f.label}
            {count > 0 && (
              <span
                className={clsx(
                  'min-w-[16px] rounded-full px-1 text-center text-[9px] font-semibold leading-[16px]',
                  isActive
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                    : isFailing
                      ? 'bg-[var(--color-action-danger-bg)] text-[var(--color-status-red)]'
                      : isNeedsReview
                        ? 'bg-[color-mix(in_srgb,var(--color-status-yellow)_15%,transparent)] text-[var(--color-status-yellow)]'
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
