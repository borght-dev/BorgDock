import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import { Kbd } from '@/components/shared/primitives';
import type { ParsedQuery } from './parse-query';
import { parseQuery } from './parse-query';

export type Scope = 'all' | 'changes' | 'filename' | 'content' | 'symbol';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  parsed: ParsedQuery;
  resultCount: number;
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  changesCount: number;
}

export function FilePaletteSearchPane({
  query, onQueryChange, parsed: _parsed, resultCount,
  scope, onScopeChange, changesCount,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      invoke('palette_ready').catch(() => {});
    }, 40);
    return () => window.clearTimeout(id);
  }, []);

  // Chip click rewrites the query so the prefix matches the new scope.
  const setScope = (next: Scope) => {
    const stripped = stripPrefix(query);
    if (next === 'content') onQueryChange(`>${stripped}`);
    else if (next === 'symbol') onQueryChange(`@${stripped}`);
    else onQueryChange(stripped);
    onScopeChange(next);
  };

  return (
    <div className="bd-fp-search-pane">
      <div className="bd-fp-search-input-wrap">
        <input
          ref={inputRef}
          className="bd-fp-search-input"
          placeholder="Search files…   >text  @symbol"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="File palette search"
        />
        <span className="bd-fp-search-kbds">
          <Kbd>↑↓</Kbd>
          <Kbd>↵</Kbd>
        </span>
      </div>
      <div className="bd-fp-scope-chips" role="tablist">
        <ScopeChip v="all" label="All" active={scope} onClick={setScope} />
        <ScopeChip v="changes" label="Changes" active={scope} onClick={setScope}
          count={changesCount} tone="warn" />
        <ScopeChip v="filename" label="Filename" active={scope} onClick={setScope} />
        <ScopeChip v="content" label="Content" active={scope} onClick={setScope} hint=">" />
        <ScopeChip v="symbol" label="Symbol" active={scope} onClick={setScope} hint="@" />
        <span className="bd-fp-scope-spacer" />
        <span className="bd-fp-scope-count bd-mono">{resultCount} result{resultCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

interface ScopeChipProps {
  v: Scope;
  label: string;
  active: Scope;
  onClick: (s: Scope) => void;
  count?: number;
  tone?: 'warn';
  hint?: string;
}

function ScopeChip({ v, label, active, onClick, count, tone, hint }: ScopeChipProps) {
  const isOn = active === v;
  return (
    <button
      type="button"
      aria-selected={isOn}
      className={`bd-fp-scope-chip${isOn ? ' bd-fp-scope-chip--on' : ''}`}
      onClick={() => onClick(v)}
    >
      {hint && <span className="bd-mono bd-fp-scope-chip__hint">{hint}</span>}
      {label}
      {count != null && count > 0 && (
        <span className={`bd-fp-scope-chip__count${tone === 'warn' ? ' bd-fp-scope-chip__count--warn' : ''}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function stripPrefix(q: string): string {
  if (q.startsWith('>') || q.startsWith('@')) return q.slice(1);
  return q;
}

export { parseQuery };
