import clsx from 'clsx';
import { memo, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import { WorkItemTypePill } from '@/components/work-items/WorkItemTypePill';
import { ItemChips } from '@/components/workstreams/Membership';
import { type ItemOverview, type LatestMessage, NEEDS_YOU } from '@/services/dispatch/types';
import { StateMenu } from './StateMenu';
import { type DispatchActions, unitActions } from './unit-actions';
import { whenLabel } from './unit-copy';

/** Actions a row offers itself; the rest live in the detail. */
const THREAD_ACTIONS = new Set(['answer-recommended', 'approve-plan', 'open-t3']);
const START_VERDICTS = new Set(['Not started', 'Nobody on it', 'Bounced back']);
const PULL_REQUEST_VERDICTS = new Set(['Ready to merge', 'CI red', 'PR open', 'In review']);

interface RowAction {
  label: string;
  primary: boolean;
  run: (actions: DispatchActions) => void;
}

/** The one action a row offers, if any: what its verdict asks for. */
export function rowAction(overview: ItemOverview): RowAction | null {
  const { item, verdict, threads, pullRequests, suggestion } = overview;
  const waiting = threads.find((t) => t.open && NEEDS_YOU.includes(t.status));
  if (waiting) {
    const action = unitActions(overview).find((a) => THREAD_ACTIONS.has(a.id));
    if (action) return { label: action.label, primary: true, run: action.run };
  }
  if (suggestion) {
    const to = suggestion.to;
    return { label: `Move to ${to}`, primary: true, run: (a) => a.move(item, to) };
  }
  const open = pullRequests.find((pr) => pr.state === 'open');
  if (open && PULL_REQUEST_VERDICTS.has(verdict.label)) {
    return {
      label: `Open #${open.number}`,
      primary: verdict.tone === 'ok',
      run: (a) => a.openPullRequest(open),
    };
  }
  if (item.state === 'Needs Human') {
    return {
      label: 'Answer in ADO',
      primary: verdict.tone === 'bad',
      run: (a) => a.openInAdo(item),
    };
  }
  if (START_VERDICTS.has(verdict.label) && !threads.some((t) => t.open)) {
    return { label: 'Start', primary: false, run: (a) => a.start(item) };
  }
  return null;
}

/** `Vera · plan` signs as Vera; anything else is a plain comment. */
function sourceTag(latest: LatestMessage): string {
  if (latest.source !== 'comment') return latest.source;
  const signer = latest.author.split(' · ')[0];
  return latest.author.includes(' · ') && signer ? signer : 'comment';
}

function LatestLine({
  latest,
  now,
  quote,
}: {
  latest: LatestMessage | null;
  now: number;
  /** Show the whole message, set off: what waits on you is worth reading in full. */
  quote: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!latest) return null;
  const tag = sourceTag(latest);
  const when = whenLabel(latest.at, now);
  const meta = (
    <>
      <span className="bd-dp-latest__tag" data-source={latest.source} data-tag={tag}>
        {tag}
      </span>
      <span className="bd-dp-latest__who">
        {latest.author}
        {when ? ` · ${when}` : ''}
      </span>
    </>
  );
  if (quote) {
    return (
      <blockquote className="bd-dp-latest bd-dp-latest--quote">
        <span className="bd-dp-latest__meta">{meta}</span>
        <span className="bd-dp-latest__text">{latest.text}</span>
      </blockquote>
    );
  }
  return (
    <button
      type="button"
      className={clsx('bd-dp-latest', open && 'bd-dp-latest--open')}
      aria-expanded={open}
      title={open ? undefined : latest.text}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((was) => !was);
      }}
    >
      {meta}
      <span className="bd-dp-latest__text">{latest.text}</span>
    </button>
  );
}

export interface WalkRowProps {
  overview: ItemOverview;
  selected: boolean;
  /** Where a running sync that has this item works, if one does. */
  inRun?: string;
  /** Epoch ms the relative times are measured from. */
  now: number;
  busy: boolean;
  actions: DispatchActions;
  onSelect: (id: number) => void;
  /** Enter, or a double click: open the work item full screen. */
  onOpen: (id: number) => void;
}

/**
 * WalkRow — one item in the walk: its title, the verdict and the one action
 * it asks for, the state it can be moved out of, the facts behind the verdict
 * and the newest thing said about it. A click opens its detail.
 */
export const WalkRow = memo(function WalkRow({
  overview,
  selected,
  inRun,
  now,
  busy,
  actions,
  onSelect,
  onOpen,
}: WalkRowProps) {
  const { item, verdict, evidence, latest } = overview;
  const action = rowAction(overview);
  const quiet = verdict.tone === 'mute' || verdict.tone === 'run';
  const waitsOnYou =
    item.state === 'Needs Human' ||
    overview.threads.some((t) => t.open && NEEDS_YOU.includes(t.status));
  const quote =
    waitsOnYou && verdict.tone === 'bad' && latest !== null && latest.source !== 'notes';
  return (
    <div
      className="bd-dp-wrow"
      data-dp-id={item.id}
      data-tone={verdict.tone}
      data-quiet={quiet ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      role="button"
      tabIndex={0}
      aria-label={`${item.title}, AB#${item.id}, ${verdict.label}`}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(item.id)}
      onDoubleClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.defaultPrevented || e.target !== e.currentTarget) return;
        if (e.key === ' ') {
          e.preventDefault();
          onSelect(item.id);
        }
      }}
    >
      <WorkItemTypePill type={item.typeName} />
      <span className="bd-dp-wrow__title" title={item.title}>
        <em>{item.id}</em>
        {item.title}
      </span>
      <span className="bd-dp-wrow__side">
        <span className="bd-dp-verdict" data-tone={verdict.tone}>
          {verdict.label}
        </span>
        {action && (
          <Button
            variant={action.primary ? 'primary' : 'secondary'}
            size="sm"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              action.run(actions);
            }}
          >
            {action.label}
          </Button>
        )}
        <StateMenu item={item} disabled={busy} onMove={(state) => actions.move(item, state)} />
      </span>
      {(evidence.length > 0 || inRun) && (
        <span className="bd-dp-wrow__chips">
          {evidence.map((fact) => (
            <span key={fact.label} className="bd-dp-fact" data-tone={fact.tone ?? undefined}>
              {fact.label}
            </span>
          ))}
          {inRun && (
            <span className="bd-dp-fact bd-dp-fact--run" data-tone="run">
              in the {inRun} sync
            </span>
          )}
          <ItemChips id={item.id} />
        </span>
      )}
      {latest && (
        <span className="bd-dp-wrow__latest">
          <LatestLine latest={latest} now={now} quote={quote} />
        </span>
      )}
    </div>
  );
});
