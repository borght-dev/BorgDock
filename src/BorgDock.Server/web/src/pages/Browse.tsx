import { useEffect, useState, type FormEvent } from 'react';
import type { BrowseQuery, BrowseResult } from '../../../shared/src/api.ts';
import { api } from '../api.ts';
import { Strip } from '../components/Strip.tsx';
import { useStore } from '../store.tsx';

export function Browse({ selected }: { selected: number | null }) {
  const { route, navigate, syncTick, syncNow, syncing } = useStore();
  const query = route.params.get('query') ?? 'sprint';
  const search = route.params.get('search') ?? '';
  const [queries, setQueries] = useState<BrowseQuery[]>([]);
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState(search);

  useEffect(() => { api.queries().then(setQueries).catch(() => {}); }, [syncTick]);
  useEffect(() => {
    setResult(null);
    setText(search);
  }, [query, search]);
  useEffect(() => {
    setError(null);
    api.browse(query, search).then(setResult).catch((e) => setError(e.message));
  }, [query, search, syncTick]);

  const go = (params: Record<string, string>) => navigate(`/browse?${new URLSearchParams(params)}`);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    go(text.trim() ? { search: text.trim() } : { query });
  };
  const groups = [...new Set(queries.map((q) => q.group))];
  const title = search ? `Search: ${search}` : queries.find((q) => q.id === query)?.name ?? 'Current sprint, whole team';

  return (
    <>
      <form className="browse-bar" onSubmit={submit} role="search">
        <input className="browse-search" aria-label="Search Azure DevOps" placeholder="Search titles or type an item number" value={text} onChange={(e) => setText(e.target.value)} />
        <select className="browse-query" aria-label="Query" value={search ? '' : query} onChange={(e) => go({ query: e.target.value })}>
          {search && <option value="">Pick a query</option>}
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {queries.filter((q) => q.group === g).map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </optgroup>
          ))}
        </select>
        <button type="button" className="filter" disabled={syncing} onClick={() => syncNow()}>{syncing ? 'Refreshing…' : 'Refresh'}</button>
      </form>
      <h2 className="browse-title">{title}</h2>
      <p className="browse-sub">
        {error ?? (!result ? 'Loading…' : `${result.items.length}${result.truncated ? '+' : ''} open items${result.truncated ? ', showing the first 100' : ''}.`)}
      </p>
      {result?.items.map((item) => (
        <Strip key={item.id} browse={item} selected={selected === item.id} onSelect={() => navigate(`/browse?${new URLSearchParams({ ...(search ? { search } : { query }), item: String(item.id) })}`)} />
      ))}
      {result && !result.items.length && <div className="empty">No open items match.</div>}
    </>
  );
}
