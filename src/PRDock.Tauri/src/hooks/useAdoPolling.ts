import { useEffect, useRef, useCallback } from 'react';
import type { AppSettings } from '@/types';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { AdoClient } from '@/services/ado/client';
import { getQueryTree, executeQuery } from '@/services/ado/queries';
import { getCurrentUserDisplayName } from '@/services/ado/workitems';
import type { AdoQueryTreeNode } from '@/components/work-items/QueryBrowser';
import type { AdoQuery } from '@/types';

function mapQueryToTreeNode(
  query: AdoQuery,
  favoriteIds: string[]
): AdoQueryTreeNode {
  return {
    ...query,
    isFavorite: favoriteIds.includes(query.id),
    isExpanded: false,
    children: query.children.map((child) =>
      mapQueryToTreeNode(child, favoriteIds)
    ),
  };
}

export function useAdoPolling(settings: AppSettings) {
  const clientRef = useRef<AdoClient | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevQueryIdRef = useRef<string | null>(null);

  const isConfigured =
    !!settings.azureDevOps.organization &&
    !!settings.azureDevOps.personalAccessToken;

  // Create/update client when settings change
  useEffect(() => {
    if (!isConfigured) {
      clientRef.current = null;
      return;
    }

    clientRef.current = new AdoClient(
      settings.azureDevOps.organization,
      settings.azureDevOps.project,
      settings.azureDevOps.personalAccessToken!
    );
  }, [
    isConfigured,
    settings.azureDevOps.organization,
    settings.azureDevOps.project,
    settings.azureDevOps.personalAccessToken,
  ]);

  // On mount: resolve user, load query tree, restore state
  useEffect(() => {
    if (!isConfigured) return;

    const client = new AdoClient(
      settings.azureDevOps.organization,
      settings.azureDevOps.project,
      settings.azureDevOps.personalAccessToken!
    );
    clientRef.current = client;

    const store = useWorkItemsStore.getState();

    (async () => {
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
        const favoriteIds = settings.azureDevOps.favoriteQueryIds;
        const tree: AdoQueryTreeNode[] = rawTree.map((q) =>
          mapQueryToTreeNode(q, favoriteIds)
        );
        useWorkItemsStore.getState().setQueryTree(tree);
      } catch (err) {
        console.error('Failed to load ADO query tree:', err);
      }

      // Set favorite query IDs from settings
      const currentFavorites =
        useWorkItemsStore.getState().favoriteQueryIds;
      for (const id of settings.azureDevOps.favoriteQueryIds) {
        if (!currentFavorites.includes(id)) {
          useWorkItemsStore.getState().toggleFavorite(id);
        }
      }

      // Restore tracked/workingOn IDs from settings
      const trackedIds = new Set(settings.azureDevOps.trackedWorkItemIds);
      const workingOnIds = new Set(
        settings.azureDevOps.workingOnWorkItemIds
      );
      const worktreePaths = settings.azureDevOps.workItemWorktreePaths;

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

      // Sync worktree paths
      for (const [idStr, path] of Object.entries(worktreePaths)) {
        useWorkItemsStore
          .getState()
          .setWorktreePath(Number(idStr), path);
      }

      // Auto-select last selected query
      if (settings.azureDevOps.lastSelectedQueryId) {
        useWorkItemsStore
          .getState()
          .selectQuery(settings.azureDevOps.lastSelectedQueryId);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured]);

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

  // Polling loop
  useEffect(() => {
    if (!isConfigured) return;

    const intervalMs =
      (settings.azureDevOps.pollIntervalSeconds || 120) * 1000;

    intervalRef.current = setInterval(() => {
      const queryId = useWorkItemsStore.getState().selectedQueryId;
      if (!queryId || !clientRef.current) return;

      executeQuery(clientRef.current, queryId)
        .then((items) => {
          useWorkItemsStore.getState().setWorkItems(items);
        })
        .catch((err) => {
          console.error('ADO polling error:', err);
        });
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isConfigured, settings.azureDevOps.pollIntervalSeconds]);

  // Manual refresh
  const refreshNow = useCallback(async () => {
    const queryId = useWorkItemsStore.getState().selectedQueryId;
    if (!queryId || !clientRef.current) return;

    useWorkItemsStore.getState().setIsLoading(true);
    try {
      const items = await executeQuery(clientRef.current, queryId);
      useWorkItemsStore.getState().setWorkItems(items);
    } catch (err) {
      console.error('ADO manual refresh error:', err);
    } finally {
      useWorkItemsStore.getState().setIsLoading(false);
    }
  }, []);

  return { refreshNow };
}
