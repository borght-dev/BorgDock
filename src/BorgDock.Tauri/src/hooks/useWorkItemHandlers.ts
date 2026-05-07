import { useCallback, useEffect, useState } from 'react';
import type { WorkItemFieldUpdates } from '@/components/work-items/WorkItemDetailPanel';
import { AdoClient } from '@/services/ado/client';
import { getProjectFields, indexFieldsByRef } from '@/services/ado/fields';
import {
  getProcessLayout,
  getProcessWitTypeRefs,
  getProjectProcessId,
} from '@/services/ado/layout';
import { executeQuery } from '@/services/ado/queries';
import {
  addWorkItemComment,
  deleteWorkItem,
  downloadAttachment,
  getWorkItem,
  getWorkItemComments,
  getWorkItemTypeStates,
  updateWorkItem,
} from '@/services/ado/workitems';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { JsonPatchOperation, WorkItem, WorkItemAttachment, WorkItemComment } from '@/types';
import { getField } from '@/utils/work-item-helpers';

interface UseWorkItemHandlersOptions {
  organization: string;
  project: string;
  personalAccessToken?: string;
  authMethod: import('@/types/settings').AdoAuthMethod;
}

export function useWorkItemHandlers(options: UseWorkItemHandlersOptions) {
  const { organization, project, personalAccessToken, authMethod } = options;

  // Local state
  const [queryBrowserOpen, setQueryBrowserOpen] = useState(false);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<number | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState<string | undefined>();
  const [detailItem, setDetailItem] = useState<WorkItem | null>(null);
  const [detailStates, setDetailStates] = useState<string[]>([]);
  const [detailComments, setDetailComments] = useState<WorkItemComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  // ADO client helper
  const getClient = useCallback((): AdoClient | null => {
    const patOk = authMethod === 'azCli' || !!personalAccessToken;
    if (!organization || !patOk) {
      return null;
    }
    return new AdoClient(organization, project, personalAccessToken ?? '', authMethod);
  }, [organization, project, personalAccessToken, authMethod]);

  /** Fire-and-forget loader for the process layout that drives detail-panel
   *  tabs. Caches processId once per session and witTypeRefs once per process;
   *  fetches a layout per work-item-type on first sighting. Any failure is
   *  swallowed (the UI falls back to a flat Overview tab). */
  const ensureLayoutLoaded = useCallback(
    async (client: AdoClient, witFriendlyName: string) => {
      const store = useWorkItemsStore.getState();
      if (store.workItemTypeLayouts.has(witFriendlyName)) return;

      let processId = store.processId;
      if (!store.processIdResolved) {
        processId = await getProjectProcessId(client, project);
        useWorkItemsStore.getState().setProcessId(processId);
        useWorkItemsStore.getState().setProcessIdResolved(true);
      }
      if (!processId) {
        useWorkItemsStore.getState().setWorkItemTypeLayout(witFriendlyName, null);
        return;
      }

      let refs = useWorkItemsStore.getState().witTypeRefs;
      if (refs.size === 0) {
        refs = await getProcessWitTypeRefs(client, processId);
        useWorkItemsStore.getState().setWitTypeRefs(refs);
      }

      const witRefName = refs.get(witFriendlyName);
      if (!witRefName) {
        useWorkItemsStore.getState().setWorkItemTypeLayout(witFriendlyName, null);
        return;
      }

      const layout = await getProcessLayout(client, processId, witRefName);
      useWorkItemsStore.getState().setWorkItemTypeLayout(witFriendlyName, layout);
    },
    [project],
  );

  const handleSelectWorkItem = useCallback(
    async (id: number) => {
      setSelectedWorkItemId(id);
      setIsDetailLoading(true);
      setStatusText(undefined);

      const client = getClient();
      if (!client) {
        setIsDetailLoading(false);
        return;
      }

      try {
        const fullItem = await getWorkItem(client, id);
        setDetailItem(fullItem);

        // Load comments
        setIsLoadingComments(true);
        getWorkItemComments(client, id)
          .then((c) => setDetailComments(c))
          .catch((err) => console.error('Failed to load comments:', err))
          .finally(() => setIsLoadingComments(false));

        // Load project field definitions once per session.
        // This drives rich-text vs plain-text rendering in the detail panel
        // and lets us render configured-but-empty HTML fields like QA Notes.
        if (useWorkItemsStore.getState().fieldDefinitions === null) {
          getProjectFields(client)
            .then((fields) =>
              useWorkItemsStore.getState().setFieldDefinitions(indexFieldsByRef(fields)),
            )
            .catch((err) => console.error('Failed to load field definitions:', err));
        }

        // Load available states for the work item type
        const itemType = getField(fullItem, 'System.WorkItemType');
        if (itemType) {
          try {
            const states = await getWorkItemTypeStates(client, itemType);
            setDetailStates(states);
          } catch {
            // Fallback: use current state
            setDetailStates([getField(fullItem, 'System.State')]);
          }

          // Fire-and-forget: load the process layout to drive detail tabs.
          ensureLayoutLoaded(client, itemType).catch((err) =>
            console.error('Failed to load process layout:', err),
          );
        }
      } catch (err) {
        console.error('Failed to load work item detail:', err);
        setStatusText('Failed to load details');
      } finally {
        setIsDetailLoading(false);
      }
    },
    [getClient, ensureLayoutLoaded],
  );

  // Pick up work item ID from command palette
  const pendingWorkItemId = useUiStore((s) => s.pendingWorkItemId);
  useEffect(() => {
    if (pendingWorkItemId !== null) {
      useUiStore.getState().setPendingWorkItemId(null);
      handleSelectWorkItem(pendingWorkItemId);
    }
  }, [pendingWorkItemId, handleSelectWorkItem]);

  const handleSave = useCallback(
    async (updates: WorkItemFieldUpdates) => {
      if (!selectedWorkItemId || !detailItem) return;

      const client = getClient();
      if (!client) return;

      setIsSaving(true);
      setStatusText(undefined);

      const operations: JsonPatchOperation[] = [];

      if (updates.title !== getField(detailItem, 'System.Title')) {
        operations.push({
          op: 'replace',
          path: '/fields/System.Title',
          value: updates.title,
        });
      }
      if (updates.state !== getField(detailItem, 'System.State')) {
        operations.push({
          op: 'replace',
          path: '/fields/System.State',
          value: updates.state,
        });
      }
      if (updates.assignedTo !== getField(detailItem, 'System.AssignedTo')) {
        operations.push({
          op: 'replace',
          path: '/fields/System.AssignedTo',
          value: updates.assignedTo,
        });
      }
      const currentPriority =
        Number(detailItem.fields['Microsoft.VSTS.Common.Priority']) || undefined;
      if (updates.priority !== currentPriority) {
        operations.push({
          op: 'replace',
          path: '/fields/Microsoft.VSTS.Common.Priority',
          value: updates.priority ?? '',
        });
      }
      if (updates.tags !== getField(detailItem, 'System.Tags')) {
        operations.push({
          op: 'replace',
          path: '/fields/System.Tags',
          value: updates.tags,
        });
      }
      // Iteration: panel passes only the last segment of the current path.
      // Reconstruct the full path by replacing the trailing segment of the
      // existing iteration. If the user typed a backslash/forward slash,
      // treat the input as a full path.
      if (updates.iteration !== undefined) {
        const currentPath = String(detailItem.fields['System.IterationPath'] ?? '');
        const currentSeg = currentPath ? (currentPath.split(/[\\/]/).pop() ?? '') : '';
        if (updates.iteration !== currentSeg) {
          const fullPath = /[\\/]/.test(updates.iteration)
            ? updates.iteration
            : currentPath
              ? currentPath.replace(/[^\\/]+$/, updates.iteration)
              : updates.iteration;
          operations.push({
            op: 'replace',
            path: '/fields/System.IterationPath',
            value: fullPath,
          });
        }
      }

      if (operations.length === 0) {
        setStatusText('No changes');
        setIsSaving(false);
        return;
      }

      try {
        const updated = await updateWorkItem(client, selectedWorkItemId, operations);
        setDetailItem(updated);
        setStatusText('Saved');

        // Update the item in the store's work items list
        const currentItems = useWorkItemsStore.getState().workItems;
        const updatedItems = currentItems.map((wi) => (wi.id === updated.id ? updated : wi));
        useWorkItemsStore.getState().setWorkItems(updatedItems);
      } catch (err) {
        console.error('Failed to save work item:', err);
        setStatusText('Save failed');
      } finally {
        setIsSaving(false);
      }
    },
    [selectedWorkItemId, detailItem, getClient],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedWorkItemId) return;

    const client = getClient();
    if (!client) return;

    setIsSaving(true);
    try {
      await deleteWorkItem(client, selectedWorkItemId);

      // Remove from store
      const currentItems = useWorkItemsStore.getState().workItems;
      useWorkItemsStore
        .getState()
        .setWorkItems(currentItems.filter((wi) => wi.id !== selectedWorkItemId));

      setSelectedWorkItemId(null);
      setDetailItem(null);
    } catch (err) {
      console.error('Failed to delete work item:', err);
      setStatusText('Delete failed');
    } finally {
      setIsSaving(false);
    }
  }, [selectedWorkItemId, getClient]);

  const handleAddComment = useCallback(
    async (text: string) => {
      if (!selectedWorkItemId) return;
      const client = getClient();
      if (!client) return;
      const newComment = await addWorkItemComment(client, selectedWorkItemId, text);
      setDetailComments((prev) => [...prev, newComment]);
    },
    [selectedWorkItemId, getClient],
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedWorkItemId(null);
    setDetailItem(null);
    setDetailComments([]);
    setStatusText(undefined);
  }, []);

  const handleOpenInBrowser = useCallback(async (url: string) => {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  }, []);

  const handleDownloadAttachment = useCallback(
    async (attachment: WorkItemAttachment) => {
      const client = getClient();
      if (!client) return;

      try {
        const blob = await downloadAttachment(client, attachment.id, attachment.fileName);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = attachment.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to download attachment:', err);
      }
    },
    [getClient],
  );

  const handleSelectQuery = useCallback((queryId: string) => {
    useWorkItemsStore.getState().selectQuery(queryId);
    setQueryBrowserOpen(false);

    // Persist last selected query to settings
    const current = useSettingsStore.getState().settings;
    useSettingsStore.getState().saveSettings({
      ...current,
      azureDevOps: { ...current.azureDevOps, lastSelectedQueryId: queryId },
    });
  }, []);

  const handleToggleFavorite = useCallback((queryId: string) => {
    useWorkItemsStore.getState().toggleFavorite(queryId);

    // Persist to settings
    const updatedIds = useWorkItemsStore.getState().favoriteQueryIds;
    const current = useSettingsStore.getState().settings;
    useSettingsStore.getState().saveSettings({
      ...current,
      azureDevOps: { ...current.azureDevOps, favoriteQueryIds: updatedIds },
    });
  }, []);

  const handleRefresh = useCallback(() => {
    const queryId = useWorkItemsStore.getState().selectedQueryId;
    if (!queryId) return;

    const client = getClient();
    if (!client) return;

    useWorkItemsStore.getState().setIsLoading(true);
    executeQuery(client, queryId)
      .then((items) => {
        useWorkItemsStore.getState().setWorkItems(items);
      })
      .catch((err) => {
        console.error('Failed to refresh work items:', err);
      })
      .finally(() => {
        useWorkItemsStore.getState().setIsLoading(false);
      });
  }, [getClient]);

  return {
    // State
    queryBrowserOpen,
    setQueryBrowserOpen,
    selectedWorkItemId,
    isDetailLoading,
    isSaving,
    statusText,
    detailItem,
    detailStates,
    detailComments,
    isLoadingComments,

    // Handlers
    handleSelectWorkItem,
    handleSave,
    handleDelete,
    handleAddComment,
    handleCloseDetail,
    handleOpenInBrowser,
    handleDownloadAttachment,
    handleSelectQuery,
    handleToggleFavorite,
    handleRefresh,
  };
}
