import { useState } from 'react';
import type { ItemOverview } from '../../../shared/src/api.ts';
import { ago, due, shortTitle } from '../helpers.ts';
import { Actions, AgentSays, STATUS_TEXT } from './ItemPanel.tsx';

/** A waiting item, unfolded: what the agent said and the buttons to answer it, without opening the item. */
export function Docket({ o, selected, onSelect }: { o: ItemOverview; selected: boolean; onSelect: () => void }) {
  const { item } = o;
  const thread = o.threads[0]?.status === 'settled' ? undefined : o.threads[0];
  const dueInfo = due(item);
  const long = (thread?.lastAgentMessage?.length ?? 0) > 420 || (thread?.lastAgentMessage?.split('\n').length ?? 0) > 8;
  const [expanded, setExpanded] = useState(false);
  const says = thread && (thread.status === 'question' || (thread.lastAgentMessage && thread.status !== 'running'));
  const meta = [
    dueInfo && <span key="due" className={dueInfo.overdue ? 'overdue' : ''}>{dueInfo.label}{dueInfo.overdue ? ', overdue' : ''}</span>,
    <span key="state">{item.state}</span>,
    o.pullRequest && <span key="pr">PR {o.pullRequest.number} {o.pullRequest.state}</span>,
    thread && !says && <span key="says" className="says">{STATUS_TEXT[thread.status]}</span>,
    !thread && o.waitingFor && o.waitingFor !== `ADO says ${item.state}` && <span key="w">{o.waitingFor}</span>,
  ];

  return (
    <article className={`docket t-${item.type} ${selected ? 'is-selected' : ''}`}>
      <span className="lamp" />
      <div className="d-id">
        <b>{item.id}</b>
        <small>{item.type === 'Other' ? item.typeName : item.type}{item.priority ? ` P${item.priority}` : ''}</small>
      </div>
      <div className="d-main">
        <header className="d-head" role="button" tabIndex={0} onClick={onSelect} onKeyDown={(e) => e.key === 'Enter' && onSelect()}>
          <div className="d-title">
            <span className="t">{shortTitle(item.title)}</span>
            <span className="meta">{meta}</span>
          </div>
          {thread && <div className="d-slot"><b>{thread.worktree}</b><span>{ago(thread.lastActivityAt)}</span></div>}
        </header>
        {says && (
          <div className={`d-body says-${thread.status} ${long && !expanded ? 'is-clamped' : ''}`}>
            <span className="d-says">{STATUS_TEXT[thread.status]}</span>
            <AgentSays thread={thread} />
            {long && thread.status !== 'question' && <button className="d-more" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show all'}</button>}
          </div>
        )}
        {o.suggestion && <p className="d-suggest">{o.suggestion.reason}</p>}
        <Actions o={o} item={item} className="d-act" />
      </div>
    </article>
  );
}
