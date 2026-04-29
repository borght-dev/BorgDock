import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import type { ParsedQuery } from './parse-query';
import { parseQuery } from './parse-query';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  parsed: ParsedQuery;
  resultCount: number;
}

export function FilePaletteSearchPane({ query, onQueryChange, parsed, resultCount }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      invoke('palette_ready').catch(() => {});
    }, 40);
    return () => window.clearTimeout(id);
  }, []);

  const modeLabel =
    parsed.mode === 'filename' ? 'file' : parsed.mode === 'content' ? 'content' : 'symbol';

  return (
    <div className="bd-fp-search-pane">
      <div className="bd-fp-search-input-wrap relative">
        <input
          ref={inputRef}
          className="bd-input bd-fp-search-input w-full rounded-lg border px-3 py-2 outline-none bg-[var(--color-input-bg)] border-[var(--color-input-border)] text-[var(--color-text-primary)] caret-[var(--color-accent)] text-[13px] pr-[70px]"
          placeholder="Search files..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="File palette search"
        />
        <span className="bd-fp-search-mode absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent)]" title={`Mode: ${modeLabel}`}>
          {modeLabel}
        </span>
      </div>
      <div className="bd-fp-search-hint mt-1.5 text-[10px] text-[var(--color-text-muted)] opacity-60">
        Filename · prefix &gt; for content · @ for symbol
      </div>
      <div className="bd-fp-search-count mt-1 text-[10px] opacity-50">
        {resultCount} result{resultCount === 1 ? '' : 's'}
      </div>
    </div>
  );
}

export { parseQuery };
