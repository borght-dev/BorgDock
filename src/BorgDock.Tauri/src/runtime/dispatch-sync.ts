import { bringMainWindowForward } from '@/hooks/useFlyoutSync';
import { runItemAction, showDispatchItem } from '@/services/dispatch/actions';
import { recallHosts } from '@/services/dispatch/host-memory';
import { configuredHosts, isRemote, LOCAL_HOST } from '@/services/dispatch/hosts';
import { runScheduleIfDue } from '@/services/dispatch/schedule';
import {
  followHostList,
  recomputeOverview,
  resetHostSync,
  syncAll,
  syncHost,
  syncItems,
} from '@/services/dispatch/sync';
import { NEEDS_YOU } from '@/services/dispatch/types';
import { PollingManager } from '@/services/polling';
import { OPEN_PR_THREAD_EVENT, requestT3Thread } from '@/services/t3-thread';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { PullRequest } from '@/types';
import { trackPolling } from './visibility';

/** A poll of the T3 on this machine costs one local request. */
const T3_POLL_MS = 10_000;
/** A remote host sends its whole shell over the network on every poll. */
const REMOTE_T3_POLL_MS = 30_000;
const ADO_POLL_MS = 60_000;
/** How often the scheduled sync looks at the clock. */
const SCHEDULE_CHECK_MS = 60_000;

/** Another window (a notification, the tray flyout) asks to show an item in Dispatch. */
export const SHOW_ITEM_EVENT = 'dispatch-show-item';
/** Another window asks to take an action on an item: `{ itemId, actionId }`. */
export const ITEM_ACTION_EVENT = 'dispatch-item-action';

async function listenToOtherWindows(): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const stops = await Promise.all([
    listen<{ itemId: number }>(SHOW_ITEM_EVENT, (event) => {
      void bringMainWindowForward().then(() => showDispatchItem(event.payload.itemId));
    }),
    listen<{ itemId: number; actionId: string }>(ITEM_ACTION_EVENT, (event) => {
      runItemAction(event.payload.itemId, event.payload.actionId);
    }),
    listen<PullRequest>(OPEN_PR_THREAD_EVENT, (event) => {
      void bringMainWindowForward().then(() => requestT3Thread(event.payload));
    }),
  ]);
  return () => {
    for (const stop of stops) stop();
  };
}

function remoteHosts() {
  return configuredHosts(useSettingsStore.getState().settings).filter(isRemote);
}

/**
 * useDispatchSync — keeps the Dispatch overview current while `enabled`: polls
 * the T3 hosts and Azure DevOps, reads everything again on Refresh, and
 * rebuilds the overview when one of its other inputs changes (pull requests,
 * the track star, the host list, hidden suggestions, manual links). It also answers the notifications and the tray flyout when they ask
 * to show an item or to take an action on it.
 */
export function startDispatchSync(): () => void {
  void useDispatchStore.getState().restorePersisted().then(recomputeOverview);
  void recallHosts(remoteHosts().map((host) => host.id)).then(recomputeOverview);
  syncAll(false);

  const localPoll = new PollingManager(() => syncHost(LOCAL_HOST), T3_POLL_MS);
  const remotePoll = new PollingManager(async () => {
    await Promise.all(remoteHosts().map((host) => syncHost(host)));
  }, REMOTE_T3_POLL_MS);
  const adoPoll = new PollingManager(() => syncItems(), ADO_POLL_MS);
  const polls = [localPoll, remotePoll, adoPoll];
  const untracks = polls.map((poll) => trackPolling(poll));
  for (const poll of polls) poll.startDeferred();
  const scheduleTimer = window.setInterval(() => void runScheduleIfDue(), SCHEDULE_CHECK_MS);
  const onRefresh = () => syncAll(true);
  document.addEventListener('borgdock-refresh', onRefresh);

  let stopListening: (() => void) | undefined;
  let unmounted = false;
  listenToOtherWindows()
    .then((stop) => {
      if (unmounted) stop();
      else stopListening = stop;
    })
    .catch(() => {});

  const unsubscribers = [
    usePrStore.subscribe((state, previous) => {
      if (
        state.pullRequests !== previous.pullRequests ||
        state.closedPullRequests !== previous.closedPullRequests
      ) {
        recomputeOverview();
      }
    }),
    useWorkItemsStore.subscribe((state, previous) => {
      if (state.trackedWorkItemIds === previous.trackedWorkItemIds) return;
      recomputeOverview();
      // A newly starred item that is not mine has to be fetched first.
      const known = new Set(useDispatchStore.getState().items.map((item) => item.id));
      if ([...state.trackedWorkItemIds].some((id) => !known.has(id))) void syncItems();
    }),
    useSettingsStore.subscribe((state, previous) => {
      if (state.settings.azureDevOps !== previous.settings.azureDevOps) void syncItems(true);
      if (state.settings.agents?.t3Hosts !== previous.settings.agents?.t3Hosts) followHostList();
    }),
    useDispatchStore.subscribe((state, previous) => {
      if (state.threads !== previous.threads) {
        const before = new Map(previous.threads.map((thread) => [thread.id, thread]));
        const runIds = new Set(
          state.runs.filter((run) => run.kind === 'sync').map((run) => run.threadId),
        );
        if (
          state.threads.some((thread) => {
            const seen = before.get(thread.id);
            return (
              runIds.has(thread.id) &&
              (NEEDS_YOU.includes(thread.status) || thread.status === 'settled') &&
              (seen?.status !== thread.status || seen?.lastActivityAt !== thread.lastActivityAt)
            );
          })
        )
          void syncItems(true);
      }
      if (
        state.hiddenSuggestions !== previous.hiddenSuggestions ||
        state.manualLinks !== previous.manualLinks
      ) {
        recomputeOverview();
      }
    }),
  ];

  return () => {
    resetHostSync();
    for (const poll of polls) poll.stop();
    for (const untrack of untracks) untrack();
    window.clearInterval(scheduleTimer);
    document.removeEventListener('borgdock-refresh', onRefresh);
    for (const unsubscribe of unsubscribers) unsubscribe();
    unmounted = true;
    stopListening?.();
  };
}
