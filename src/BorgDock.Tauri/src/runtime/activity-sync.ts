import { commands } from '@/generated/commands';
import { bringMainWindowForward } from '@/hooks/useFlyoutSync';
import { act } from '@/services/activity/actions';
import { DELIVERY_MS, pollDeliveries } from '@/services/activity/adapters/delivery';
import * as api from '@/services/activity/api';
import { retireSourcesExcept } from '@/services/activity/ingest';
import { sourceId } from '@/services/activity/sources';
import type { ActivityEntry } from '@/services/activity/types';
import { parseScope } from '@/services/github/scope';
import { getClientForRepo } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { showSection } from '@/services/navigation';
import { PollingManager } from '@/services/polling';
import { followActivityCounts, selectNeedsYou, useActivityStore } from '@/stores/activity-store';
import { useActivityViewStore } from '@/stores/activity-view-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast } from '@/stores/toast-store';
import { trackPolling } from './visibility';

const log = createLogger('activity-runtime');

/** Retention runs at startup and then once a day. */
const PRUNE_MS = 24 * 60 * 60_000;

/** Repository sources (`gh:`, `deploy:`, `ci:`) of repositories no longer in settings. */
async function retireRemovedRepositories(): Promise<void> {
  const repos = new Set(
    useSettingsStore
      .getState()
      .settings.repos.filter((repo) => repo.enabled)
      .map((repo) => `${repo.owner}/${repo.name}`.toLowerCase()),
  );
  const sources = await api.listSources().catch(() => []);
  for (const source of sources) {
    if (source.retiredAt || !['gh', 'deploy', 'ci'].includes(source.kind)) continue;
    const scope = parseScope(source.sourceId.slice(source.sourceId.indexOf(':') + 1));
    if (scope && !repos.has(`${scope.owner}/${scope.repo}`)) {
      await api.retireSource(source.sourceId).catch(() => {});
    }
  }
}

/** The ADO project in settings, as the source the journal keys it by. */
function adoSourceIds(): string[] {
  const { organization, project } = useSettingsStore.getState().settings.azureDevOps;
  return organization && project ? [sourceId.ado(organization, project)] : [];
}

/**
 * The activity journal for the main window: the counts every surface shows,
 * what the store said about itself (read-only, recovered), retention, the
 * deployment poller, and retiring sources settings dropped. The adapters
 * themselves hook into the syncs that already read each source.
 */
export function startActivitySync(): () => void {
  const store = useActivityStore.getState();
  const stopCounts = followActivityCounts();

  void api
    .storeInfo()
    .then((info) => {
      store.setReadOnly(info.readOnly);
      store.setRecoveredFrom(info.recoveredFrom);
      store.setCapacity(info.capacity);
    })
    .catch((error) => log.warn('activity store info failed', { error: String(error) }));

  const prune = () =>
    void api.prune().catch((error) => log.warn('activity prune failed', { error: String(error) }));
  prune();
  const pruneTimer = setInterval(prune, PRUNE_MS);

  const deliveries = new PollingManager(() => pollDeliveries(getClientForRepo), DELIVERY_MS);
  deliveries.onError = (error) => log.warn('deployment poll failed', { error: String(error) });
  const untrackDeliveries = trackPolling(deliveries);
  deliveries.startDeferred();

  let adoKey = JSON.stringify(adoSourceIds());
  const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
    if (state.settings.repos !== previous.settings.repos) void retireRemovedRepositories();
    if (state.settings.azureDevOps === previous.settings.azureDevOps) return;
    const next = JSON.stringify(adoSourceIds());
    if (next === adoKey) return;
    adoKey = next;
    void retireSourcesExcept('ado', adoSourceIds());
  });

  const stopBadge = followTaskbarBadge();

  let stopListening: (() => void) | undefined;
  let stopped = false;
  void listenToOtherWindows().then((stop) => {
    if (stopped) stop();
    else stopListening = stop;
  });

  return () => {
    stopped = true;
    stopCounts();
    clearInterval(pruneTimer);
    deliveries.stop();
    untrackDeliveries();
    unsubscribeSettings();
    stopBadge();
    stopListening?.();
  };
}

/** The taskbar icon shows how many unread entries need me, unless settings say no. */
function followTaskbarBadge(): () => void {
  let shown = -1;
  const update = () => {
    const enabled =
      useSettingsStore.getState().settings.notifications.activity?.taskbarBadge !== false;
    const count = enabled ? selectNeedsYou(useActivityStore.getState()) : 0;
    if (count === shown) return;
    shown = count;
    void commands.setTaskbarBadge(count).catch(() => {});
  };
  update();
  const stopActivity = useActivityStore.subscribe(update);
  const stopSettings = useSettingsStore.subscribe(update);
  return () => {
    stopActivity();
    stopSettings();
  };
}

async function entryById(id: string): Promise<ActivityEntry | null> {
  const page = await api.listEntries({
    filter: 'all',
    categories: [],
    sourceIds: [],
    entityKeys: [],
    ids: [id],
    search: null,
    includeDismissed: true,
    limit: 1,
    before: null,
  });
  return page.entries[0] ?? null;
}

/** Show an entry in Activity, selected and open. */
export async function showActivityEntry(id: string): Promise<void> {
  await bringMainWindowForward();
  const view = useActivityViewStore.getState();
  view.select(id);
  if (useActivityViewStore.getState().expandedId !== id) view.toggleExpanded(id);
  await showSection('activity');
}

/** A popup's or the tray's action: checked again here, where the stores are live. */
export async function actOnActivityEntry(id: string): Promise<void> {
  const entry = await entryById(id);
  if (!entry) return;
  await bringMainWindowForward();
  const { reason } = await act(entry);
  if (reason) showToast({ message: `${reason}. Opened it instead.` });
}

async function listenToOtherWindows(): Promise<() => void> {
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const stops = await Promise.all([
      listen<{ id: string }>(
        api.SHOW_ACTIVITY_EVENT,
        (event) => void showActivityEntry(event.payload.id),
      ),
      listen<{ id: string }>(
        api.ACT_ACTIVITY_EVENT,
        (event) => void actOnActivityEntry(event.payload.id),
      ),
    ]);
    return () => {
      for (const stop of stops) stop();
    };
  } catch {
    return () => {};
  }
}
