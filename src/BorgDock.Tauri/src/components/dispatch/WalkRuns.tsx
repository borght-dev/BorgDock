import { X } from 'lucide-react';
import { Markdown } from '@/components/shared/Markdown';
import { Button, IconButton } from '@/components/shared/primitives';
import { dispatchActions } from '@/services/dispatch/actions';
import { currentIteration } from '@/services/dispatch/launch';
import type { AgentThread, DispatchItem, SyncScope, Tone } from '@/services/dispatch/types';
import { type AgentRun, useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { DispatchSyncSchedule } from '@/types';

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
  if (!thread) return { label: `Starting in ${run.slot}`, tone: 'run', stopped: false };
  switch (thread.status) {
    case 'running':
      return { label: `Agent working in ${run.slot}`, tone: 'run', stopped: false };
    case 'your-turn':
      return { label: `Agent done in ${run.slot}`, tone: 'ok', stopped: true };
    case 'failed':
      return { label: `Agent failed in ${run.slot}`, tone: 'bad', stopped: true };
    case 'settled':
      return { label: 'Settled', tone: 'mute', stopped: true };
    default:
      return { label: `Agent asks in ${run.slot}`, tone: 'bad', stopped: true };
  }
}

function RunPill({ run }: { run: AgentRun }) {
  const thread = useRunThread(run);
  const status = runStatus(run, thread);
  return (
    <span className="bd-dp-run" data-tone={status.tone}>
      {!status.stopped && <span className="bd-dp-run__spin" aria-hidden="true" />}
      {status.label}
    </span>
  );
}

/** RunResult — what a run said when it stopped, with the way into its thread. */
export function RunResult({ run }: { run: AgentRun }) {
  const thread = useRunThread(run);
  const status = runStatus(run, thread);
  const dismiss = () => useDispatchStore.getState().dismissRun(run.threadId);
  if (!status.stopped) return null;
  return (
    <div className="bd-dp-runresult" data-tone={status.tone}>
      <header className="bd-dp-runresult__head">
        <span className="bd-dp-verdict" data-tone={status.tone}>
          {status.label}
        </span>
        <span className="bd-dp-runresult__spacer" />
        {thread && (
          <Button variant="secondary" size="sm" onClick={() => dispatchActions.openInT3(thread)}>
            Open in T3
          </Button>
        )}
        {thread?.open && (
          <Button variant="ghost" size="sm" onClick={() => dispatchActions.settle(thread)}>
            Settle
          </Button>
        )}
        <IconButton
          icon={<X size={13} strokeWidth={2.25} />}
          tooltip="Dismiss"
          aria-label="Dismiss"
          size={22}
          onClick={dismiss}
        />
      </header>
      {thread?.lastAgentMessage ? (
        <div className="bd-dp-runresult__body">
          <Markdown allowRawHtml={false}>{thread.lastAgentMessage}</Markdown>
        </div>
      ) : (
        <p className="bd-dp-runresult__none">
          {thread?.status === 'question'
            ? 'The agent asks something. Answer it in T3.'
            : 'The last message is on its way from T3.'}
        </p>
      )}
    </div>
  );
}

/** LaneRunControls — a sync lane's run, if one went, and the button that starts one. */
export function LaneRunControls({ state, count }: { state: string; count: number }) {
  const run = useDispatchStore((s) => laneRun(s.runs, state));
  const thread = useRunThread(run);
  const running = run !== undefined && !runStatus(run, thread).stopped;
  return (
    <>
      {run && <RunPill run={run} />}
      <Button
        variant="secondary"
        size="sm"
        disabled={count === 0 || running}
        onClick={() => openSync({ kind: 'state', state })}
      >
        Sync with agent
      </Button>
    </>
  );
}

/** The result of the lane's own last sync, above its rows, once the agent stopped. */
export function LaneRunResult({ state }: { state: string }) {
  const run = useDispatchStore((s) => laneRun(s.runs, state));
  const ownSync = run && (run.scope === 'state' || (!run.scope && run.states[0] === state));
  return ownSync ? <RunResult run={run} /> : null;
}

/** BulkRunResult — what the last Sync all and the last fix said, above the walk. */
export function BulkRunResult() {
  const all = useDispatchStore((s) => bulkRun(s.runs, 'all'));
  const drift = useDispatchStore((s) => bulkRun(s.runs, 'drift'));
  return (
    <>
      {drift && <RunResult run={drift} />}
      {all && <RunResult run={all} />}
    </>
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
export function FixOutOfSyncButton({ count }: { count: number }) {
  const running = useBulkRunning('drift');
  if (count === 0 && !running) return null;
  return (
    <Button
      variant="primary"
      size="sm"
      disabled={running || count === 0}
      onClick={() => openSync({ kind: 'drift' })}
    >
      {running ? 'Fixing…' : `Fix out of sync (${count})`}
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
        {run && <RunPill run={run} />}
        <Button
          variant="secondary"
          size="sm"
          disabled={running}
          onClick={() => useDispatchStore.getState().openRunSheet({ kind: 'suggest' })}
        >
          Suggest my next item
        </Button>
      </div>
      {run && <RunResult run={run} />}
      {!run && (
        <p className="bd-dp-wlane__empty">
          An agent reads the sprint, your open items and their priorities, and recommends one.
        </p>
      )}
    </section>
  );
}
