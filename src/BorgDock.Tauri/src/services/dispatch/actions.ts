import { type DispatchActions, unitActions } from '@/components/dispatch/unit-actions';
import { toggleTrackedWorkItem } from '@/components/work-items/work-item-toggles';
import { showPr, showSection } from '@/services/navigation';
import {
  type T3HostRef,
  t3Respond,
  t3SendMessage,
  t3Settle,
  t3ShowThread,
} from '@/services/t3/api';
import { selectItemOverview, useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast, toastError } from '@/stores/toast-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { configuredHosts, rawId } from './hosts';
import { moveItemState } from './items';
import { dispatchAdoClient, syncAll } from './sync';
import type { AgentThread, DispatchItem, UnitPullRequest } from './types';

/** What "Approve plan" tells the agent. */
export const GO_AHEAD_MESSAGE = 'Go ahead with the plan.';

function hostOf(thread: AgentThread): T3HostRef {
  const host = configuredHosts(useSettingsStore.getState().settings).find(
    (h) => h.id === thread.hostId,
  );
  return { id: thread.hostId, baseUrl: host?.baseUrl };
}

/**
 * Run one action against T3 or ADO: the buttons wait while it runs, its
 * result shows as a toast, and everything is read again afterwards.
 */
async function act(failure: string, work: () => Promise<string>): Promise<void> {
  const store = useDispatchStore.getState();
  if (store.busy) return;
  store.setBusy(true);
  try {
    showToast({ tone: 'success', message: await work() });
  } catch (error) {
    toastError(failure, error);
  } finally {
    useDispatchStore.getState().setBusy(false);
    syncAll(true);
  }
}

function openUrl(url: string): void {
  import('@tauri-apps/plugin-opener')
    .then(({ openUrl: open }) => open(url))
    .catch((error) => toastError('Could not open the link', error));
}

/** ADO refuses a move while fields the workflow requires are empty (TF401320). */
function explainMoveFailure(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (!/TF401320/.test(message)) return error instanceof Error ? error : new Error(message);
  return new Error(
    `ADO won't move it yet. ${message.replace(/^.*TF401320:\s*/, '')} Fill the field in ADO, or let an agent do it with "Update for QA".`,
  );
}

const GITHUB_PULL_REQUEST_URL = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;

function showPullRequest(pullRequest: UnitPullRequest): void {
  const match = GITHUB_PULL_REQUEST_URL.exec(pullRequest.url);
  const { pullRequests, closedPullRequests } = usePrStore.getState();
  const known =
    match &&
    [...pullRequests, ...closedPullRequests].some(
      (pr) => pr.pullRequest.htmlUrl.toLowerCase() === pullRequest.url.toLowerCase(),
    );
  if (match && known) {
    void showPr({ owner: match[1]!, repo: match[2]!, number: Number(match[3]), keepSection: true });
    return;
  }
  openUrl(pullRequest.url);
}

function setQueued(item: DispatchItem, queued: boolean): void {
  if (useWorkItemsStore.getState().trackedWorkItemIds.has(item.id) !== queued) {
    toggleTrackedWorkItem(item.id);
  }
  showToast({
    message: queued ? `${item.id} added to Up next` : `${item.id} removed from Up next`,
  });
}

/** Show an item in Dispatch, from any section. */
export function showDispatchItem(itemId: number): void {
  useDispatchStore.getState().selectItem(itemId);
  void showSection('dispatch');
}

/**
 * Start an agent on any work item, mine or not: Dispatch opens with the
 * launch sheet for it. The item is starred first, so Dispatch has it even
 * when it is assigned to someone else.
 */
export function startWorkItem(itemId: number): void {
  if (!useWorkItemsStore.getState().trackedWorkItemIds.has(itemId)) {
    toggleTrackedWorkItem(itemId);
  }
  showDispatchItem(itemId);
  useDispatchStore.getState().openLaunch({ itemId });
}

/**
 * Take `actionId` on an item, as asked from a notification. The item is
 * shown either way; the action only runs while the item still offers it,
 * so a stale notification cannot do something else than it said.
 */
export function runItemAction(itemId: number, actionId: string): void {
  showDispatchItem(itemId);
  const overview = selectItemOverview(useDispatchStore.getState(), itemId);
  const action = overview && unitActions(overview).find((a) => a.id === actionId);
  action?.run(dispatchActions);
}

export const dispatchActions: DispatchActions = {
  answer: (thread, answers) => {
    const requestId = thread.questionRequestId;
    if (!requestId) return;
    void act('Answer not sent', async () => {
      await t3Respond(hostOf(thread), rawId(thread.hostId, thread.id), requestId, answers);
      return `Sent. The agent in ${thread.slot} is working again.`;
    });
  },

  approvePlan: (thread) => {
    void act('Go-ahead not sent', async () => {
      await t3SendMessage(
        hostOf(thread),
        rawId(thread.hostId, thread.id),
        GO_AHEAD_MESSAGE,
        thread.interactionMode === 'plan',
      );
      return `Go-ahead sent. The agent in ${thread.slot} is working again.`;
    });
  },

  settle: (thread) => {
    void act('Thread not settled', async () => {
      await t3Settle(hostOf(thread), rawId(thread.hostId, thread.id));
      return `Thread settled. ${thread.slot} is free again.`;
    });
  },

  openInT3: (thread) => {
    const executable = useSettingsStore.getState().settings.agents?.t3Path;
    t3ShowThread(hostOf(thread), rawId(thread.hostId, thread.id), executable).catch((error) =>
      toastError('Could not open T3', error),
    );
  },

  move: (item, to) => {
    void act(`${item.id} not moved`, async () => {
      const client = dispatchAdoClient();
      if (!client) throw new Error('Azure DevOps is not set up.');
      const state = await moveItemState(client, item.id, to).catch((error) => {
        throw explainMoveFailure(error);
      });
      return `${item.id} moved to ${state} in ADO`;
    });
  },

  hideSuggestion: (overview) => {
    if (!overview.suggestion) return;
    useDispatchStore.getState().hideSuggestion(overview.suggestion.id);
    showToast({ message: 'Suggestion hidden' });
  },

  start: (item, slotId) => {
    useDispatchStore.getState().openLaunch({ itemId: item.id, slotId });
  },

  queue: (item) => setQueued(item, true),

  unqueue: (item) => setQueued(item, false),

  openInAdo: (item) => openUrl(item.url),

  openPullRequest: showPullRequest,
};
