import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';

/**
 * The ★ track and ● working toggles of a work item. Both flip the id in the
 * work-items store and save the new list with the Azure DevOps settings, so
 * the choice survives a restart. Shared by the rows (both layouts) and the
 * full-screen detail view's action bar.
 */
export function toggleTrackedWorkItem(id: number): void {
  useWorkItemsStore.getState().toggleTracked(id);
  const ids = [...useWorkItemsStore.getState().trackedWorkItemIds];
  const current = useSettingsStore.getState().settings;
  void useSettingsStore.getState().saveSettings({
    ...current,
    azureDevOps: { ...current.azureDevOps, trackedWorkItemIds: ids },
  });
}

export function toggleWorkingOnWorkItem(id: number): void {
  useWorkItemsStore.getState().toggleWorkingOn(id);
  const ids = [...useWorkItemsStore.getState().workingOnWorkItemIds];
  const current = useSettingsStore.getState().settings;
  void useSettingsStore.getState().saveSettings({
    ...current,
    azureDevOps: { ...current.azureDevOps, workingOnWorkItemIds: ids },
  });
}
