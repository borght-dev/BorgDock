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
  onOpenQueryBrowser: () => void;
}

function QueryRow({
  q,
  active,
  star,
  onClick,
}: {
  q: QueryRowData;
  active: boolean;
  star?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`bd-query-row${active ? ' bd-query-row--active' : ''}`}
      onClick={onClick}
    >
      {star ? (
        <span className="bd-query-row__star">★</span>
      ) : (
        <span className="bd-query-row__star-spacer" />
      )}
      <span className="bd-query-row__name">{q.name}</span>
      {q.count !== undefined && <span className="bd-query-row__count">{q.count}</span>}
    </button>
  );
}

export function QueriesRail({
  favorites,
  myQueries,
  selectedId,
  onSelectQuery,
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
          star
          active={selectedId === q.id}
          onClick={() => onSelectQuery(q.id)}
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
          active={selectedId === q.id}
          onClick={() => onSelectQuery(q.id)}
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
