import { CalendarRange, Flag } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Avatar } from '@/components/shared/primitives';
import {
  avatarToneFor,
  DEFAULT_STATE_META,
  DEFAULT_TYPE_META,
  getInitials,
  TypeGlyph,
  WI_STATES,
  WI_TYPES,
} from '@/components/work-items/shared/wi-visuals';
import { useWorkItemPeek, type WorkItemPeekState } from '@/hooks/useWorkItemPeek';
import { THREAD_STATUS_LABEL } from '@/services/dispatch/types';
import { detectWorkItemIds } from '@/services/work-item-linker';
import { workItemPeekOf } from '@/services/work-item-peek';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import type { WorkItem } from '@/types';
import { formatAgo } from '@/utils/relative-time';

/** A pull request or agent thread the card names, with how it is doing. */
export interface WorkItemCardLink {
  key: string;
  /** `#4812` for a pull request, `T3` for a thread. */
  lead: string;
  label: string;
  tone: 'ok' | 'fail' | 'run' | 'mute';
}

const TONE_COLOR: Record<WorkItemCardLink['tone'], string> = {
  ok: 'var(--color-status-green)',
  fail: 'var(--color-status-red)',
  run: 'var(--color-status-yellow)',
  mute: 'var(--color-text-faint)',
};

/** At most this many pull requests on one card. */
const MAX_PULL_REQUESTS = 2;

function checksLink(
  number: number,
  checks: { failed: number; pending: number; total: number } | null,
): WorkItemCardLink {
  const lead = `#${number}`;
  const key = `pr:${number}`;
  if (!checks || checks.total === 0) return { key, lead, label: 'no checks', tone: 'mute' };
  if (checks.failed > 0) return { key, lead, label: `${checks.failed} failing`, tone: 'fail' };
  if (checks.pending > 0) return { key, lead, label: 'checks running', tone: 'run' };
  return { key, lead, label: 'checks passing', tone: 'ok' };
}

/**
 * What the card lists next to the item: its open pull requests with their
 * checks and its current T3 thread, from Dispatch when it knows the item,
 * else the polled pull requests that name it.
 */
function useCardLinks(id: number): WorkItemCardLink[] {
  const overview = useDispatchStore((s) => s.overview);
  const pullRequests = usePrStore((s) => s.pullRequests);
  const unit = [...(overview?.items ?? []), ...(overview?.context ?? [])].find(
    (entry) => entry.item.id === id,
  );
  if (unit) {
    const prs = unit.pullRequests
      .filter((pr) => pr.state === 'open' && !pr.shared)
      .slice(0, MAX_PULL_REQUESTS)
      .map((pr) => checksLink(pr.number, pr.checks));
    const thread = unit.threads[0];
    const waiting = thread && thread.status !== 'settled' && thread.status !== 'running';
    return thread
      ? [
          ...prs,
          {
            key: `t3:${thread.id}`,
            lead: 'T3',
            label: THREAD_STATUS_LABEL[thread.status].toLowerCase(),
            tone: waiting ? 'run' : thread.status === 'running' ? 'ok' : 'mute',
          },
        ]
      : prs;
  }
  return pullRequests
    .filter((pr) => detectWorkItemIds(pr.pullRequest).includes(id))
    .slice(0, MAX_PULL_REQUESTS)
    .map((pr) =>
      checksLink(pr.pullRequest.number, {
        failed: pr.failedCheckNames.length,
        pending: pr.pendingCheckNames.length,
        total: pr.totalCheckCount,
      }),
    );
}

interface WorkItemCardViewProps {
  id: number;
  peek: WorkItemPeekState;
  links: WorkItemCardLink[];
  /** Ctrl+click opens the item in Azure DevOps. */
  canOpenWeb: boolean;
  now?: number;
}

function Footer({ children, canOpenWeb }: { children?: ReactNode; canOpenWeb: boolean }) {
  return (
    <div className="bd-hover-card__foot">
      {children}
      <span className="bd-hover-card__spacer" />
      <span>
        <kbd>Click</kbd> read
      </span>
      {canOpenWeb && (
        <span>
          <kbd>Ctrl</kbd>+<kbd>Click</kbd> ADO
        </span>
      )}
    </div>
  );
}

const MISSING_TEXT: Record<'unconfigured' | 'missing' | 'error', { title: string; body: string }> =
  {
    unconfigured: {
      title: 'Connect Azure DevOps to see this work item.',
      body: 'BorgDock reads its title, state and description with your Azure DevOps sign-in (Settings).',
    },
    missing: {
      title: 'This work item was not found.',
      body: 'It may have been deleted, or it lives in a project your account cannot read.',
    },
    error: {
      title: 'Azure DevOps did not answer.',
      body: 'Hover again in a moment to retry.',
    },
  };

