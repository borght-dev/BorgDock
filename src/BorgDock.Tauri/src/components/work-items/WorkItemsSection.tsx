import { useMemo } from 'react';
import type { AdoQueryTreeNode } from '@/components/work-items/QueryBrowser';
import { QueryBrowser } from '@/components/work-items/QueryBrowser';
import type { WorkItemCardData } from '@/components/work-items/WorkItemCard';
import { WorkItemDetailPanel } from '@/components/work-items/WorkItemDetailPanel';
import { WorkItemFilterBar } from '@/components/work-items/WorkItemFilterBar';
import { WorkItemList } from '@/components/work-items/WorkItemList';
import { useWorkItemHandlers } from '@/hooks/useWorkItemHandlers';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { classifyFields, extractAttachments } from '@/utils/work-item-fields';
import {
  flattenQueries,
  getField,
  mapQueryTreeNodes,
  mapToCardData,
  type WorkItemsStoreSnapshot,
} from '@/utils/work-item-helpers';

export function WorkItemsSection() {
  const settings = useSettingsStore((s) => s.settings);
  const adoSettings = settings.azureDevOps;
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  // Work items store
  const queryTree = useWorkItemsStore((s) => s.queryTree);
  const selectedQueryId = useWorkItemsStore((s) => s.selectedQueryId);
  const favoriteQueryIds = useWorkItemsStore((s) => s.favoriteQueryIds);
  const filteredWorkItems = useWorkItemsStore((s) => s.filteredWorkItems);
  const availableStates = useWorkItemsStore((s) => s.availableStates);
  const availableAssignees = useWorkItemsStore((s) => s.availableAssignees);
  const stateFilter = useWorkItemsStore((s) => s.stateFilter);
  const assignedToFilter = useWorkItemsStore((s) => s.assignedToFilter);
  const trackingFilter = useWorkItemsStore((s) => s.trackingFilter);
  const trackedWorkItemIds = useWorkItemsStore((s) => s.trackedWorkItemIds);
  const workingOnWorkItemIds = useWorkItemsStore((s) => s.workingOnWorkItemIds);
  const workItemWorktreePaths = useWorkItemsStore((s) => s.workItemWorktreePaths);
  const isLoading = useWorkItemsStore((s) => s.isLoading);

  // Event handlers hook
  const {
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
  } = useWorkItemHandlers({
    organization: adoSettings.organization,
    project: adoSettings.project,
    personalAccessToken: adoSettings.personalAccessToken,
    authMethod: adoSettings.authMethod,
  });

  // Resolve the selected query name for display
  const selectedQueryName = useMemo(() => {
    if (!selectedQueryId) return undefined;
    const all = flattenQueries(queryTree);
    const match = all.find((q) => q.id === selectedQueryId);
    return match?.name;
  }, [selectedQueryId, queryTree]);

  // Map filtered items to card data
  const items = filteredWorkItems();
  const cardItems: WorkItemCardData[] = useMemo(() => {
    const storeSnapshot: WorkItemsStoreSnapshot = {
      trackedWorkItemIds,
      workingOnWorkItemIds,
      workItemWorktreePaths,
    };
    return items.map((item) =>
      mapToCardData(
        item,
        storeSnapshot,
        selectedWorkItemId,
        adoSettings.organization,
        adoSettings.project,
      ),
    );
  }, [
    items,
    trackedWorkItemIds,
    workingOnWorkItemIds,
    workItemWorktreePaths,
    selectedWorkItemId,
    adoSettings.organization,
    adoSettings.project,
  ]);

  // Query browser tree nodes
  const queryTreeNodes: AdoQueryTreeNode[] = useMemo(
    () => mapQueryTreeNodes(queryTree, favoriteQueryIds),
    [queryTree, favoriteQueryIds],
  );

  const favoriteQueries: AdoQueryTreeNode[] = useMemo(() => {
    const all = flattenQueries(queryTree);
    return all
      .filter((q) => favoriteQueryIds.includes(q.id))
      .map((q) => ({
        ...q,
        isFavorite: true,
        isExpanded: false,
        children: [],
      }));
  }, [queryTree, favoriteQueryIds]);

  // Detail panel data
  const detailData = useMemo(() => {
    if (!detailItem) return null;
    const htmlUrl =
      detailItem.htmlUrl ||
      `https://dev.azure.com/${encodeURIComponent(adoSettings.organization)}/${encodeURIComponent(adoSettings.project)}/_workitems/edit/${detailItem.id}`;

    return {
      id: detailItem.id,
      title: getField(detailItem, 'System.Title'),
      state: getField(detailItem, 'System.State'),
      workItemType: getField(detailItem, 'System.WorkItemType'),
      assignedTo: getField(detailItem, 'System.AssignedTo'),
      priority: Number(detailItem.fields['Microsoft.VSTS.Common.Priority']) || undefined,
      tags: getField(detailItem, 'System.Tags'),
      htmlUrl,
      isNewItem: false,
    };
  }, [detailItem, adoSettings.organization, adoSettings.project]);

  const { richText, standard, custom } = useMemo(() => {
    if (!detailItem) return { richText: [], standard: [], custom: [] };
    return classifyFields(detailItem);
  }, [detailItem]);

  const attachments = useMemo(() => {
    if (!detailItem) return [];
    return extractAttachments(detailItem);
  }, [detailItem]);

  // Not configured state
  const hasCredentials =
    adoSettings.authMethod === 'azCli' || !!adoSettings.personalAccessToken;
  if (!adoSettings.organization || !hasCredentials) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="text-center">
          <svg
            className="mx-auto mb-3 h-10 w-10 text-[var(--color-text-ghost)]"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          >
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <path d="M5 6h6M5 9h4" />
          </svg>
          <p className="mb-3 text-[13px] text-[var(--color-text-muted)]">
            Configure Azure DevOps to see work items
          </p>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-accent-foreground)] hover:opacity-90 transition-opacity"
          >
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <WorkItemFilterBar
        states={availableStates()}
        assignees={availableAssignees()}
        selectedState={stateFilter === 'all' ? 'All' : stateFilter}
        selectedAssignee={assignedToFilter === '' ? 'Anyone' : assignedToFilter}
        trackingFilter={trackingFilter}
        trackedCount={trackedWorkItemIds.size}
        workingOnCount={workingOnWorkItemIds.size}
        onStateChange={(state) =>
          useWorkItemsStore.getState().setStateFilter(state === 'All' ? 'all' : state)
        }
        onAssigneeChange={(assignee) =>
          useWorkItemsStore.getState().setAssignedToFilter(assignee === 'Anyone' ? '' : assignee)
        }
        onTrackingFilterChange={(filter) => useWorkItemsStore.getState().setTrackingFilter(filter)}
        onRefresh={handleRefresh}
        onOpenQueryBrowser={() => setQueryBrowserOpen(true)}
        selectedQueryName={selectedQueryName}
      />

      {/* Query browser overlay */}
      {queryBrowserOpen && (
        <div className="absolute inset-0 z-40 flex">
          <div className="w-full">
            <QueryBrowser
              queryTree={queryTreeNodes}
              favoriteQueries={favoriteQueries}
              isLoading={isLoading}
              selectedQueryId={selectedQueryId ?? undefined}
              onSelectQuery={handleSelectQuery}
              onToggleFavorite={handleToggleFavorite}
              onClose={() => setQueryBrowserOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Work items list */}
      <WorkItemList
        items={cardItems}
        worktrees={[]}
        isLoading={isLoading}
        isEmpty={items.length === 0 && !!selectedQueryId}
        selectedQueryName={selectedQueryName}
        onSelect={handleSelectWorkItem}
        onToggleTracked={(id) => {
          useWorkItemsStore.getState().toggleTracked(id);
          const ids = [...useWorkItemsStore.getState().trackedWorkItemIds];
          const current = useSettingsStore.getState().settings;
          useSettingsStore.getState().saveSettings({
            ...current,
            azureDevOps: { ...current.azureDevOps, trackedWorkItemIds: ids },
          });
        }}
        onToggleWorkingOn={(id) => {
          useWorkItemsStore.getState().toggleWorkingOn(id);
          const ids = [...useWorkItemsStore.getState().workingOnWorkItemIds];
          const current = useSettingsStore.getState().settings;
          useSettingsStore.getState().saveSettings({
            ...current,
            azureDevOps: { ...current.azureDevOps, workingOnWorkItemIds: ids },
          });
        }}
        onAssignWorktree={(id, path) => {
          useWorkItemsStore.getState().setWorktreePath(id, path);
          const paths = useWorkItemsStore.getState().workItemWorktreePaths;
          const current = useSettingsStore.getState().settings;
          useSettingsStore.getState().saveSettings({
            ...current,
            azureDevOps: { ...current.azureDevOps, workItemWorktreePaths: paths },
          });
        }}
        onOpenInBrowser={handleOpenInBrowser}
      />

      {/* Work item detail overlay */}
      {selectedWorkItemId !== null && detailData && (
        <div className="absolute inset-0 z-50">
          <WorkItemDetailPanel
            item={detailData}
            isLoading={isDetailLoading}
            isSaving={isSaving}
            statusText={statusText}
            availableStates={detailStates}
            availableAssignees={availableAssignees()}
            richTextFields={richText}
            standardFields={standard}
            customFields={custom}
            attachments={attachments}
            comments={detailComments}
            isLoadingComments={isLoadingComments}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={handleCloseDetail}
            onOpenInBrowser={handleOpenInBrowser}
            onDownloadAttachment={handleDownloadAttachment}
            onAddComment={handleAddComment}
          />
        </div>
      )}
    </div>
  );
}
