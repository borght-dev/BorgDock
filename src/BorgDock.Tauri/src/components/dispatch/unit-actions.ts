import type {
  AgentThread,
  DispatchItem,
  ItemOverview,
  UnitPullRequest,
} from '@/services/dispatch/types';

/** Everything a Dispatch view can do to an item; the section wires these to the services. */
export interface DispatchActions {
  answer: (thread: AgentThread, answers: Record<string, string>) => void;
  /** Tell the agent to go ahead with the plan it proposed. */
  approvePlan: (thread: AgentThread) => void;
  settle: (thread: AgentThread) => void;
  openInT3: (thread: Pick<AgentThread, 'id' | 'hostId'>) => void;
  /** Have an agent move the item to `to`, filling in what the move needs. */
  move: (item: DispatchItem, to: string) => void;
  hideSuggestion: (overview: ItemOverview) => void;
  /** Open the launch sheet for the item, on `slotId` when given. */
  start: (item: DispatchItem, slotId?: string) => void;
  queue: (item: DispatchItem) => void;
  unqueue: (item: DispatchItem) => void;
  openInAdo: (item: DispatchItem) => void;
  openPullRequest: (pullRequest: UnitPullRequest) => void;
}

export interface UnitAction {
  id:
    | 'answer-recommended'
    | 'approve-plan'
    | 'move'
    | 'keep'
    | 'settle'
    | 'open-t3'
    | 'start'
    | 'queue'
    | 'unqueue'
    | 'open-ado';
  label: string;
  /** The label where room is tight (a board card), when the full one is long. */
  shortLabel?: string;
  /** The one action the item most likely needs; drawn as the primary button. */
  primary: boolean;
  run: (actions: DispatchActions) => void;
}

/** The thread an item's actions apply to: the newest one that is still open. */
export function currentThread(overview: ItemOverview): AgentThread | null {
  return overview.threads.find((thread) => thread.open) ?? null;
}

/**
 * The actions an item offers, most useful first, exactly one of them primary.
 * A question is answered in place (its options are the action), so it adds
 * only the recommended answer here, for views with no room for the options.
 */
export function unitActions(overview: ItemOverview): UnitAction[] {
  const { item, suggestion } = overview;
  const thread = currentThread(overview);
  const found: Omit<UnitAction, 'primary'>[] = [];

  if (thread?.status === 'question') {
    const [question] = thread.questions;
    const recommended =
      thread.questions.length === 1 && question && question.recommended !== null
        ? question.options[question.recommended]
        : undefined;
    if (question && recommended && thread.available) {
      found.push({
        id: 'answer-recommended',
        label: recommended.label,
        run: (a) => a.answer(thread, { [question.id]: recommended.value }),
      });
    }
  }
  if (thread?.status === 'plan' && thread.available) {
    found.push({ id: 'approve-plan', label: 'Approve plan', run: (a) => a.approvePlan(thread) });
  }
  if (thread && (thread.status === 'failed' || thread.status === 'approval')) {
    found.push({ id: 'open-t3', label: 'Open in T3', run: (a) => a.openInT3(thread) });
  }

  if (suggestion) {
    const to = suggestion.to;
    found.push({ id: 'move', label: `Move to ${to}`, run: (a) => a.move(item, to) });
    found.push({
      id: 'keep',
      label: `Keep ${item.state}`,
      shortLabel: 'Keep',
      run: (a) => a.hideSuggestion(overview),
    });
  }

  if (thread && (thread.status === 'your-turn' || thread.status === 'failed') && thread.available) {
    found.push({ id: 'settle', label: 'Settle thread', run: (a) => a.settle(thread) });
  }
  if (thread && !found.some((action) => action.id === 'open-t3')) {
    found.push({ id: 'open-t3', label: 'Open in T3', run: (a) => a.openInT3(thread) });
  }

  if (!thread) {
    if (overview.bay !== 'handed') {
      found.push({ id: 'start', label: 'Start in T3', run: (a) => a.start(item) });
    }
    if (overview.queued) {
      found.push({
        id: 'unqueue',
        label: 'Remove from Up next',
        shortLabel: 'Remove',
        run: (a) => a.unqueue(item),
      });
    } else if (overview.bay === 'idle' || overview.bay === 'paused') {
      found.push({ id: 'queue', label: 'Up next', run: (a) => a.queue(item) });
    }
  }
  if (found.length === 0) {
    found.push({ id: 'open-ado', label: 'Open in ADO', run: (a) => a.openInAdo(item) });
  }

  return found.map((action, index) => ({ ...action, primary: index === 0 }));
}