/** The card itself, for any state of the item; the container feeds it. */
export function WorkItemCardView({ id, peek, links, canOpenWeb, now }: WorkItemCardViewProps) {
  if (peek.status === 'loading') {
    return (
      <div className="bd-wi-card" data-work-item-card={id} aria-busy="true">
        <div className="bd-wi-card__body">
          <div className="bd-wi-card__top">
            <span className="bd-wi-card__id">AB#{id}</span>
          </div>
          <div className="bd-skeleton-line" style={{ width: '92%', height: 12, marginTop: 12 }} />
          <div className="bd-skeleton-line" style={{ width: '60%', height: 12 }} />
          <div className="bd-wi-card__desc" style={{ display: 'block' }}>
            <div className="bd-skeleton-line" style={{ width: '100%' }} />
            <div className="bd-skeleton-line" style={{ width: '96%' }} />
            <div className="bd-skeleton-line" style={{ width: '78%' }} />
          </div>
        </div>
      </div>
    );
  }

  if (peek.status !== 'ready') {
    const text = MISSING_TEXT[peek.status];
    return (
      <div className="bd-wi-card" data-work-item-card={id} data-state={peek.status}>
        <div className="bd-wi-card__body">
          <div className="bd-wi-card__top">
            <span className="bd-wi-card__id">AB#{id}</span>
          </div>
          <p className="bd-wi-card__title" data-muted="">
            {text.title}
          </p>
          <p className="bd-wi-card__desc" data-plain="">
            {text.body}
          </p>
        </div>
        {canOpenWeb && <Footer canOpenWeb />}
      </div>
    );
  }

  const item = workItemPeekOf(peek.item);
  const type = WI_TYPES[item.type] ?? DEFAULT_TYPE_META;
  const stateDot = (WI_STATES[item.state] ?? DEFAULT_STATE_META).dot;
  const initials = item.assignee ? getInitials(item.assignee) : '';
  const changed = item.changedAt ? formatAgo(item.changedAt, now) : '';

  return (
    <div
      className="bd-wi-card"
      data-work-item-card={id}
      style={{ '--bd-wi-card-type': type.color } as CSSProperties}
    >
      <div className="bd-wi-card__body bd-hover-card__scroll">
        <div className="bd-wi-card__top">
          <span className="bd-wi-card__type">
            <TypeGlyph type={item.type} size={12} />
            {item.type || 'Work item'}
          </span>
          <span className="bd-wi-card__id">{id}</span>
          {item.state && (
            <span className="bd-wi-card__state">
              <span className="bd-wi-card__state-dot" style={{ background: stateDot }} />
              {item.state}
            </span>
          )}
        </div>
        <h3 className="bd-wi-card__title">{item.title || `Work item ${id}`}</h3>
        <div className="bd-wi-card__meta">
          <span>
            {item.assignee ? (
              <>
                <Avatar initials={initials} tone={avatarToneFor(initials)} size="sm" />
                {item.assignee}
              </>
            ) : (
              'Unassigned'
            )}
          </span>
          {item.iteration && (
            <span>
              <CalendarRange size={12} strokeWidth={2} aria-hidden />
              {item.iteration}
            </span>
          )}
          {item.priority !== null && (
            <span>
              <Flag size={12} strokeWidth={2} aria-hidden />P{item.priority}
            </span>
          )}
          {item.points !== null && <span>{item.points} pts</span>}
        </div>
        {item.description ? (
          <p className="bd-wi-card__desc">{item.description}</p>
        ) : (
          <p className="bd-wi-card__desc" data-empty="">
            No description.
          </p>
        )}
        {links.length > 0 && (
          <div className="bd-wi-card__links">
            {links.map((link) => (
              <span key={link.key} className="bd-wi-card__chip" data-tone={link.tone}>
                <span
                  className="bd-wi-card__chip-dot"
                  style={{ background: TONE_COLOR[link.tone] }}
                />
                <span className={link.lead.startsWith('#') ? 'bd-wi-card__chip-num' : undefined}>
                  {link.lead}
                </span>
                {link.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <Footer canOpenWeb={canOpenWeb}>
        {changed && (
          <span>
            Updated {changed}
            {item.changedBy ? ` by ${item.changedBy.split(' <')[0]}` : ''}
          </span>
        )}
      </Footer>
    </div>
  );
}

/** The card for one work item, read when it opens. */
export function WorkItemHoverCard({
  id,
  initial,
  canOpenWeb,
}: {
  id: number;
  initial?: WorkItem;
  canOpenWeb: boolean;
}) {
  const peek = useWorkItemPeek(id, initial);
  const links = useCardLinks(id);
  return <WorkItemCardView id={id} peek={peek} links={links} canOpenWeb={canOpenWeb} />;
}
