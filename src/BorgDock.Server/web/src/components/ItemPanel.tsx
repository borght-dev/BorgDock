import { useEffect, useState } from 'react';
import type { ItemDetail, ItemOverview, ThreadSummary, WorkItemSummary } from '../../../shared/src/api.ts';
import { api } from '../api.ts';
import { ago, due, shortState, t3LinkProps, trackStates } from '../helpers.ts';
import { useStore } from '../store.tsx';
import { Markdown } from './Markdown.tsx';
import { Icon } from './Icon.tsx';

const TYPE_NAMES: Record<string, string> = { PBI: 'Product backlog item', QI: 'Quality improvement', Bug: 'Bug', Task: 'Task' };
export const STATUS_TEXT: Record<ThreadSummary['status'], string> = {
  question: 'Asked you a question',
  plan: 'Proposed a plan',
  approval: 'Waiting for your approval',
  'your-turn': 'Finished its turn',
  failed: 'Stopped with an error',
  running: 'Running',
  settled: 'Settled',
};

export function ItemPanel({ itemId, onBack }: { itemId: number; onBack: () => void }) {
  const { overview, syncTick } = useStore();
  const o = overview?.items.find((x) => x.item.id === itemId) ?? null;
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.item(itemId).then((value) => { if (!cancelled) setDetail(value); }).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [itemId, syncTick]);

  const item: WorkItemSummary | null = o?.item ?? detail?.item ?? null;
  if (!item) return <div className="detail-empty">{error ?? 'Loading the work item…'}</div>;
  const dueInfo = due(item);

  return (
    <>
      <button className="back" onClick={onBack}>‹ Back</button>
      <article className={`sheet t-${item.type}`}>
        <header className="sheet-head">
          <div className="sheet-top"><span className="eyebrow">WORK ITEM</span><a href={item.url} target="_blank" rel="noopener noreferrer">View in ADO <Icon name="external" /></a></div>
          <div className="sheet-id">
            <span className={`item-type type-${item.type}`} title={TYPE_NAMES[item.type] ?? item.typeName}>{item.type === 'Other' ? item.typeName : item.type}</span>
            <span className="review-item-id">#{item.id}</span>
            {item.priority && <span className="item-priority">Priority {item.priority}</span>}
          </div>
          <h1>{item.title}</h1>
          <div className="sheet-tags">
            <span className="tag">{item.sprint === 'Backlog' ? 'Backlog' : `Sprint ${item.sprint}`}</span>
            {item.assignedTo && !o && <span className="tag">{item.assignedTo}</span>}
            {item.tags.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
          <dl className="item-facts"><div><dt>ADO state</dt><dd>{item.state}</dd></div><div><dt>Worktree</dt><dd>{o?.threads[0]?.status !== 'settled' ? o?.threads[0]?.worktree ?? 'Unassigned' : 'Unassigned'}</dd></div><div><dt>Pull request</dt><dd>{o?.pullRequest ? <a className={o.pullRequest.state === 'merged' ? 'merged-text' : ''} href={o.pullRequest.url} target="_blank" rel="noopener noreferrer">#{o.pullRequest.number} · {o.pullRequest.state}</a> : 'None linked'}</dd></div></dl>
          {dueInfo && <div className={`item-due ${dueInfo.overdue ? 'overdue' : ''}`}>{dueInfo.label}{dueInfo.overdue ? ' · Overdue' : ''}</div>}
        </header>

        {o && <AgentSection o={o} />}

        <section className="sheet-next">
          <h4 className="eyebrow">NEXT ACTION</h4>
          {o?.suggestion && <p className="next-action-note">{o.suggestion.reason}</p>}
          <Actions o={o} item={item} />
        </section>

        <details className="sheet-disclosure"><summary>Workflow</summary><div className="sheet-sec"><StateTrack item={item} target={o?.suggestion?.to ?? null} /></div></details>

        {o?.pullRequest?.checks && (
          <section className="sheet-sec">
            <h4>Pull request</h4>
            <div className="pr">
              <a href={o.pullRequest.url} target="_blank" rel="noopener noreferrer"><b>{o.pullRequest.number}</b></a>
              <span className={`pill ${o.pullRequest.state}`}>{o.pullRequest.state}</span>
              <span className="m">{o.pullRequest.checks ? `Checks ${o.pullRequest.checks}` : ''}</span>
            </div>
          </section>
        )}

        {detail && <DescriptionSections detail={detail} />}

        {o && o.threads.length > 1 && (
          <section className="sheet-sec">
            <h4>Earlier threads</h4>
            <ul className="log">
              {o.threads.slice(1).map((t) => (
                <li key={t.id}><span className="when">{ago(t.lastActivityAt)}</span><span className="src">{t.worktree}</span><a {...t3LinkProps(t)}>{t.title}</a></li>
              ))}
            </ul>
          </section>
        )}

      </article>
    </>
  );
}

function StateTrack({ item, target }: { item: WorkItemSummary; target: string | null }) {
  const states = trackStates(item, target);
  const at = states.indexOf(item.state);
  return (
    <div className="track">
      {states.map((s, i) => (
        <div key={s} title={s} className={`step ${i === at ? 'now' : s === target ? 'suggest' : at !== -1 && i < at ? 'done' : ''}`}>
          <i />
          <span>{shortState(s)}</span>
        </div>
      ))}
    </div>
  );
}

function AgentSection({ o }: { o: ItemOverview }) {
  const { overview } = useStore();
  const thread = o.threads[0];
  if (!thread) {
    const free = overview?.worktrees.filter((w) => w.state === 'free' && w.available !== false).map((w) => w.name) ?? [];
    return (
      <section className="sheet-sec">
        <div className="agent-card"><span className="agent-avatar"><Icon name="inbox" /></span><div><strong>No active agent</strong><p className="m">{free.length ? `Free worktrees: ${free.join(', ')}` : 'Every worktree is busy'}</p></div></div>
      </section>
    );
  }
  return (
    <section className={`sheet-sec agent-call says-${thread.status}`}>
      <div className="agent-card">
        <span className="agent-avatar"><Icon name="inbox" /></span>
        <div><strong>Agent update</strong><p className="m">{thread.worktree}{thread.environmentLabel ? ` · ${thread.environmentLabel}` : ''}{thread.available === false ? ' offline · last known update ' : ' · '}{ago(thread.lastActivityAt)}</p></div>
        <span className={`agent-status ${thread.status === 'failed' ? 'is-error' : ''}`}>{STATUS_TEXT[thread.status]}</span>
      </div>
      <a className="agent-thread" {...t3LinkProps(thread)}>{thread.title} <Icon name="external" /></a>
      <p className="agent-model">{thread.model}{thread.branch ? ` · ${thread.branch}` : ''}</p>
      <AgentSays thread={thread} />
    </section>
  );
}

/** What the agent is waiting on you for: its questions, or its last message. */
export function AgentSays({ thread }: { thread: ThreadSummary }) {
  if (thread.status === 'question') return <Questions thread={thread} />;
  if (!thread.lastAgentMessage || !['your-turn', 'failed', 'plan', 'approval'].includes(thread.status)) return null;
  return <Markdown className={`ask ${thread.status === 'plan' ? 'plan' : thread.status === 'failed' ? 'failed' : 'review'}`} text={thread.lastAgentMessage} />;
}

function Questions({ thread }: { thread: ThreadSummary }) {
  const { act, busy } = useStore();
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [own, setOwn] = useState<Record<string, string>>({});

  const choice = (qid: string, recommended: number | null) => (qid in picked ? picked[qid] : recommended ?? -2);
  const answers = Object.fromEntries(thread.questions.flatMap((q) => {
    const c = choice(q.id, q.recommended);
    const value = c === -1 ? own[q.id]?.trim() : q.options[c]?.value;
    return value ? [[q.id, value]] : [];
  }));
  const complete = Object.keys(answers).length === thread.questions.length;

  return (
    <>
      {thread.questions.map((q) => {
        const c = choice(q.id, q.recommended);
        return (
          <div className="question" key={q.id}>
            <p>{q.question}</p>
            <div className="opts" role="radiogroup">
              {q.options.map((option, i) => (
                <button key={option.value} role="radio" aria-checked={c === i} className={`opt ${c === i ? 'is-on' : ''}`} onClick={() => setPicked({ ...picked, [q.id]: i })}>
                  <i /><span>{option.label}{i === q.recommended && <em className="rec">Recommended</em>}</span>
                </button>
              ))}
              {q.allowCustomAnswer && (
                <button role="radio" aria-checked={c === -1} className={`opt own ${c === -1 ? 'is-on' : ''}`} onClick={() => setPicked({ ...picked, [q.id]: -1 })}>
                  <i /><span>Something else</span>
                </button>
              )}
              {c === -1 && <input className="own-text" aria-label={`Your answer to: ${q.question}`} autoFocus placeholder="Your answer" value={own[q.id] ?? ''} onChange={(e) => setOwn({ ...own, [q.id]: e.target.value })} />}
            </div>
          </div>
        );
      })}
      <div className="question-send">
        <button
          className="btn primary"
          disabled={!complete || busy || thread.available === false}
          onClick={() => act(async () => {
            await api.answer(thread.id, { requestId: thread.questionRequestId!, answers });
            return `Sent. The agent in ${thread.worktree} is working again.`;
          })}
        >
          Send {thread.questions.length > 1 ? 'answers' : 'answer'}
        </button>
      </div>
    </>
  );
}

function DescriptionSections({ detail }: { detail: ItemDetail }) {
  const sections = [
    ['Repro steps', detail.reproSteps],
    ['Description', detail.description],
    ['Acceptance criteria', detail.acceptanceCriteria],
    ['QA notes', detail.qaNotes],
  ].filter(([, text]) => text);
  return (
    <>
      {sections.map(([title, text]) => (
        <details className="sheet-disclosure" key={title}>
          <summary>{title}</summary>
          <div className="sheet-sec">
          <p className="prose">{text}</p>
          </div>
        </details>
      ))}
      {detail.comments.length > 0 && (
        <section className="sheet-sec">
          <h4>Latest discussion</h4>
          <ul className="comments">
            {detail.comments.slice(0, 3).map((c) => <li key={c.at}><b>{c.by}</b> <span className="m">{ago(c.at)}</span><p className="prose">{c.text}</p></li>)}
          </ul>
        </section>
      )}
    </>
  );
}

export function Actions({ o, item, className = 'sheet-actions' }: { o: ItemOverview | null; item: WorkItemSummary; className?: string }) {
  const { act, openStart, busy } = useStore();
  const thread = o?.threads[0];
  const buttons: React.ReactNode[] = [];
  const extraButtons: React.ReactNode[] = [];
  const start = <button key="start" className="btn primary" disabled={busy} onClick={() => openStart(item)}>Start in T3</button>;

  if (!o) {
    buttons.push(start, <button key="q" className="btn" disabled={busy} onClick={() => act(async () => { await api.queue(item.id); return `${item.id} added to Up next`; })}>Queue</button>);
  } else {
    if (o.suggestion?.to) {
      const to = o.suggestion.to;
      buttons.push(<button key="move" className="btn primary" disabled={busy} onClick={() => act(async () => `${item.id} moved to ${(await api.moveState(item.id, to)).state} in ADO`)}>Move to {to}</button>);
    }
    if (o.suggestion) buttons.push(<button key="keep" className="btn" disabled={busy} onClick={() => act(async () => { await api.dismiss(item.id); return 'Suggestion hidden'; })}>{o.suggestion.to ? `Keep ${item.state}` : 'Hide this'}</button>);
    if (thread && thread.status !== 'settled' && thread.status !== 'question') {
      buttons.push(<a key="t3" className="btn btn-link" {...t3LinkProps(thread)}>Open in T3 Code <Icon name="external" /></a>);
      extraButtons.push(<a key="t3-web" className="btn" href={thread.link} target="_blank" rel="noopener noreferrer">Open thread in browser</a>);
    }
    if (thread && (thread.status === 'your-turn' || thread.status === 'failed')) {
      extraButtons.push(<button key="settle" className="btn" disabled={busy || thread.available === false} onClick={() => act(async () => { await api.settle(thread.id); return `Thread settled. ${thread.worktree} is free again.`; })}>Settle thread</button>);
    }
    if (!thread || thread.status === 'settled') buttons.unshift(start);
    if (o.bay === 'idle') buttons.push(<button key="q" className="btn" disabled={busy} onClick={() => act(async () => { await api.queue(item.id); return `${item.id} added to Up next`; })}>Queue</button>);
    if (o.queuedAt) buttons.push(<button key="uq" className="btn" disabled={busy} onClick={() => act(async () => { await api.unqueue(item.id); return 'Removed from Up next'; })}>Remove from queue</button>);
  }
  if (!buttons.length) return null;
  return <div className={className}>{buttons}{extraButtons.length > 0 && <details className="more-actions"><summary>More actions</summary><div className="extra-actions">{extraButtons}</div></details>}</div>;
}
