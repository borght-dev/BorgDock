import { useEffect, useRef } from 'react';
import type { ParsedQuery } from './parse-query';
import { parseQuery } from './parse-query';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  parsed: ParsedQuery;
  resultCount: number;
}

export function SearchPane({ query, onQueryChange, parsed, resultCount }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, []);

  const modeLabel =
    parsed.mode === 'filename' ? 'file' : parsed.mode === 'content' ? 'content' : 'symbol';

  return (
    <div className="fp-search-pane">
      <div className="fp-search-input-wrap">
        <input
          ref={inputRef}
          className="fp-search-input"
          placeholder="Filename · prefix > for content · @ for symbol"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="File palette search"
        />
        <span className="fp-search-mode" title={`Mode: ${modeLabel}`}>
          {modeLabel}
        </span>
      </div>
      <div className="fp-search-count">{resultCount} result{resultCount === 1 ? '' : 's'}</div>
    </div>
  );
}

export { parseQuery };
