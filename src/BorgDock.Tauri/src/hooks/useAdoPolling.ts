import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdoQueryTreeNode } from '@/components/work-items/QueryBrowser';
import { AdoClient } from '@/services/ado/client';
import { executeQuery, getQueryTree } from '@/services/ado/queries';
import { getCurrentUserDisplayName } from '@/services/ado/workitems';
import { PollingManager } from '@/services/polling';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { AdoQuery, AppSettings, WorkItem } from '@/types';

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
const SETTLE_DELAY_MS = 500;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useAdoPolling(settings: AppSettings) {
  const clientRef = useRef<AdoClient | null>(null);
  const pollingRef = useRef<PollingManager<WorkItem[]> | null>(null);
  const prevQueryIdRef = useRef<string | null>(null);
  // Keep settings in a ref so the init effect always reads the latest
  // without re-running when array/object references change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const organization = useDebouncedValue(settings.azureDevOps.organization, SETTLE_DELAY_MS);
  const project = useDebouncedValue(settings.azureDevOps.project, SETTLE_DELAY_MS);
  const personalAccessToken = useDebouncedValue(
    settings.azureDevOps.personalAccessToken,
    SETTLE_DELAY_MS,
  );
  const authMethod = settings.azureDevOps.authMethod;

  const isConfigured =
    !!organization &&
    !!project &&
    (authMethod === 'azCli' || !!personalAccessToken);

  // Create/update client when settings change
  useEffect(() => {
    if (!isConfigured) {
      clientRef.current = null;
      return;
    }

    clientRef.current = new AdoClient(
      organization,
      project,
      personalAccessToken ?? '',
      authMethod,
    );
  }, [isConfigured, organization, project, personalAccessToken, authMethod]);

  // On mount: resolve user, load query tree, restore state
  useEffect(() => {
    if (!isConfigured) return;

    const client = new AdoClient(
      organization,
      project,
      personalAccessToken ?? '',
      authMethod,
    );
    clientRef.current = client;

    const store = useWorkItemsStore.getState();

    (async () => {
      // Read from the ref so array/object settings don't cause re-runs
      const currentSettings = settingsRef.current;

      // Resolve current user display name
      try {
        const name = await getCurrentUserDisplayName(client);
        if (name) {
          useWorkItemsStore.getState().setCurrentUserDisplayName(name);
        }
      } catch {
        // Best-effort user detection
      }

      // Load query tree
      try {
        const rawTree = await getQueryTree(client);
        const favoriteIds = currentSettings.azureDevOps.favoriteQueryIds;
        const tree: AdoQueryTreeNode[] = rawTree.map((q) => mapQueryToTreeNode(q, favoriteIds));
        useWorkItemsStore.getState().setQueryTree(tree);
      } catch (err) {
        console.error('Failed to load ADO query tree:', err);
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
    })();

    // Only restart when auth or connection settings change.
    // Array/object settings (favoriteQueryIds, trackedWorkItemIds, etc.)
    // are read from settingsRef inside the async IIFE.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, organization, personalAccessToken, project, authMethod]);

  // Subscribe to selectedQueryId changes and fetch work items
  useEffect(() => {
    if (!isConfigured) return;

    const unsubscribe = useWorkItemsStore.subscribe((state) => {
      const queryId = state.selectedQueryId;
      if (queryId === prevQueryIdRef.current) return;
      prevQueryIdRef.current = queryId;

      if (!queryId || !clientRef.current) return;

      useWorkItemsStore.getState().setIsLoading(true);
      executeQuery(clientRef.current, queryId)
        .then((items) => {
          useWorkItemsStore.getState().setWorkItems(items);
        })
        .catch((err) => {
          console.error('Failed to execute ADO query:', err);
        })
        .finally(() => {
          useWorkItemsStore.getState().setIsLoading(false);
        });
    });

    return () => unsubscribe();
  }, [isConfigured]);

  // Polling loop — uses PollingManager for adaptive intervals
  useEffect(() => {
    if (!isConfigured) return;

    const intervalMs = (settings.azureDevOps.pollIntervalSeconds || 120) * 1000;

    const pollFn = async (): Promise<WorkItem[]> => {
      const queryId = useWorkItemsStore.getState().selectedQueryId;
      if (!queryId || !clientRef.current) return [];
      return executeQuery(clientRef.current, queryId);
    };

    const manager = new PollingManager(pollFn, intervalMs);

    manager.onResult = (items) => {
      useWorkItemsStore.getState().setWorkItems(items);
    };

    manager.onError = (err) => {
      console.error('ADO polling error:', err);
    };

    pollingRef.current = manager;
    // Skip immediate first poll — the subscription handler above already
    // fetches on query selection. Start with the full interval delay.
    manager.startDeferred();

    return () => {
      manager.stop();
      pollingRef.current = null;
    };
  }, [isConfigured, settings.azureDevOps.pollIntervalSeconds]);

  // Manual refresh
  const refreshNow = useCallback(async () => {
    if (pollingRef.current) {
      useWorkItemsStore.getState().setIsLoading(true);
      try {
        await pollingRef.current.pollNow();
      } finally {
        useWorkItemsStore.getState().setIsLoading(false);
      }
    }
  }, []);

  return { refreshNow };
}
