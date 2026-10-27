import { DELIVERY_MS, pollDeliveries } from '@/services/activity/adapters/delivery';
import * as api from '@/services/activity/api';
import { retireSourcesExcept } from '@/services/activity/ingest';
import { sourceId } from '@/services/activity/sources';
import { parseScope } from '@/services/github/scope';
import { getClientForRepo } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import { PollingManager } from '@/services/polling';
import { followActivityCounts, useActivityStore } from '@/stores/activity-store';
import { useSettingsStore } from '@/stores/settings-store';
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

  return () => {
    stopCounts();
    clearInterval(pruneTimer);
    deliveries.stop();
    untrackDeliveries();
    unsubscribeSettings();
  };
}
