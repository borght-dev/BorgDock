import { useEffect } from 'react';
import { bringMainWindowForward } from '@/hooks/useFlyoutSync';
import { runItemAction, showDispatchItem } from '@/services/dispatch/actions';
import {
  configuredHosts,
  recomputeOverview,
  syncAll,
  syncHost,
  syncItems,
} from '@/services/dispatch/sync';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';

/** A T3 poll costs one local request, and nothing when the host's sequence is unchanged. */
const T3_POLL_MS = 10_000;
const ADO_POLL_MS = 60_000;

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
  ]);
  return () => {
    for (const stop of stops) stop();
  };
}

function syncHosts(): void {
  for (const host of configuredHosts(useSettingsStore.getState().settings)) {
    void syncHost(host);
  }
}

/**
 * useDispatchSync — keeps the Dispatch overview current while `enabled`: polls
 * the T3 hosts and Azure DevOps, reads everything again on Refresh, and
 * rebuilds the overview when one of its other inputs changes (pull requests,
 * the track star, the slot pattern, hidden suggestions, manual links). It
 * also answers the notifications and the tray flyout when they ask to show
 * an item or to take an action on it.
 */
export function useDispatchSync(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    void useDispatchStore.getState().restorePersisted().then(recomputeOverview);
    syncAll(false);

    const t3Timer = window.setInterval(syncHosts, T3_POLL_MS);
    const adoTimer = window.setInterval(() => void syncItems(), ADO_POLL_MS);
    const onRefresh = () => syncAll(true);
    document.addEventListener('borgdock-refresh', onRefresh);
    window.addEventListener('focus', syncHosts);

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
        if (state.settings.azureDevOps !== previous.settings.azureDevOps) void syncItems();
        if (state.settings.agents?.t3SlotPattern !== previous.settings.agents?.t3SlotPattern) {
          recomputeOverview();
        }
      }),
      useDispatchStore.subscribe((state, previous) => {
        if (
          state.hiddenSuggestions !== previous.hiddenSuggestions ||
          state.manualLinks !== previous.manualLinks
        ) {
          recomputeOverview();
        }
      }),
    ];

    return () => {
      window.clearInterval(t3Timer);
      window.clearInterval(adoTimer);
      document.removeEventListener('borgdock-refresh', onRefresh);
      window.removeEventListener('focus', syncHosts);
      for (const unsubscribe of unsubscribers) unsubscribe();
      unmounted = true;
      stopListening?.();
    };
  }, [enabled]);
}
