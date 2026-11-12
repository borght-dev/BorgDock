import clsx from 'clsx';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Copy,
  FilePlus2,
  GitPullRequest,
  History,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  SlidersHorizontal,
} from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useMemo, useRef, useState } from 'react';
import {
  avatarToneFor,
  getInitials,
  MiniAvatar,
  StatePill,
} from '@/components/work-items/shared/wi-visuals';
import {
  type ActivityEvent,
  type ActivityFieldChange,
  type ActivityFilter,
  type ActivityLink,
  type AgentStep,
  buildActivity,
  clockTime,
  dateRange,
  shortDate,
  shortHash,
} from '@/services/ado/activity';
import type { AdoClient } from '@/services/ado/client';
import type { WorkItemComment } from '@/types';
import { sanitizeHtml } from '@/utils/sanitize-html';
import { useWorkItemUpdates } from './useWorkItemUpdates';
import '@/styles/work-item-activity.css';

export interface ActivityTabProps {
  itemId: number;
  comments: WorkItemComment[];
  isLoadingComments: boolean;
  onAddComment?: (text: string) => Promise<void>;
  getClient: () => AdoClient | null;
  readOnly?: boolean;
  /** Fixes "now" for day headings (stories, tests). */
  now?: number;
}

/** A run shows this many steps until "N more steps" is opened. */
const VISIBLE_STEPS = 4;

const ICON = { size: 12, strokeWidth: 2.25, 'aria-hidden': true } as const;

/**
 * The Activity tab: one timeline of the item's revisions (state, fields,
 * links) and its discussion, newest first. An agent's signed comments fold
 * into one run, so a long autoship run is one card instead of twenty
 * comments.
 */
