import clsx from 'clsx';
import type { SearchMode } from './parse-query';

export interface ResultEntry {
  rel_path: string;
  mode: SearchMode;
  match_count?: number;
  line?: number;
  symbol?: string;
}

interface Props {
  results: ResultEntry[];
  selectedIndex: number;
  onHover: (i: number) => void;
  onOpen: (i: number) => void;
  rowRef: (el: HTMLButtonElement | null, i: number) => void;
}

export function ResultsList({ results, selectedIndex, onHover, onOpen, rowRef }: Props) {
  if (results.length === 0) return null;
  return (
    <div className="bd-fp-results">
      {results.map((r, i) => {
        const selected = i === selectedIndex;
        return (
          <button
            key={`${r.rel_path}:${r.line ?? 0}`}
            type="button"
            data-file-result
            data-selected={selected ? 'true' : 'false'}
            className={clsx(
              'bd-fp-result-row',
              selected && 'bd-fp-result-row--selected',
            )}
            ref={(el) => rowRef(el, i)}
            onMouseEnter={() => onHover(i)}
            onClick={() => onOpen(i)}
          >
            <span className="bd-fp-result-path">{r.rel_path}</span>
            {r.match_count !== undefined && (
              <span className="bd-fp-result-meta">
                {r.match_count} match{r.match_count === 1 ? '' : 'es'}
              </span>
            )}
            {r.line !== undefined && (
              <span className="bd-fp-result-meta">
                {r.symbol ? `${r.symbol} · ` : ''}L{r.line}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
