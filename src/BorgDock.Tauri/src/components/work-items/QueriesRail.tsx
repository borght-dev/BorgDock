import { Button } from '@/components/shared/primitives';

export interface QueryRowData {
  id: string;
  name: string;
  count?: number;
}

interface Props {
  favorites: QueryRowData[];
  myQueries: QueryRowData[];
  selectedId?: string;
  onSelectQuery: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenQueryBrowser: () => void;
}

function QueryRow({
  q,
  active,
  isFavorite,
  onClick,
  onToggleFavorite,
}: {
  q: QueryRowData;
  active: boolean;
  isFavorite: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className={`bd-query-row${active ? ' bd-query-row--active' : ''}`}>
      <button
        type="button"
        className={`bd-query-row__star-btn${isFavorite ? ' bd-query-row__star-btn--on' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        aria-label={isFavorite ? `Remove ${q.name} from favorites` : `Add ${q.name} to favorites`}
        aria-pressed={isFavorite}
      >
        <svg
          viewBox="0 0 16 16"
          fill={isFavorite ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.4"
          width="11"
          height="11"
        >
          <path d="M8 1.5l2 4.1 4.5.6-3.3 3.2.8 4.5L8 11.7l-4 2.2.8-4.5L1.5 6.2l4.5-.6z" />
        </svg>
      </button>
      <button
        type="button"
        className="bd-query-row__select"
        onClick={onClick}
      >
        <span className="bd-query-row__name">{q.name}</span>
        {q.count !== undefined && <span className="bd-query-row__count">{q.count}</span>}
      </button>
    </div>
  );
}

export function QueriesRail({
  favorites,
  myQueries,
  selectedId,
  onSelectQuery,
  onToggleFavorite,
  onOpenQueryBrowser,
}: Props) {
  return (
    <aside className="bd-queries-rail">
      <div className="bd-section-label bd-queries-rail__heading">Favorites</div>
      {favorites.length === 0 && (
        <div className="bd-queries-rail__empty">No favorites yet</div>
      )}
      {favorites.map((q) => (
        <QueryRow
          key={q.id}
          q={q}
          isFavorite
          active={selectedId === q.id}
          onClick={() => onSelectQuery(q.id)}
          onToggleFavorite={() => onToggleFavorite(q.id)}
        />
      ))}
      <div className="bd-section-label bd-queries-rail__heading">My Queries</div>
      {myQueries.length === 0 && (
        <div className="bd-queries-rail__empty">None loaded</div>
      )}
      {myQueries.map((q) => (
        <QueryRow
          key={q.id}
          q={q}
          isFavorite={false}
          active={selectedId === q.id}
          onClick={() => onSelectQuery(q.id)}
          onToggleFavorite={() => onToggleFavorite(q.id)}
        />
      ))}
      <div className="bd-queries-rail__footer">
        <Button variant="ghost" size="sm" onClick={onOpenQueryBrowser}>
          Browse all queries…
        </Button>
      </div>
    </aside>
  );
}
