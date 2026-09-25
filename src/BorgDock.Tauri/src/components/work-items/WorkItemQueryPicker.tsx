import clsx from 'clsx';
import { FolderSearch } from 'lucide-react';
import { IconButton, Select, SlidingHighlight } from '@/components/shared/primitives';
import type { QueryRowData } from './QueriesRail';

/** Up to this many favourite queries show as a segmented control. */
export const SEGMENTED_MAX = 4;
/** Up to this many queries in all fit a compact select; more keep the rail. */
export const SELECT_MAX = 12;

export type QueryPickerMode = 'segmented' | 'select' | 'rail';

/**
 * How the Workbench head row offers the queries: a few favourites as a
 * segmented control, a short list as a select, and a long one keeps the
 * queries rail beside the list.
 */
export function queryPickerMode(favorites: number, others: number): QueryPickerMode {
  if (favorites > 0 && favorites <= SEGMENTED_MAX) return 'segmented';
  if (favorites + others <= SELECT_MAX) return 'select';
  return 'rail';
}

interface WorkItemQueryPickerProps {
  mode: Exclude<QueryPickerMode, 'rail'>;
  favorites: QueryRowData[];
  myQueries: QueryRowData[];
  selectedId?: string;
  /** The selected query's name, when it is in neither list (picked in the browser). */
  selectedName?: string;
  onSelectQuery: (id: string) => void;
  onOpenQueryBrowser: () => void;
}

/**
 * WorkItemQueryPicker — the query choice in the Work items head row
 * (`ui.layoutV3`). Segmented: the favourite queries with the sliding fill
 * (`SlidingHighlight`), plus the selected query when it is not a favourite.
 * Select: every query in one compact control. Both end with "Browse all
 * queries", the query browser the rail's footer opens.
 */
export function WorkItemQueryPicker({
  mode,
  favorites,
  myQueries,
  selectedId,
  selectedName,
  onSelectQuery,
  onOpenQueryBrowser,
}: WorkItemQueryPickerProps) {
  const browse = (
    <IconButton
      icon={<FolderSearch size={14} strokeWidth={2} aria-hidden="true" />}
      tooltip="Browse all queries"
      aria-label="Browse all queries"
      size={26}
      onClick={onOpenQueryBrowser}
      data-wi-browse-queries=""
    />
  );

  if (mode === 'select') {
    const all = [...favorites, ...myQueries];
    const options = all.map((q) => ({ value: q.id, label: q.name }));
    if (selectedId && !all.some((q) => q.id === selectedId)) {
      options.unshift({ value: selectedId, label: selectedName ?? 'Selected query' });
    }
    return (
      <div className="bd-wi-wb-queries" data-query-picker="select">
        <Select
          value={selectedId ?? ''}
          options={options}
          placeholder={options.length === 0 ? 'No queries' : 'Pick a query'}
          ariaLabel="Query"
          onChange={(id) => {
            if (id && id !== selectedId) onSelectQuery(id);
          }}
        />
        {browse}
      </div>
    );
  }

  const segments = [...favorites];
  if (selectedId && !segments.some((q) => q.id === selectedId)) {
    const picked = myQueries.find((q) => q.id === selectedId);
    segments.push(picked ?? { id: selectedId, name: selectedName ?? 'Selected query' });
  }
  return (
    <div className="bd-wi-wb-queries" data-query-picker="segmented">
      <SlidingHighlight
        activeKey={selectedId ?? null}
        className="bd-filter"
        role="group"
        aria-label="Query"
      >
        {segments.map((q) => {
          const on = q.id === selectedId;
          return (
            <button
              key={q.id}
              type="button"
              className={clsx('bd-filter__item', on && 'bd-filter__item--active')}
              aria-pressed={on}
              data-highlight-key={q.id}
              data-query-id={q.id}
              title={q.name}
              onClick={() => {
                if (!on) onSelectQuery(q.id);
              }}
            >
              <span className="bd-wi-wb-queries__name">{q.name}</span>
            </button>
          );
        })}
      </SlidingHighlight>
      {browse}
    </div>
  );
}
