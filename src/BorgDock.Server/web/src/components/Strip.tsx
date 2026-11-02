import type { ItemOverview, WorkItemSummary } from '../../../shared/src/api.ts';
import { api } from '../api.ts';
import { ago, due, needsYouLabel, shortState, shortTitle } from '../helpers.ts';
import { useStore } from '../store.tsx';

type Props = { selected: boolean; onSelect: () => void } & ({ overview: ItemOverview; browse?: undefined } | { overview?: undefined; browse: WorkItemSummary });

const stop = (handler: () => void) => (e: React.MouseEvent) => {
  e.stopPropagation();
  handler();
};

export function Strip(props: Props) {
  const item = props.overview?.item ?? props.browse!;
  const bay = props.overview?.bay ?? 'browse';
  const dueInfo = due(item);
  const suggestion = props.overview?.suggestion;
  const meta = [
    dueInfo && <span key="due" className={`due ${dueInfo.overdue ? 'overdue' : ''}`}>{dueInfo.label}{dueInfo.overdue ? ', overdue' : ''}</span>,
    props.overview?.queuedAt && <span key="q">Queued {ago(props.overview.queuedAt)}</span>,
    props.overview?.waitingFor?.startsWith('ADO says') && <span key="w">{props.overview.waitingFor}</span>,
    suggestion && <span key="s">{suggestion.reason}</span>,
    !suggestion && !props.overview?.queuedAt && <span key="sp">{item.sprint === 'Backlog' ? 'Backlog' : `Sprint ${item.sprint}`}</span>,
  ];
  const phoneState = suggestion?.to ? `${item.state} → ${shortState(suggestion.to)}` : item.state;

  return (
    <div
      className={`strip t-${item.type} s-${bay} ${props.selected ? 'is-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        props.onSelect();
      }}
    >
      <span className="lamp" />
      <div className="cell c-id">
        <b>{item.id}</b>
        <small>{item.type === 'Other' ? item.typeName : item.type}{item.priority ? ` P${item.priority}` : ''}</small>
        <span className="st">{phoneState}</span>
      </div>
      <div className="cell c-title">
        <span className="t">{shortTitle(item.title)}</span>
        <span className="meta">{meta}</span>
      </div>
      <div className="cell c-state">
        {suggestion?.to ? (
          <>
            <span className="was">{item.state}</span>
            <span className="to">Suggested: {shortState(suggestion.to)}</span>
          </>
        ) : (
          item.state
        )}
      </div>
      {props.overview ? <AgentCell o={props.overview} /> : <BrowseCell item={props.browse!} />}
    </div>
  );
}

function AgentCell({ o }: { o: ItemOverview }) {
  const { act, openStart, busy } = useStore();
  const thread = o.threads[0];
  const openThread = thread && thread.status !== 'settled' ? thread : null;
  const start = <button className="strip-act solid" disabled={busy} onClick={stop(() => openStart(o.item))}>Start</button>;

  if (o.bay === 'drift' && o.suggestion?.to) {
    const to = o.suggestion.to;
    return (
      <div className="cell c-agent">
        {openThread && <span className="slot-tag">{openThread.worktree}</span>}
        <span className="what phone-only">{o.pullRequest ? <b>PR {o.pullRequest.number} {o.pullRequest.state}</b> : openThread?.status === 'running' ? <b><span className="live" />Running</b> : null}</span>
        <button className="strip-act solid" disabled={busy} onClick={stop(() => act(async () => `${o.item.id} moved to ${(await api.moveState(o.item.id, to)).state} in ADO`))}>
          Move to {shortState(to)}
        </button>
      </div>
    );
  }
  if (o.bay === 'drift' || o.bay === 'next' || o.bay === 'idle' || (o.bay === 'waiting' && !openThread)) {
    return (
      <div className="cell c-agent">
        {openThread && <span className="slot-tag">{openThread.worktree}</span>}
        <span className="what"><span>{o.bay === 'drift' ? 'No agent' : 'No agent yet'}</span></span>
        {o.bay === 'idle' && <button className="strip-act" disabled={busy} onClick={stop(() => act(async () => { await api.queue(o.item.id); return `${o.item.id} added to Up next`; }))}>Queue</button>}
        {start}
      </div>
    );
  }
  if (o.bay === 'paused') {
    return (
      <div className="cell c-agent">
        <span className="what"><span>Last agent {ago(thread?.lastActivityAt)}</span></span>
        {start}
      </div>
    );
  }
  if (o.bay === 'handed' && !openThread) {
    return <div className="cell c-agent"><span className="what"><span>{o.item.state === 'Code Review' ? 'Waiting for a reviewer' : 'Someone else has it'}</span></span></div>;
  }
  if (!openThread) return <div className="cell c-agent" />;
  const label = needsYouLabel(o);
  return (
    <div className="cell c-agent">
      <span className="slot-tag">{openThread.worktree}</span>
      {label && openThread.status !== 'running' ? (
        <span className="what you"><b>{label}</b><span>{ago(openThread.lastActivityAt)}</span></span>
      ) : (
        <span className="what"><b><span className="live" />{openThread.title}</b></span>
      )}
    </div>
  );
}

function BrowseCell({ item }: { item: WorkItemSummary }) {
  const { act, openStart, busy } = useStore();
  return (
    <div className="cell c-agent">
      <span className={`who ${item.assignedTo ? '' : 'none'}`}>{item.assignedTo ?? 'Unassigned'}</span>
      <button className="strip-act" disabled={busy} onClick={stop(() => act(async () => { await api.queue(item.id); return `${item.id} added to Up next`; }))}>Queue</button>
      <button className="strip-act solid" disabled={busy} onClick={stop(() => openStart(item))}>Start</button>
    </div>
  );
}
