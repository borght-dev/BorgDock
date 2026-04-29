import { Chip } from '@/components/shared/primitives';
import { type PrFilter, usePrStore } from '@/stores/pr-store';

const filters: { key: PrFilter; label: string }[] = [
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
    // Padding/horizontal-scroll only — outer Sidebar.tsx handles the row gap
    // and vertical padding so FilterBar can sit inline with SearchBar.
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      {filters.map((f) => {
        const isActive = filter === f.key;
        const count = c[f.key];
        const tone = f.key === 'failing' ? 'error' : 'neutral';
        return (
          <Chip
            key={f.key}
            active={isActive}
            tone={tone}
            count={count > 0 ? count : undefined}
            onClick={() => setFilter(f.key)}
            data-filter-chip
            data-filter-key={f.key}
            data-filter-active={isActive ? 'true' : 'false'}
          >
            {f.label}
          </Chip>
        );
      })}
    </div>
  );
}
