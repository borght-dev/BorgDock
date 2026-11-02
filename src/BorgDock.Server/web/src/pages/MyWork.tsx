import type { ItemOverview, Overview } from '../../../shared/src/api.ts';
import { api } from '../api.ts';
import { activeWorkBay } from '../components/Chrome.tsx';
import { STATUS_TEXT } from '../components/ItemPanel.tsx';
import { ago, due, shortTitle, t3LinkProps } from '../helpers.ts';
import { useStore } from '../store.tsx';

export function MyWork({ selected }: { selected: number | null }) {
  const { overview, loadError, route, act, busy } = useStore();
  if (!overview) return <div className="empty">{loadError ?? 'Loading your work…'}</div>;

  const bay = activeWorkBay(overview, route.params);
  if (bay.key === 'unlinked') return <Unlinked overview={overview} />;
  const items = overview.items.filter((o) => o.bay === bay.key);
  const fixes = bay.key === 'drift' ? items.filter((o) => o.suggestion?.to) : [];
  return <section className="review-queue" id={`bay-${bay.key}`} aria-label={bay.name}>
    <div className="review-list-head"><h2>{bay.key === 'waiting' ? 'Decision queue' : bay.short ?? bay.name}</h2><span>{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>
    {fixes.length > 1 && <button className="btn apply-all" disabled={busy} onClick={() => act(async () => {
      const results = await Promise.allSettled(fixes.map((o) => api.moveState(o.item.id, o.suggestion!.to!)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) throw new Error(`${fixes.length - failed} moved, ${failed} failed. Check them one by one.`);
      return `${fixes.length} items moved in ADO`;
    })}>Apply all {fixes.length} suggestions</button>}
    {items.map((o) => <ReviewRow key={o.item.id} o={o} selected={selected === o.item.id} />)}
    {!items.length && <div className="queue-empty"><h2>{bay.key === 'waiting' ? 'You’re all caught up' : 'No items here'}</h2><p>{bay.key === 'waiting' ? 'No agent updates need your attention. Pick another view to see the rest of your work.' : 'Pick another view to see the rest of your work.'}</p></div>}
  </section>;
}

function ReviewRow({ o, selected }: { o: ItemOverview; selected: boolean }) {
  const { navigate } = useStore();
  const thread = o.threads[0];
  const dueInfo = due(o.item);
  const status = thread && thread.status !== 'settled' ? STATUS_TEXT[thread.status] : o.waitingFor ?? o.item.state;
  return <button className={`review-row t-${o.item.type} s-${o.bay} ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={() => navigate(`/?${new URLSearchParams({ bay: o.bay, item: String(o.item.id) })}`)}>
    <span className="review-row-meta"><span className={`item-type type-${o.item.type}`}>{o.item.type === 'Other' ? o.item.typeName : o.item.type}</span><span className="review-item-id">#{o.item.id}</span>{thread && <span className="review-time">{ago(thread.lastActivityAt)}</span>}</span>
    <span className="review-title">{shortTitle(o.item.title)}</span>
    <span className={`review-status ${thread?.status === 'failed' ? 'is-error' : ''}`}><span className={`status-dot status-${thread?.status ?? o.bay}`} />{status}{dueInfo?.overdue && <span className="review-overdue" title={dueInfo.label}>Overdue</span>}</span>
    <span className="review-row-bottom"><span className={o.pullRequest?.state === 'merged' ? 'merged-text' : ''}>{o.pullRequest ? `PR #${o.pullRequest.number} ${o.pullRequest.state}` : o.item.state}</span><span>{thread?.status !== 'settled' ? thread?.worktree : null}</span></span>
  </button>;
}

function Unlinked({ overview }: { overview: Overview }) {
  const { act, busy } = useStore();
  const threads = overview.unlinkedThreads;
  if (!threads.length) return <div className="queue-empty"><h2>No unlinked threads</h2><p>Every listed thread is linked to a work item.</p></div>;
  const myItems = overview.items.map((o) => o.item);
  return (
    <section className="bay" id="bay-unlinked">
      <div className="review-list-head"><h2>Thread queue</h2><span>{threads.length} {threads.length === 1 ? 'thread' : 'threads'}</span></div>
      {threads.map((t) => (
        <div className="strip orphan s-orphan" key={t.id}>
          <span className="lamp" />
          <div className="cell c-id"><b>{t.worktree}</b><small>{ago(t.lastActivityAt)}</small></div>
          <div className="cell c-title">
            <a className="t" {...t3LinkProps(t)}>{t.title}</a>
            <span className="meta"><span>{t.guessItemId ? `Looks like ${t.guessItemId}` : 'No matching item found'}</span></span>
          </div>
          <div className="cell c-agent">
            {t.guessItemId ? (
              <button className="strip-act solid" disabled={busy} onClick={() => act(async () => { await api.link(t.id, t.guessItemId); return `Linked to ${t.guessItemId}`; })}>Link to {t.guessItemId}</button>
            ) : (
              <select
                className="strip-select"
                aria-label="Link to a work item"
                value=""
                disabled={busy}
                onChange={(e) => { const id = Number(e.target.value); act(async () => { await api.link(t.id, id); return `Linked to ${id}`; }); }}
              >
                <option value="">Link to…</option>
                {myItems.map((i) => <option key={i.id} value={i.id}>{i.id} {shortTitle(i.title).slice(0, 50)}</option>)}
              </select>
            )}
            <button className="strip-act" disabled={busy} title="Stop listing this thread here" onClick={() => act(async () => { await api.link(t.id, null); return 'Hidden from this list'; })}>Not item work</button>
          </div>
        </div>
      ))}
    </section>
  );
}
