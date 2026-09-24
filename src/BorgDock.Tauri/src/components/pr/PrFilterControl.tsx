import clsx from 'clsx';
import { SlidingHighlight } from '@/components/shared/primitives';
import type { PrFilter } from '@/stores/pr-store';

/** The Workbench filters, in control order. Each is a `pr-store` filter value. */
export type WorkbenchFilter = Extract<PrFilter, 'all' | 'needsYou' | 'mine' | 'failing'>;

export const WORKBENCH_FILTERS: ReadonlyArray<{ value: WorkbenchFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'needsYou', label: 'Needs you' },
  { value: 'mine', label: 'Mine' },
  { value: 'failing', label: 'Failing' },
];

export type WorkbenchFilterCounts = Record<WorkbenchFilter, number>;

/** The segment for a store filter, or null for filters the control does not offer. */
export function workbenchFilterFor(filter: PrFilter): WorkbenchFilter | null {
  return WORKBENCH_FILTERS.some((f) => f.value === filter) ? (filter as WorkbenchFilter) : null;
}

/** Map `pr-store.counts()` onto the four segments. */
export function workbenchFilterCounts(counts: Record<PrFilter, number>): WorkbenchFilterCounts {
  return {
    all: counts.all,
    needsYou: counts.needsYou,
    mine: counts.mine,
    failing: counts.failing,
  };
}

interface PrFilterControlProps {
  /** The store's filter. One the control does not offer highlights nothing. */
  value: PrFilter;
  counts: WorkbenchFilterCounts;
  onChange: (filter: WorkbenchFilter) => void;
}

/**
 * PrFilterControl — the Workbench list's segmented filter: All / Needs you /
 * Mine / Failing with counts. The fill highlight slides to the chosen segment
 * (`SlidingHighlight`, `--motion-move`). Replaces the tab layout's seven
 * filter chips when `ui.layoutV3` is on.
 */
export function PrFilterControl({ value, counts, onChange }: PrFilterControlProps) {
  const active = workbenchFilterFor(value);
  return (
    <SlidingHighlight
      activeKey={active}
      className="bd-filter"
      role="group"
      aria-label="Filter pull requests"
    >
      {WORKBENCH_FILTERS.map((f) => {
        const on = f.value === active;
        return (
          <button
            key={f.value}
            type="button"
            className={clsx('bd-filter__item', on && 'bd-filter__item--active')}
            aria-pressed={on}
            data-highlight-key={f.value}
            data-filter-key={f.value}
            onClick={() => {
              if (!on) onChange(f.value);
            }}
          >
            {f.label}
            <span className="bd-filter__count">{counts[f.value]}</span>
          </button>
        );
      })}
    </SlidingHighlight>
  );
}
