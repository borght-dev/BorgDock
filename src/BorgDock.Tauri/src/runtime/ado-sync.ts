import type { AdoQueryTreeNode } from '@/components/work-items/QueryBrowser';
import { executeQuery, getQueryTree } from '@/services/ado/queries';
import { adoClient } from '@/services/ado/singleton';
import { getCurrentUserDisplayName } from '@/services/ado/workitems';
import { PollingManager } from '@/services/polling';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { AdoQuery, AppSettings } from '@/types';

function mapQueryToTreeNode(query: AdoQuery, favoriteIds: string[]): AdoQueryTreeNode {
  return {
    ...query,
    isFavorite: favoriteIds.includes(query.id),
    isExpanded: false,
    children: query.children.map((child) => mapQueryToTreeNode(child, favoriteIds)),
  };
}

// Treat connection settings as "settled" only after they stop changing for
// this long. Prevents every keystroke in the Settings → ADO form from
// re-creating the client and firing a 404 on partial org/project values.

/**
 * Duck-typed on purpose (not `instanceof AdoAuthExpiredError`): the client
 * module is mocked wholesale in tests and the check must survive that.
 */
function isAuthExpired(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'AdoAuthExpiredError'
  );
}

/**
 * Route an ADO failure to the right sink. An expired sign-in flips the
 * store flag once (and warns once) instead of logging a JSON SyntaxError
 * every poll cycle; anything else is a real error and logs as before.
 */
function reportAdoError(context: string, err: unknown): void {
  if (isAuthExpired(err)) {
    const store = useWorkItemsStore.getState();
    if (!store.adoAuthExpired) {
      store.setAdoAuthExpired(true);
      console.warn(`${context}: Azure DevOps sign-in expired — run \`az login\` and refresh.`);
    }
    return;
  }
  console.error(`${context}:`, err);
}

function clearAuthExpired(): void {
  const store = useWorkItemsStore.getState();
  if (store.adoAuthExpired) store.setAdoAuthExpired(false);
}

import { trackPolling } from './visibility';

export function startAdoSync(getSettings: () => AppSettings) {
  const settings = getSettings();
  const ado = settings.azureDevOps;
  const client = adoClient(ado);
  if (!client) return { refresh: async () => {}, stop: () => {} };
  const store = useWorkItemsStore.getState();
  let stopped = false;
  let requestedQuery: string | null = null;
  const manager = new PollingManager(
    async () => {
      const queryId = useWorkItemsStore.getState().selectedQueryId;
      requestedQuery = queryId;
      return queryId ? executeQuery(client, queryId) : [];
    },
    (ado.pollIntervalSeconds || 120) * 1000,
  );
  manager.onResult = (items) => {
    if (stopped || requestedQuery !== useWorkItemsStore.getState().selectedQueryId) return;
    useWorkItemsStore.getState().setWorkItems(items);
    clearAuthExpired();
  };
  manager.onError = (error) => {
    if (!stopped) reportAdoError('ADO polling error', error);
  };
  const untrack = trackPolling(manager);
  manager.startDeferred();
  const refresh = async () => {
    if (stopped) return;
    useWorkItemsStore.getState().setIsLoading(true);
    try {
      await manager.pollNow();
    } finally {
      if (!stopped) useWorkItemsStore.getState().setIsLoading(false);
    }
  };
  const unsubscribe = useWorkItemsStore.subscribe((state, previous) => {
    if (state.selectedQueryId !== previous.selectedQueryId && state.selectedQueryId) {
      void refresh().then(() => {
        if (!stopped && requestedQuery !== useWorkItemsStore.getState().selectedQueryId)
          void refresh();
      });
    }
  });
  void (async () => {
    // Read from the ref so array/object settings don't cause re-runs
    const currentSettings = getSettings();

    // Resolve current user display name
    try {
      const name = await getCurrentUserDisplayName(client);
      if (stopped) return;
      if (name) {
        useWorkItemsStore.getState().setCurrentUserDisplayName(name);
      }
    } catch {
      // Best-effort user detection
    }

    // Load query tree
    try {
      const rawTree = await getQueryTree(client);
      if (stopped) return;
      const favoriteIds = currentSettings.azureDevOps.favoriteQueryIds;
      const tree: AdoQueryTreeNode[] = rawTree.map((q) => mapQueryToTreeNode(q, favoriteIds));
      useWorkItemsStore.getState().setQueryTree(tree);
      clearAuthExpired();
    } catch (err) {
      if (stopped) return;
      reportAdoError('Failed to load ADO query tree', err);
    }

    // Set favorite query IDs from settings
    const currentFavorites = useWorkItemsStore.getState().favoriteQueryIds;
    for (const id of currentSettings.azureDevOps.favoriteQueryIds) {
      if (!currentFavorites.includes(id)) {
        useWorkItemsStore.getState().toggleFavorite(id);
      }
    }

    // Restore tracked/workingOn IDs from settings
    const trackedIds = new Set(currentSettings.azureDevOps.trackedWorkItemIds);
    const workingOnIds = new Set(currentSettings.azureDevOps.workingOnWorkItemIds);
    const worktreePaths = currentSettings.azureDevOps.workItemWorktreePaths;

    // Sync tracked IDs
    for (const id of trackedIds) {
      if (!store.trackedWorkItemIds.has(id)) {
        useWorkItemsStore.getState().toggleTracked(id);
      }
    }

    // Sync workingOn IDs
    for (const id of workingOnIds) {
      if (!store.workingOnWorkItemIds.has(id)) {
        useWorkItemsStore.getState().toggleWorkingOn(id);
      }
    }

    // Restore recent work item IDs
    const recentIds = currentSettings.azureDevOps.recentWorkItemIds ?? [];
    if (recentIds.length > 0) {
      useWorkItemsStore.getState().setRecentWorkItemIds(recentIds);
    }

    // Sync worktree paths
    for (const [idStr, path] of Object.entries(worktreePaths)) {
      useWorkItemsStore.getState().setWorktreePath(Number(idStr), path);
    }

    // Auto-select last selected query
    if (currentSettings.azureDevOps.lastSelectedQueryId) {
      useWorkItemsStore.getState().selectQuery(currentSettings.azureDevOps.lastSelectedQueryId);
    }

    if (!stopped && useWorkItemsStore.getState().selectedQueryId && requestedQuery === null)
      void refresh();
  })().catch((error) => {
    if (!stopped) reportAdoError('ADO initialization failed', error);
  });
  return {
    refresh,
    stop() {
      stopped = true;
      manager.stop();
      unsubscribe();
      untrack();
      useWorkItemsStore.getState().setIsLoading(false);
    },
  };
}