export function ActivityTab({
  itemId,
  comments,
  isLoadingComments,
  onAddComment,
  getClient,
  readOnly = false,
  now,
}: ActivityTabProps) {
  const history = useWorkItemUpdates(itemId, getClient);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [fold, setFold] = useState(true);

  const activity = useMemo(
    () =>
      buildActivity(history.updates, comments, {
        now: now ?? Date.now(),
        filter,
        foldAgentRuns: fold,
      }),
    [history.updates, comments, now, filter, fold],
  );
  const clock = now ?? Date.now();

  const filters: { id: ActivityFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'comments', label: 'Comments' },
    { id: 'changes', label: 'Changes' },
    ...(activity.counts.agent > 0
      ? [{ id: 'agent' as const, label: activity.agentName ?? 'Agents' }]
      : []),
  ];
  const loading = history.isLoading || isLoadingComments;
  const empty = activity.days.length === 0;

  return (
    <div className="bd-wi-act" data-activity-tab="">
      <div className="bd-wi-act__bar">
        <div className="bd-wi-act__seg" role="group" aria-label="Show">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className="bd-wi-act__seg-btn"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="bd-wi-act__seg-count">{activity.counts[f.id]}</span>
            </button>
          ))}
        </div>
        <span className="bd-wi-act__spacer" />
        {activity.counts.agent > 0 && (
          <button
            type="button"
            role="switch"
            aria-checked={fold}
            className="bd-wi-act__switch"
            onClick={() => setFold((v) => !v)}
          >
            <span className="bd-wi-act__switch-track" aria-hidden="true" />
            Fold agent runs
          </button>
        )}
      </div>

      {!readOnly && onAddComment && <Composer onAddComment={onAddComment} />}

      {history.failed && (
        <p className="bd-wi-act__note">History is unavailable right now; comments still show.</p>
      )}

      {loading && empty ? (
        <div className="bd-wi-act__loading" role="status" aria-label="Loading activity">
          <span className="bd-skeleton-line" style={{ width: '55%' }} />
          <span className="bd-skeleton-line" style={{ width: '80%' }} />
          <span className="bd-skeleton-line" style={{ width: '40%' }} />
        </div>
      ) : empty ? (
        <p className="bd-wi-act__empty">
          {filter === 'all' ? 'No activity yet.' : 'Nothing of this kind yet.'}
        </p>
      ) : (
        <ol className="bd-wi-act__tl">
          {activity.days.map((day) => (
            <li key={day.key} className="bd-wi-act__day">
              <h3 className="bd-wi-act__day-label">{day.label}</h3>
              <ol className="bd-wi-act__events">
                {day.events.map((event) => (
                  <ActivityRow key={event.key} event={event} now={clock} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---- Composer ----

function Composer({ onAddComment }: { onAddComment: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || posting) return;
    setPosting(true);
    try {
      await onAddComment(value);
      setText('');
      requestAnimationFrame(grow);
    } finally {
      setPosting(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="bd-wi-act__composer">
      <MessageSquare size={14} strokeWidth={2} aria-hidden className="bd-wi-act__composer-icon" />
      <textarea
        ref={ref}
        rows={1}
        className="bd-wi-act__composer-input"
        aria-label="Comment"
        placeholder="Comment… @ mentions someone, AB# links an item"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          grow();
        }}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="bd-wi-act__composer-send"
        disabled={!text.trim() || posting}
        onClick={() => void submit()}
        title="Comment (Ctrl+Enter)"
      >
        {posting ? 'Posting…' : 'Comment'}
      </button>
    </div>
  );
}

// ---- Rows ----

function Gutter({ children, kind }: { children: ReactNode; kind?: 'bot' | 'avatar' }) {
  return (
    <span className="bd-wi-act__gutter">
      {kind ? children : <span className="bd-wi-act__icon">{children}</span>}
    </span>
  );
}

function Time({ iso }: { iso: string }) {
  return (
    <time className="bd-wi-act__time" dateTime={iso} title={new Date(iso).toLocaleString()}>
      {clockTime(iso)}
    </time>
  );
}

function ActivityRow({ event, now }: { event: ActivityEvent; now: number }) {
  switch (event.kind) {
    case 'state':
      return (
        <li className="bd-wi-act__ev" data-event="state">
          <Gutter>
            <ArrowRight {...ICON} />
          </Gutter>
          <div className="bd-wi-act__body">
            <div className="bd-wi-act__line">
              <b>{event.author}</b>
              {event.from ? 'moved it' : 'set the state to'}
              {event.from && <StatePill state={event.from} compact />}
              {event.from && <ArrowRight {...ICON} className="bd-wi-act__arrow" />}
              <StatePill state={event.to} compact />
              <Time iso={event.at} />
            </div>
          </div>
        </li>
      );
    case 'fields':
      return (
        <li className="bd-wi-act__ev" data-event="fields">
          <Gutter>
            <SlidersHorizontal {...ICON} />
          </Gutter>
          <div className="bd-wi-act__body">
            <div className="bd-wi-act__line bd-wi-act__line--wrap">
              <b>{event.author}</b>
              <FieldChanges
                changes={event.changes}
                added={event.tagsAdded}
                removed={event.tagsRemoved}
              />
              <Time iso={event.at} />
            </div>
          </div>
        </li>
      );
    case 'link':
      return (
        <li className="bd-wi-act__ev" data-event="link">
          <Gutter>
            {event.links.some((l) => l.kind === 'pr') ? (
              <GitPullRequest {...ICON} />
            ) : event.links.some((l) => l.kind === 'attachment') ? (
              <Paperclip {...ICON} />
            ) : (
              <Link2 {...ICON} />
            )}
          </Gutter>
          <div className="bd-wi-act__body">
            <div className="bd-wi-act__line bd-wi-act__line--wrap">
              <b>{event.author}</b>
              {event.links.map((link) => (
                <LinkChange
                  key={`${link.removed ? '-' : '+'}${link.kind}:${link.number ?? link.detail ?? link.label}`}
                  link={link}
                />
              ))}
              <Time iso={event.at} />
            </div>
          </div>
        </li>
      );
    case 'created':
      return (
        <li className="bd-wi-act__ev" data-event="created">
          <Gutter>
            <FilePlus2 {...ICON} />
          </Gutter>
          <div className="bd-wi-act__body">
            <div className="bd-wi-act__line">
              <b>{event.author}</b>
              created this {event.workItemType ?? 'item'}
              <Time iso={event.at} />
            </div>
          </div>
        </li>
      );
    case 'comment': {
      const initials = getInitials(event.author);
      return (
        <li className="bd-wi-act__ev" data-event="comment">
          <Gutter kind="avatar">
            <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={24} />
          </Gutter>
          <div className="bd-wi-act__body">
            <div className="bd-wi-act__line">
              <b>{event.author}</b>
              <Time iso={event.at} />
            </div>
            <div
              className="bd-wi-act__bubble"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via sanitizeHtml
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.html) }}
            />
          </div>
        </li>
      );
    }
    case 'agentRun':
      return <AgentRunRow event={event} now={now} />;
  }
}

function FieldChanges({
  changes,
  added,
  removed,
}: {
  changes: ActivityFieldChange[];
  added: string[];
  removed: string[];
}) {
  const parts: { key: string; node: ReactNode }[] = changes.map((change, i) => ({
    key: change.field,
    node: <FieldChangeText change={change} first={i === 0} />,
  }));
  if (added.length > 0 || removed.length > 0) {
    parts.push({
      key: 'System.Tags',
      node: (
        <span className="bd-wi-act__change">
          {parts.length === 0 ? 'set ' : ''}
          <span className="bd-wi-act__field">Tags</span>
          {added.map((t) => (
            <span key={`+${t}`} className="bd-wi-act__tag bd-wi-act__tag--added">
              +{t}
            </span>
          ))}
          {removed.map((t) => (
            <span key={`-${t}`} className="bd-wi-act__tag bd-wi-act__tag--removed">
              −{t}
            </span>
          ))}
        </span>
      ),
    });
  }
  return (
    <>
      {parts.map((part, i) => (
        <span key={part.key} className="bd-wi-act__part">
          {i > 0 && <span className="bd-wi-act__sep">,</span>}
          {part.node}
        </span>
      ))}
    </>
  );
}

/** "set Severity 3 → 2"; only the first change of a row says "set". */
function FieldChangeText({ change, first }: { change: ActivityFieldChange; first: boolean }) {
  if (change.edited) {
    return (
      <span className="bd-wi-act__change">
        edited <span className="bd-wi-act__field">{change.label}</span>
      </span>
    );
  }
  if (change.to === null) {
    return (
      <span className="bd-wi-act__change">
        cleared <span className="bd-wi-act__field">{change.label}</span>
        {change.from && <del className="bd-wi-act__old">{change.from}</del>}
      </span>
    );
  }
  return (
    <span className="bd-wi-act__change">
      {first && 'set '}
      <span className="bd-wi-act__field">{change.label}</span>
      {change.from && (
        <>
          <del className="bd-wi-act__old">{change.from}</del>
          <ArrowRight {...ICON} className="bd-wi-act__arrow" />
        </>
      )}
      <b>{change.to}</b>
    </span>
  );
}

function LinkChange({ link }: { link: ActivityLink }) {
  const verb = link.removed ? 'removed' : 'linked';
  if (link.kind === 'pr') {
    return (
      <span className="bd-wi-act__change">
        {verb}
        <span className="bd-wi-act__chip">
          <GitPullRequest {...ICON} className="bd-wi-act__chip-icon" />
          <span className="bd-wi-act__chip-num">#{link.number}</span>
          {link.detail && <span className="bd-wi-act__chip-text">{link.detail}</span>}
        </span>
      </span>
    );
  }
  if (link.kind === 'item') {
    return (
      <span className="bd-wi-act__change">
        {link.removed ? 'removed' : 'added'} {link.label}
        {link.number !== null && <span className="bd-wi-act__ref">AB#{link.number}</span>}
      </span>
    );
  }
  if (link.kind === 'attachment') {
    return (
      <span className="bd-wi-act__change">
        {link.removed ? 'removed' : 'attached'}
        <span className="bd-wi-act__field">{link.detail ?? 'a file'}</span>
      </span>
    );
  }
  return (
    <span className="bd-wi-act__change">
      {verb} {link.kind === 'hyperlink' ? 'a link' : `a ${link.label}`}
    </span>
  );
}

// ---- Agent runs ----

function AgentRunRow({
  event,
  now,
}: {
  event: Extract<ActivityEvent, { kind: 'agentRun' }>;
  now: number;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const steps = event.steps;
  const visible = showAll ? steps : steps.slice(0, VISIBLE_STEPS);
  const hidden = steps.length - visible.length;
  const multiDay = new Date(event.since).toDateString() !== new Date(event.at).toDateString();

  return (
    <li className="bd-wi-act__ev" data-event="agent-run">
      <Gutter kind="bot">
        <span className="bd-wi-act__bot">
          <Bot size={13} strokeWidth={2.25} aria-hidden />
        </span>
      </Gutter>
      <div className="bd-wi-act__body">
        <div className="bd-wi-act__line">
          <b>{event.author}</b>
          <span className="bd-wi-act__muted">
            · {steps.length === 1 ? steps[0]!.kind : `${steps.length} steps`}
          </span>
          <span className="bd-wi-act__time">
            {multiDay ? dateRange(event.since, event.at, now) : clockTime(event.at)}
          </span>
          {steps.length > 1 && (
            <span className="bd-wi-act__dots" aria-hidden="true">
              {[...steps].reverse().map((s) => (
                <i key={s.id} data-warn={s.warn || undefined} />
              ))}
            </span>
          )}
        </div>
        <div className="bd-wi-act__run">
          {visible.map((step) => (
            <AgentStepRow
              key={step.id}
              step={step}
              open={open === step.id}
              multiDay={multiDay}
              now={now}
              onToggle={() => setOpen((cur) => (cur === step.id ? null : step.id))}
            />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              className="bd-wi-act__step bd-wi-act__step--more"
              onClick={() => setShowAll(true)}
            >
              <MoreHorizontal {...ICON} />
              <span className="bd-wi-act__step-sum">
                {hidden} more step{hidden === 1 ? '' : 's'}
              </span>
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function AgentStepRow({
  step,
  open,
  multiDay,
  now,
  onToggle,
}: {
  step: AgentStep;
  open: boolean;
  multiDay: boolean;
  now: number;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const paragraphs = step.detail.split('\n').filter(Boolean);
  return (
    <div className={clsx('bd-wi-act__step-wrap', open && 'bd-wi-act__step-wrap--open')}>
      <button
        type="button"
        className="bd-wi-act__step"
        aria-expanded={open}
        data-warn={step.warn || undefined}
        onClick={onToggle}
      >
        <span className="bd-wi-act__step-icon">
          {step.warn ? <History {...ICON} /> : <Check {...ICON} />}
        </span>
        <span className="bd-wi-act__kind">{step.kind}</span>
        <span className="bd-wi-act__step-sum">{step.summary}</span>
        <span className="bd-wi-act__time">
          {multiDay ? shortDate(step.at, now) : clockTime(step.at)}
        </span>
        <ChevronDown {...ICON} className="bd-wi-act__chev" />
      </button>
      {open && (
        <div className="bd-wi-act__step-open">
          {paragraphs.map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs of one fixed text
            <p key={i}>{p}</p>
          ))}
          {step.proofs.length > 0 && (
            <div className="bd-wi-act__proofs">
              {step.proofs.map((proof) => (
                <span key={proof.value} className="bd-wi-act__proof">
                  {proof.label} <code title={proof.value}>{shortHash(proof.value)}</code>
                  <button
                    type="button"
                    className="bd-wi-act__copy"
                    aria-label={`Copy ${proof.label} ${shortHash(proof.value)}`}
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(proof.value)
                        .then(() => setCopied(proof.value))
                        .catch(() => {});
                    }}
                  >
                    {copied === proof.value ? <Check {...ICON} /> : <Copy {...ICON} />}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
