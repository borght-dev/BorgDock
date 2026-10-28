import { X } from 'lucide-react';
import { useMemo } from 'react';
import { Markdown } from '@/components/shared/Markdown';
import { Button, IconButton } from '@/components/shared/primitives';
import { dispatchActions } from '@/services/dispatch/actions';
import { currentIteration } from '@/services/dispatch/launch';
import type { AgentThread, DispatchItem, SyncScope, Tone } from '@/services/dispatch/types';
import { runProgress } from '@/services/dispatch/walk';
import { type AgentRun, type SourceStatus, useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { DispatchSyncSchedule } from '@/types';
import { shortAge } from './unit-copy';

/** The newest sync of many items that took items in `state`. */
function laneRun(runs: readonly AgentRun[], state: string): AgentRun | undefined {
  return runs.find(
    (run) => run.kind === 'sync' && run.scope !== 'item' && run.states.includes(state),
  );
}

/** The newest sync of every item or of the items out of sync. */
function bulkRun(runs: readonly AgentRun[], scope: 'all' | 'drift'): AgentRun | undefined {
  return runs.find((run) => run.kind === 'sync' && run.scope === scope);
}

function openSync(scope: SyncScope): void {
  useDispatchStore.getState().openRunSheet({ kind: 'sync', scope });
}

function useRunThread(run: AgentRun | undefined): AgentThread | undefined {
  return useDispatchStore((s) =>
    run ? s.threads.find((thread) => thread.id === run.threadId) : undefined,
  );
}

/** Where a run is, in a few words, and how much it asks of you. */
export function runStatus(
  run: AgentRun,
  thread: AgentThread | undefined,
): { label: string; tone: Tone; stopped: boolean } {
  if (!thread) return { label: `Starting in ${run.where}`, tone: 'run', stopped: false };
  switch (thread.status) {
    case 'running':
      return { label: `Agent working in ${run.where}`, tone: 'run', stopped: false };
    case 'your-turn':
      return { label: `Agent done in ${run.where}`, tone: 'ok', stopped: true };
    case 'failed':
      return { label: `Agent failed in ${run.where}`, tone: 'bad', stopped: true };
    case 'settled':
      return { label: 'Settled', tone: 'mute', stopped: true };
    default:
      return { label: `Agent asks in ${run.where}`, tone: 'bad', stopped: true };
  }
}

/**
 * Show a run's card: switch Dispatch to States, open the lane it sits in and
 * scroll it into view once it is drawn.
 */
export function revealRun(threadId: string): void {
  useDispatchStore.getState().setViewMode('walk');
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-run-id="${CSS.escape(threadId)}"]`);
    const lane = card?.closest<HTMLElement>('[data-group-key]');
    const key = lane?.dataset.groupKey;
    if (key && useUiStore.getState().collapsedGroups.has(key)) {
      useUiStore.getState().toggleRepoGroup(key);
    }
    card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

/** What a run does, in a few words: `Syncing 7 items`, `Moving 60107`. */
export function runTitle(run: AgentRun): string {
  const count = run.itemIds.length;
  const items = `${count} ${count === 1 ? 'item' : 'items'}`;
  if (run.kind === 'suggest') return 'Picking your next item';
  switch (run.scope) {
    case 'all':
      return `Syncing all ${items}`;
    case 'drift':
      return `Fixing ${items} out of sync`;
    case 'item':
      return `Moving ${run.itemIds[0] ?? ''}`.trim();
    default:
      return `Syncing ${items}`;
  }
}

/** The item ids in a run that is still going, with where it runs. */
export function useRunningItems(): ReadonlyMap<number, string> {
  const runs = useDispatchStore((s) => s.runs);
  const threads = useDispatchStore((s) => s.threads);
  return useMemo(() => {
    const running = new Map<number, string>();
    for (const run of runs) {
      const thread = threads.find((t) => t.id === run.threadId);
      if (runStatus(run, thread).stopped) continue;
      for (const id of run.itemIds) if (!running.has(id)) running.set(id, run.where);
    }
    return running;
  }, [runs, threads]);
}

/** RunProgressBar — one segment per item, filled once the item moved. */
function RunProgressBar({ items }: { items: readonly { id: number; moved: boolean }[] }) {
  return (
    <span className="bd-dp-runcard__pips" aria-hidden="true">
      {items.map((p) => (
        <i key={p.id} data-moved={p.moved ? 'true' : undefined} />
      ))}
    </span>
  );
}

/** A sync of several items that recorded where they started: its moves can be counted. */
function tracksMoves(run: AgentRun): boolean {
  return run.kind === 'sync' && run.fromStates !== undefined && run.itemIds.length > 1;
}

/** `2 of 7 moved · started 3 min ago`. */
function runFacts(run: AgentRun, progress: string, now: number): string {
  const age = shortAge(run.startedAt, now);
  return [
    tracksMoves(run) ? progress : '',
    age === 'just now' ? 'started just now' : age ? `started ${age} ago` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function unverifiedMoves(
  run: AgentRun,
  thread: AgentThread | undefined,
  ado: SourceStatus,
): string | null {
  if (!ado.ok) return 'Moves unverified · ADO unavailable';
  const checkedAfter =
    thread && runStatus(run, thread).stopped && thread.lastActivityAt > run.startedAt
      ? thread.lastActivityAt
      : run.startedAt;
  if (ado.at === null || ado.at < checkedAfter) return 'Checking moves in ADO';
  return null;
}

/**
 * RunCard — one agent run: while it works, what it does and how many of its
 * items moved; once it stopped, what it said, with the way into its thread.
 */
export function RunCard({ run }: { run: AgentRun }) {
  const thread = useRunThread(run);
  const items = useDispatchStore((s) => s.overview?.items);
  const ado = useDispatchStore((s) => s.ado);
  const status = runStatus(run, thread);
  const progress = runProgress(run, items ?? []);
  const unverified = unverifiedMoves(run, thread, ado);
  const facts = runFacts(
    run,
    unverified ?? `${progress.moved} of ${progress.total} moved`,
    Date.now(),
  );
  const dismiss = () => useDispatchStore.getState().dismissRun(run.threadId);
  return (
    <div
      className="bd-dp-runcard"
      data-run-id={run.threadId}
      data-tone={status.tone}
      data-running={status.stopped ? undefined : 'true'}
    >
      <header className="bd-dp-runcard__head">
        {status.stopped ? (
          <span className="bd-dp-runcard__mark" aria-hidden="true" />
        ) : (
          <span className="bd-dp-run__spin" aria-hidden="true" />
        )}
        <span className="bd-dp-runcard__what">
          <strong>{status.stopped ? status.label : `${runTitle(run)} in ${run.where}`}</strong>
          {facts && <span className="bd-dp-runcard__facts">{facts}</span>}
          {tracksMoves(run) && !unverified && <RunProgressBar items={progress.items} />}
        </span>
        {thread && (
          <Button variant="secondary" size="sm" onClick={() => dispatchActions.openInT3(thread)}>
            Open in T3
          </Button>
        )}
        {status.stopped && thread?.open && (
          <Button variant="ghost" size="sm" onClick={() => dispatchActions.settle(thread)}>
            Settle
          </Button>
        )}
        {status.stopped && (
          <IconButton
            icon={<X size={13} strokeWidth={2.25} />}
            tooltip="Dismiss"
            aria-label="Dismiss"
            size={22}
            onClick={dismiss}
          />
        )}
      </header>
      {status.stopped &&
        (thread?.lastAgentMessage ? (
          <div className="bd-dp-runcard__body">
            <Markdown allowRawHtml={false}>{thread.lastAgentMessage}</Markdown>
          </div>
        ) : (
          <p className="bd-dp-runcard__none">
            {thread?.status === 'question'
              ? 'The agent asks something. Answer it in T3.'
              : 'The last message is on its way from T3.'}
          </p>
        ))}
    </div>
  );
}

/** LaneRunControls — the button that starts a sync of the lane, idle while one runs. */
export function LaneRunControls({ state, count }: { state: string; count: number }) {
  const run = useDispatchStore((s) => laneRun(s.runs, state));
  const thread = useRunThread(run);
  const running = run !== undefined && !runStatus(run, thread).stopped;
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={count === 0 || running}
      onClick={() => openSync({ kind: 'state', state })}
    >
      {running ? 'Syncing…' : 'Sync with agent'}
    </Button>
  );
}

/** The lane's own last sync, above its rows: live while it runs, then what it said. */
export function LaneRunResult({ state }: { state: string }) {
  const run = useDispatchStore((s) => laneRun(s.runs, state));
  const ownSync = run && (run.scope === 'state' || (!run.scope && run.states[0] === state));
  return ownSync ? <RunCard run={run} /> : null;
}

/** BulkRunResult — the last Sync all and the last fix, above the walk. */
export function BulkRunResult() {
  const all = useDispatchStore((s) => bulkRun(s.runs, 'all'));
  const drift = useDispatchStore((s) => bulkRun(s.runs, 'drift'));
  if (!all && !drift) return null;
  return (
    <div className="bd-dp-bulkruns">
      {drift && <RunCard run={drift} />}
      {all && <RunCard run={all} />}
    </div>
  );
}

/** `· daily 08:30` when Sync all runs by itself. */
function scheduleHint(schedule: DispatchSyncSchedule | undefined): string {
  if (!schedule?.enabled || schedule.weekdays.length === 0) return '';
  return ` · ${schedule.weekdays.length === 7 ? 'daily' : 'scheduled'} ${schedule.time}`;
}

function useBulkRunning(scope: 'all' | 'drift'): boolean {
  const run = useDispatchStore((s) => bulkRun(s.runs, scope));
  const thread = useRunThread(run);
  return run !== undefined && !runStatus(run, thread).stopped;
}

/** FixOutOfSyncButton — one agent for every item whose state the evidence contradicts. */
export function FixOutOfSyncButton({ count, short = false }: { count: number; short?: boolean }) {
  const running = useBulkRunning('drift');
  if (count === 0 && !running) return null;
  return (
    <Button
      variant="primary"
      size="sm"
      disabled={running || count === 0}
      onClick={() => openSync({ kind: 'drift' })}
    >
      {running ? 'Fixing…' : short ? `Fix all ${count}` : `Fix out of sync (${count})`}
    </Button>
  );
}

/** SyncAllButton — one agent that walks every item, one by one. */
export function SyncAllButton({ count }: { count: number }) {
  const schedule = useSettingsStore((s) => s.settings.agents?.dispatchSyncSchedule);
  const running = useBulkRunning('all');
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={running || count === 0}
      onClick={() => openSync({ kind: 'all' })}
    >
      {running ? 'Syncing…' : `Sync all (${count})${scheduleHint(schedule)}`}
    </Button>
  );
}

/** PickupSection — under the walk: let an agent recommend what to pick up next. */
export function PickupSection({ items }: { items: readonly DispatchItem[] }) {
  const run = useDispatchStore((s) => s.runs.find((r) => r.kind === 'suggest'));
  const thread = useRunThread(run);
  const running = run !== undefined && !runStatus(run, thread).stopped;
  const iteration = currentIteration(items);
  return (
    <section className="bd-wb-group bd-dp-wlane bd-dp-pickup" aria-label="Next pickup">
      <div className="bd-dp-wlane__head">
        <div className="bd-wb-group__head bd-dp-pickup__head">
          <span className="bd-wb-group__label">Next pickup</span>
          <span className="bd-dp-wlane__summary">
            unassigned New items in {iteration?.split('\\').pop() ?? 'the current sprint'}
          </span>
          <span className="bd-wb-group__rule" aria-hidden="true" />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={running}
          onClick={() => useDispatchStore.getState().openRunSheet({ kind: 'suggest' })}
        >
          Suggest my next item
        </Button>
      </div>
      {run && <RunCard run={run} />}
      {!run && (
        <p className="bd-dp-wlane__empty">
          An agent reads the sprint, your open items and their priorities, and recommends one.
        </p>
      )}
    </section>
  );
}
