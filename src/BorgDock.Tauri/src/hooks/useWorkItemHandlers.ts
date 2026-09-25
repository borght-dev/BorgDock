import { useCallback, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';

/**
 * The Work items section's query handlers: pick a query (and remember it as
 * the last one), star or unstar it, and the query browser's open state. The
 * work item itself opens in the full-screen detail view, which loads its own
 * data (`useWorkItemDetailData`).
 */
export function useWorkItemHandlers() {
  const [queryBrowserOpen, setQueryBrowserOpen] = useState(false);

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

  return { queryBrowserOpen, setQueryBrowserOpen, handleSelectQuery, handleToggleFavorite };
}
