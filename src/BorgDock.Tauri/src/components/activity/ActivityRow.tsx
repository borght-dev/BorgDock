import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { AgentSays } from '@/components/dispatch/AgentSays';
import { Button } from '@/components/shared/primitives';
import { Menu } from '@/components/workstreams/Menu';
import { act, actionLabel, revalidate } from '@/services/activity/actions';
import type { ActivityEntry } from '@/services/activity/types';
import { dispatchActions } from '@/services/dispatch/actions';
import { scopedId } from '@/services/dispatch/hosts';
import type { AgentThread } from '@/services/dispatch/types';
import { useActivityViewStore } from '@/stores/activity-view-store';
import { useCiFailuresStore } from '@/stores/ci-failures-store';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { showToast } from '@/stores/toast-store';
import { CATEGORY_ICON } from './icons';
import { whenOf } from './rows';

export interface ActivityRowProps {
  entry: ActivityEntry;
  /** How many more updates of the same entity that day are folded under this row. */
  folded: number;
  group: string;
  child: boolean;
  selected: boolean;
  expanded: boolean;
  sourceLabel: string;
  /** The source was removed from settings: actions are off. */
  retired: boolean;
  open: boolean;
}

function timeLabel(entry: ActivityEntry): string {
  const time = new Date(whenOf(entry)).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return entry.sourceAt === null && entry.coverage === 'catch-up'
    ? `${time}, noticed after reconnect`
    : time;
}

function statusLabel(entry: ActivityEntry): string | null {
  if (entry.status === 'open') return null;
  if (entry.status === 'superseded') return 'Superseded';
  const by = entry.resolvedBy ?? '';
  if (by === 'answered') return 'Answered';
  if (/\|/.test(by)) return 'Resolved';
  return by ? by.charAt(0).toUpperCase() + by.slice(1) : 'Resolved';
}

/** The thread an answer entry asks in, while it still asks that question. */
function askingThread(entry: ActivityEntry, threads: readonly AgentThread[]): AgentThread | null {
  const action = entry.action;
  if (action?.kind !== 'answer' || entry.status !== 'open') return null;
  const thread = threads.find((t) => t.id === scopedId(action.hostId, action.threadId));
  if (!thread || thread.status !== 'question') return null;
  return (thread.questionRequestId ?? thread.run?.pendingRequest?.id) === action.requestId
    ? thread
    : null;
}

/** The question, inline, with its options. */
function InlineAnswer({ entry, thread }: { entry: ActivityEntry; thread: AgentThread }) {
  return (
    <AgentSays
      thread={thread}
      onAnswer={(answers) => {
        dispatchActions.answer(thread, answers);
        void useActivityViewStore.getState().mark([entry.id], 'read', 'Answered', 'user');
      }}
    />
  );
}

/**
 * ActivityRow — one entry: what changed in one sentence, where and when,
 * its status, the one action that fits, and a menu. Selected, it shows its
 * detail: the question with its options, the agent's last message, the
 * failing jobs, the run log.
 */
export function ActivityRow({
  entry,
  folded,
  group,
  child,
  selected,
  expanded,
  sourceLabel,
  retired,
  open,
}: ActivityRowProps) {
  const view = useActivityViewStore.getState;
  const [busy, setBusy] = useState(false);
  const threads = useDispatchStore((s) => s.threads);
  const hosts = useDispatchStore((s) => s.hosts);
  const pullRequests = usePrStore((s) => s.pullRequests);
  const groups = useCiFailuresStore((s) => s.groups);
  const Icon = CATEGORY_ICON[entry.category];
  const check = revalidate(entry, retired, { threads, hosts, pullRequests, groups });
  const asking = expanded ? askingThread(entry, threads) : null;
  const primary = check.ok ? check.action : check.fallback;
  const status = statusLabel(entry);
  const unread = entry.read === 'unread';
  const needsYou = unread && entry.needsYou && entry.status === 'open';

  const runPrimary = async () => {
    if (!primary) return;
    setBusy(true);
    try {
      const { reason } = await act(entry, retired);
      if (reason) showToast({ message: `${reason}. Opened it instead.` });
      void view().refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={clsx(
        'bd-act-row',
        unread && 'bd-act-row--unread',
        needsYou && 'bd-act-row--needs-you',
        selected && 'bd-act-row--selected',
        expanded && 'bd-act-row--expanded',
        child && 'bd-act-row--child',
        entry.status !== 'open' && 'bd-act-row--closed',
      )}
      data-activity-id={entry.id}
      data-severity={entry.severity}
      aria-selected={selected}
      role="option"
      tabIndex={-1}
      onClick={() => view().toggleExpanded(entry.id)}
    >
      <span className="bd-act-row__icon" aria-hidden="true">
        <Icon size={14} strokeWidth={1.8} />
      </span>
      <div className="bd-act-row__main">
        <span className="bd-act-row__summary">{entry.summary}</span>
        <span className="bd-act-row__meta">
          <span className="bd-act-row__source" title={entry.sourceId}>
            {sourceLabel}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={whenOf(entry)}>{timeLabel(entry)}</time>
          {status && <span className="bd-act-row__status">{status}</span>}
          {!check.ok && entry.status === 'open' && check.reason !== 'Nothing to do' && (
            <span className="bd-act-row__stale">{check.reason}</span>
          )}
          {folded > 0 && (
            <button
              type="button"
              className="bd-act-row__fold"
              aria-expanded={open}
              onClick={(e) => {
                e.stopPropagation();
                view().toggleGroup(group);
              }}
            >
              {open ? 'Hide' : `${folded} more update${folded === 1 ? '' : 's'}`}
            </button>
          )}
        </span>
        {expanded && (
          <div className="bd-act-row__detail" onClick={(e) => e.stopPropagation()}>
            {asking ? (
              <InlineAnswer entry={entry} thread={asking} />
            ) : (
              entry.detail && <p className="bd-act-row__detail-text">{entry.detail}</p>
            )}
          </div>
        )}
      </div>
      {primary && (
        <Button
          variant={check.ok && needsYou ? 'primary' : 'secondary'}
          size="sm"
          className="bd-act-row__action"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            void runPrimary();
          }}
        >
          {check.ok ? actionLabel(primary) : 'Open'}
        </Button>
      )}
      <span onClick={(e) => e.stopPropagation()} className="bd-act-row__menu">
        <Menu
          label={`More for ${entry.summary}`}
          trigger={(props) => (
            <button type="button" className="bd-act-row__more" aria-label="More" {...props}>
              <MoreHorizontal size={14} />
            </button>
          )}
          groups={[
            {
              items: [
                unread
                  ? {
                      id: 'read',
                      label: 'Mark read',
                      hint: 'E',
                      onSelect: () => void view().mark([entry.id], 'read', 'Marked read'),
                    }
                  : {
                      id: 'unread',
                      label: 'Mark unread',
                      hint: 'U',
                      onSelect: () => void view().mark([entry.id], 'unread', 'Marked unread'),
                    },
                {
                  id: 'dismiss',
                  label: 'Dismiss',
                  hint: '#',
                  onSelect: () => void view().mark([entry.id], 'dismissed', 'Dismissed'),
                },
                {
                  id: 'source',
                  label: `Only ${sourceLabel}`,
                  onSelect: () => view().setSource(entry.sourceId),
                },
              ],
            },
          ]}
        />
      </span>
    </div>
  );
}
