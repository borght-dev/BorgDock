import clsx from 'clsx';
import { Pin } from 'lucide-react';
import { Dot, IconButton, Pill, SegmentedProgress } from '@/components/shared/primitives';
import type { Assessment } from '@/services/workstreams/attention';
import { setPinned } from '@/services/workstreams/edits';
import type { Entry } from '@/stores/workstreams-store';
import { NextActionInline } from './NextActionInline';
import { ATTENTION_DOT, ago, plural, wsEdit } from './ws-ui';

interface WorkstreamCardProps {
  entry: Entry;
  assessment: Assessment | undefined;
  selected: boolean;
  editingNextAction: boolean;
  now: number;
  onOpen: (id: string) => void;
  onSelect: (id: string) => void;
  onEditNextAction: (id: string | null) => void;
}

const STATUS_PILL = {
  paused: { tone: 'neutral', label: 'Paused' },
  done: { tone: 'merged', label: 'Done' },
  archived: { tone: 'ghost', label: 'Archived' },
} as const;

/** The goal's first line, without Markdown marks. */
function firstLine(goal: string): string {
  const line = goal.split('\n').find((l) => l.trim()) ?? '';
  return line
    .replace(/^[#>*\-\s]+/, '')
    .replace(/[*_`]/g, '')
    .trim();
}

/**
 * WorkstreamCard — one goal in the list: its next action (typed in place),
 * how many required outcomes are verified, what needs you first, the kinds
 * of records it holds and whether each source is current.
 */
export function WorkstreamCard({
  entry,
  assessment,
  selected,
  editingNextAction,
  now,
  onOpen,
  onSelect,
  onEditNextAction,
}: WorkstreamCardProps) {
  const document = entry.document;
  const top = assessment?.attention[0];
  const more = (assessment?.attention.length ?? 0) - 1;
  const progress = assessment?.progress ?? { counted: 0, required: 0 };
  const counts = assessment?.counts;
  const kinds = counts
    ? [
        counts.items > 0 && plural(counts.items, 'item'),
        counts.pullRequests > 0 && plural(counts.pullRequests, 'PR'),
        counts.threads > 0 && plural(counts.threads, 'thread'),
        counts.links > 0 && plural(counts.links, 'link'),
      ].filter(Boolean)
    : [];
  const status = document.status === 'active' ? null : STATUS_PILL[document.status];
  const goal = firstLine(document.goal);

  return (
    <article
      className={clsx('bd-ws-card', selected && 'bd-ws-card--selected')}
      data-workstream-id={document.id}
      data-selected={selected || undefined}
      aria-label={document.title}
      onClick={() => onSelect(document.id)}
      onDoubleClick={() => onOpen(document.id)}
    >
      <header className="bd-ws-card__head">
        <button
          type="button"
          className="bd-ws-card__title"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(document.id);
          }}
        >
          {document.title}
        </button>
        {status && <Pill tone={status.tone}>{status.label}</Pill>}
        {entry.readOnly && <Pill tone="ghost">Read-only</Pill>}
        <IconButton
          icon={<Pin size={13} strokeWidth={2} />}
          size={22}
          active={document.pinned}
          aria-pressed={document.pinned}
          aria-label={document.pinned ? 'Unpin' : 'Pin to the top'}
          tooltip={document.pinned ? 'Unpin' : 'Pin to the top'}
          disabled={entry.readOnly}
          onClick={(e) => {
            e.stopPropagation();
            wsEdit(document.id, (d) => setPinned(d, !d.pinned));
          }}
        />
      </header>
      {goal && <p className="bd-ws-card__goal">{goal}</p>}

      <div className="bd-ws-next">
        <span className="bd-ws-next__label">Next</span>
        <NextActionInline
          workstreamId={document.id}
          nextAction={document.nextAction}
          editing={editingNextAction}
          readOnly={entry.readOnly}
          onEditing={(editing) => onEditNextAction(editing ? document.id : null)}
        />
      </div>

      <div className="bd-ws-card__progress">
        <SegmentedProgress
          passed={progress.counted}
          running={0}
          total={Math.max(progress.required, 1)}
          aria-hidden="true"
        />
        <span>
          {progress.required === 0
            ? 'No required outcomes yet'
            : `${progress.counted} of ${plural(progress.required, 'required outcome')} verified`}
        </span>
      </div>

      {top && (
        <p className="bd-ws-card__attention" data-tone={top.tone}>
          <Dot tone={ATTENTION_DOT[top.tone]} size={7} />
          <span>{top.reason}</span>
          {more > 0 && <span className="bd-ws-card__more">+{more}</span>}
        </p>
      )}
      {entry.saveError && (
        <p className="bd-ws-card__attention" data-tone="bad">
          <Dot tone="red" size={7} />
          <span>Not saved: {entry.saveError}</span>
        </p>
      )}

      <footer className="bd-ws-card__foot">
        <span>{kinds.length > 0 ? kinds.join(' · ') : 'No records yet'}</span>
        <span className="bd-ws-card__health">
          {assessment?.health.map((source) => (
            <span key={source.label} title={`${source.label}: ${source.detail}`}>
              <Dot tone={ATTENTION_DOT[source.tone]} size={6} />
              {source.label}
            </span>
          ))}
        </span>
        <span className="bd-ws-card__updated">
          {ago(document.updatedAt || document.createdAt, now)}
          {document.writtenBy.deviceLabel ? ` on ${document.writtenBy.deviceLabel}` : ''}
        </span>
      </footer>
    </article>
  );
}
