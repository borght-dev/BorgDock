import { ExternalLink } from 'lucide-react';
import { Button, CheckBar } from '@/components/shared/primitives';
import { WorkItemTypePill } from '@/components/work-items/WorkItemTypePill';
import { ItemMembership } from '@/components/workstreams/Membership';
import type { ItemOverview, Slot } from '@/services/dispatch/types';
import { AgentSays } from './AgentSays';
import { StateTrack } from './StateTrack';
import { ThreadStatusPill } from './ThreadStatusPill';
import { currentThread, type DispatchActions, unitActions } from './unit-actions';
import { dueLabel, shortAge, toCheckBarCounts } from './unit-copy';

interface DispatchDetailProps {
  overview: ItemOverview;
  slots: readonly Slot[];
  actions: DispatchActions;
  /** Epoch ms the relative times are measured from. */
  now: number;
  /** An action is on its way to T3 or ADO. */
  busy?: boolean;
}

function freeSlotNames(slots: readonly Slot[]): string {
  const free = slots.filter((slot) => slot.available && slot.state === 'free').map((s) => s.name);
  return free.length > 0 ? `Free slots: ${free.join(', ')}` : 'Every slot is busy';
}

/**
 * DispatchDetail — the selected item beside the Dispatch list: what it is,
 * where it stands in ADO, in which slot its agent runs and what that agent
 * last said. A question is answered right here; every other step is one of
 * the buttons under "Next action".
 */
export function DispatchDetail({
  overview,
  slots,
  actions,
  now,
  busy = false,
}: DispatchDetailProps) {
  const { item, pullRequest, suggestion } = overview;
  const thread = currentThread(overview);
  const due = dueLabel(item.dueDate, now);
  const answeringInPlace = thread?.status === 'question' && thread.questions.length > 0;
  const next = unitActions(overview).filter(
    (action) => !(answeringInPlace && action.id === 'answer-recommended'),
  );
  const earlier = overview.threads.filter((t) => t !== thread);

  return (
    <article className="bd-dp-detail" data-dp-detail={item.id} aria-label={item.title}>
      <header className="bd-dp-detail__meta">
        <WorkItemTypePill type={item.typeName} />
        <span className="bd-dp-detail__id">AB#{item.id}</span>
        {item.priority !== null && <span>Priority {item.priority}</span>}
        <span>{item.sprint}</span>
        {due && <span data-overdue={due.overdue ? 'true' : undefined}>{due.label}</span>}
        <button type="button" className="bd-dp-link" onClick={() => actions.openInAdo(item)}>
          View in ADO <ExternalLink size={11} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </header>
      <h2 className="bd-dp-detail__title">{item.title}</h2>
      <ItemMembership id={item.id} title={item.title} />

      <dl className="bd-dp-facts">
        <div>
          <dt>ADO state</dt>
          <dd>{item.state}</dd>
        </div>
        <div>
          <dt>Slot</dt>
          <dd>{thread ? `${thread.slot}, ${thread.hostLabel}` : 'None'}</dd>
        </div>
        <div>
          <dt>Pull request</dt>
          <dd>
            {pullRequest ? (
              <>
                <button
                  type="button"
                  className="bd-dp-link"
                  onClick={() => actions.openPullRequest(pullRequest)}
                >
                  #{pullRequest.number} {pullRequest.isDraft ? 'draft' : pullRequest.state}
                </button>
                {pullRequest.checks && pullRequest.checks.total > 0 && (
                  <CheckBar {...toCheckBarCounts(pullRequest.checks)} />
                )}
              </>
            ) : (
              'None linked'
            )}
          </dd>
        </div>
      </dl>

      <section className="bd-dp-agent" aria-label="Agent">
        {thread ? (
          <>
            <div className="bd-dp-agent__head">
              <strong>Agent update</strong>
              <ThreadStatusPill status={thread.status} />
              <span className="bd-dp-agent__age">
                {thread.available ? '' : 'offline, last seen '}
                {shortAge(thread.lastActivityAt, now)}
              </span>
            </div>
            <p className="bd-dp-agent__thread">
              {thread.model}
              {thread.branch ? ` · ${thread.branch}` : ''}
            </p>
            <AgentSays
              thread={thread}
              busy={busy}
              onAnswer={(answers) => actions.answer(thread, answers)}
            />
          </>
        ) : (
          <>
            <div className="bd-dp-agent__head">
              <strong>No active agent</strong>
            </div>
            <p className="bd-dp-agent__thread">{freeSlotNames(slots)}</p>
          </>
        )}
      </section>

      {next.length > 0 && (
        <section className="bd-dp-next" aria-label="Next action">
          <h3 className="bd-dp-next__label">Next action</h3>
          {suggestion && <p className="bd-dp-next__reason">{suggestion.reason}</p>}
          <div className="bd-dp-next__actions">
            {next.map((action) => (
              <Button
                key={action.id}
                variant={action.primary ? 'primary' : 'secondary'}
                size="md"
                disabled={busy}
                data-dp-action={action.id}
                onClick={() => action.run(actions)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </section>
      )}

      <StateTrack item={item} suggested={suggestion?.to ?? null} />

      {earlier.length > 0 && (
        <section className="bd-dp-earlier" aria-label="Earlier threads">
          <h3 className="bd-dp-next__label">Earlier threads</h3>
          <ul>
            {earlier.map((t) => (
              <li key={t.id}>
                <span className="bd-dp-earlier__age">{shortAge(t.lastActivityAt, now)}</span>
                <span className="bd-dp-earlier__slot">{t.slot}</span>
                <button type="button" className="bd-dp-link" onClick={() => actions.openInT3(t)}>
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
