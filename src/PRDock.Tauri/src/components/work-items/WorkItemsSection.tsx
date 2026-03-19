import { useState, useCallback, useMemo, useEffect } from 'react';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { WorkItemFilterBar } from '@/components/work-items/WorkItemFilterBar';
import { WorkItemList } from '@/components/work-items/WorkItemList';
import type { WorkItemCardData } from '@/components/work-items/WorkItemCard';
import {
  WorkItemDetailPanel,
  type WorkItemDetailData,
  type WorkItemFieldUpdates,
} from '@/components/work-items/WorkItemDetailPanel';
import { QueryBrowser, type AdoQueryTreeNode } from '@/components/work-items/QueryBrowser';
import { AdoClient } from '@/services/ado/client';
import { executeQuery } from '@/services/ado/queries';
import {
  getWorkItem,
  updateWorkItem,
  deleteWorkItem,
  downloadAttachment,
  getWorkItemTypeStates,
  getWorkItemComments,
  addWorkItemComment,
} from '@/services/ado/workitems';
import type {
  WorkItem,
  WorkItemComment,
  DynamicFieldItem,
  WorkItemAttachment,
  JsonPatchOperation,
  AdoQuery,
} from '@/types';

// ---- Helpers ----

function getField(item: WorkItem, field: string): string {
  const value = item.fields[field];
  if (typeof value === 'string') return value;
  // ADO identity fields are objects with displayName
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.displayName === 'string') return obj.displayName;
    if (typeof obj.uniqueName === 'string') return obj.uniqueName;
  }
  return '';
}

function formatAge(dateStr: string): string {
  if (!dateStr) return '';
  const created = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();

  if (diffMs < 0) return '';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;

  const years = Math.floor(months / 12);
  return `${years}y`;
}

interface WorkItemsStoreSnapshot {
  trackedWorkItemIds: Set<number>;
  workingOnWorkItemIds: Set<number>;
  workItemWorktreePaths: Record<number, string>;
}

function mapToCardData(
  item: WorkItem,
  store: WorkItemsStoreSnapshot,
  selectedId: number | null,
  organization: string,
  project: string
): WorkItemCardData {
  const htmlUrl =
    item.htmlUrl ||
    `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_workitems/edit/${item.id}`;

  return {
    id: item.id,
    title: getField(item, 'System.Title'),
    state: getField(item, 'System.State'),
    workItemType: getField(item, 'System.WorkItemType'),
    assignedTo: getField(item, 'System.AssignedTo'),
    priority: Number(item.fields['Microsoft.VSTS.Common.Priority']) || undefined,
    tags: getField(item, 'System.Tags'),
    age: formatAge(getField(item, 'System.CreatedDate')),
    htmlUrl,
    isTracked: store.trackedWorkItemIds.has(item.id),
    isWorkingOn: store.workingOnWorkItemIds.has(item.id),
    isSelected: item.id === selectedId,
    worktreePath: store.workItemWorktreePaths[item.id],
  };
}

// ---- Rich text / standard / custom field classification ----

const RICH_TEXT_FIELDS = new Set([
  'System.Description',
  'Microsoft.VSTS.TCM.ReproSteps',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'System.History',
]);

// Fields already shown in the header/form or that are noise
const SKIP_FIELDS = new Set([
  'System.Id',
  'System.Rev',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.AssignedTo',
  'System.Tags',
  'Microsoft.VSTS.Common.Priority',
  'System.CreatedDate',
  'System.AreaId',
  'System.IterationId',
  'System.NodeName',
  'System.TeamProject',
  'System.Watermark',
  'System.CommentCount',
  'System.BoardColumn',
  'System.BoardColumnDone',
  'System.AuthorizedDate',
  'System.RevisedDate',
  'System.PersonId',
  'System.IsDeleted',
  'System.Reason',
]);

/** Format an ISO date string to a human-readable form, or return null if not a date. */
function tryFormatDate(value: string): string | null {
  // Only attempt if it looks like an ISO date (e.g. 2026-03-13T07:46:03.1Z)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Extract a display string from an ADO field value that may be a primitive, object, or array. */
function formatFieldValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  // Identity objects: { displayName, uniqueName, ... }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.displayName === 'string') return obj.displayName;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.uniqueName === 'string') return obj.uniqueName;
    // Skip unrecognised objects entirely
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((v) => formatFieldValue(v)).filter(Boolean).join(', ') || null;
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  const str = String(value);
  // Try to format as date
  const dateStr = tryFormatDate(str);
  if (dateStr) return dateStr;

  return str;
}

/** Detect whether a string value contains HTML tags. */
function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/** Make a human-friendly label from a field reference name. */
function friendlyLabel(key: string): string {
  const last = key.split('.').pop() ?? key;
  // Insert spaces before capitals: "StateChangeDate" → "State Change Date"
  return last.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function classifyFields(item: WorkItem): {
  richText: DynamicFieldItem[];
  standard: DynamicFieldItem[];
  custom: DynamicFieldItem[];
} {
  const richText: DynamicFieldItem[] = [];
  const standard: DynamicFieldItem[] = [];
  const custom: DynamicFieldItem[] = [];

  for (const [key, value] of Object.entries(item.fields)) {
    if (SKIP_FIELDS.has(key)) continue;

    const isKnownHtml = RICH_TEXT_FIELDS.has(key);
    const label = friendlyLabel(key);

    // Handle known rich-text fields
    if (isKnownHtml) {
      const strValue = typeof value === 'string' ? value : '';
      if (!strValue) continue;
      richText.push({
        fieldKey: key,
        label,
        isHtml: true,
        htmlContent: strValue,
        section: 'richText',
      });
      continue;
    }

    // Format the value
    const formatted = formatFieldValue(value);
    if (!formatted) continue;

    // Detect HTML in string values that aren't in the known set
    const isHtml = typeof value === 'string' && looksLikeHtml(value);
    if (isHtml) {
      richText.push({
        fieldKey: key,
        label,
        isHtml: true,
        htmlContent: formatted,
        section: 'richText',
      });
      continue;
    }

    const isCustom = key.startsWith('Custom.') || key.startsWith('Microsoft.VSTS.CMMI.') || !key.startsWith('System.') && !key.startsWith('Microsoft.VSTS.');

    const field: DynamicFieldItem = {
      fieldKey: key,
      label,
      value: formatted,
      isHtml: false,
      section: isCustom ? 'custom' : 'standard',
    };

    if (isCustom) {
      custom.push(field);
    } else {
      standard.push(field);
    }
  }

  return { richText, standard, custom };
}

function extractAttachments(item: WorkItem): WorkItemAttachment[] {
  if (!item.relations) return [];
  return item.relations
    .filter((r) => r.rel === 'AttachedFile')
    .map((r) => ({
      id: String(r.attributes['id'] ?? r.url.split('/').pop() ?? ''),
      fileName: String(r.attributes['name'] ?? 'attachment'),
      size: Number(r.attributes['resourceSize'] ?? 0),
      url: r.url,
    }));
}

// ---- Query tree node mapping ----

function mapQueryTreeNodes(
  queries: AdoQuery[],
  favoriteIds: string[]
): AdoQueryTreeNode[] {
  return queries.map((q) => ({
    ...q,
    isFavorite: favoriteIds.includes(q.id),
    isExpanded: false,
    children: mapQueryTreeNodes(q.children, favoriteIds),
  }));
}

function flattenQueries(queries: AdoQuery[]): AdoQuery[] {
  const result: AdoQuery[] = [];
  for (const q of queries) {
    result.push(q);
    if (q.children.length > 0) {
      result.push(...flattenQueries(q.children));
    }
  }
  return result;
}

// ---- Component ----

export function WorkItemsSection() {
  const settings = useSettingsStore((s) => s.settings);
  const adoSettings = settings.azureDevOps;

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
    if (!adoSettings.organization || !adoSettings.personalAccessToken) {
      return null;
    }
    return new AdoClient(
      adoSettings.organization,
      adoSettings.project,
      adoSettings.personalAccessToken
    );
  }, [adoSettings.organization, adoSettings.project, adoSettings.personalAccessToken]);

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
        adoSettings.project
      )
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
    [queryTree, favoriteQueryIds]
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

  // ---- Event handlers ----

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
        }
      } catch (err) {
        console.error('Failed to load work item detail:', err);
        setStatusText('Failed to load details');
      } finally {
        setIsDetailLoading(false);
      }
    },
    [getClient]
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
        const updatedItems = currentItems.map((wi) =>
          wi.id === updated.id ? updated : wi
        );
        useWorkItemsStore.getState().setWorkItems(updatedItems);
      } catch (err) {
        console.error('Failed to save work item:', err);
        setStatusText('Save failed');
      } finally {
        setIsSaving(false);
      }
    },
    [selectedWorkItemId, detailItem, getClient]
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

  const handleAddComment = useCallback(async (text: string) => {
    if (!selectedWorkItemId) return;
    const client = getClient();
    if (!client) return;
    const newComment = await addWorkItemComment(client, selectedWorkItemId, text);
    setDetailComments((prev) => [...prev, newComment]);
  }, [selectedWorkItemId, getClient]);

  const handleCloseDetail = useCallback(() => {
    setSelectedWorkItemId(null);
    setDetailItem(null);
    setDetailComments([]);
    setStatusText(undefined);
  }, []);

  const handleOpenInBrowser = useCallback(async (url: string) => {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      // Fallback: window.open
      window.open(url, '_blank');
    }
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
    [getClient]
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

  // ---- Detail panel data ----

  const detailData: WorkItemDetailData | null = useMemo(() => {
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
      priority:
        Number(detailItem.fields['Microsoft.VSTS.Common.Priority']) || undefined,
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

  // ---- Render ----

  // Not configured state
  if (!adoSettings.organization || !adoSettings.personalAccessToken) {
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
          <p className="text-[13px] text-[var(--color-text-muted)]">
            Configure Azure DevOps in Settings to see work items
          </p>
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
        selectedAssignee={
          assignedToFilter === ''
            ? 'Anyone'
            : assignedToFilter
        }
        trackingFilter={trackingFilter}
        trackedCount={trackedWorkItemIds.size}
        workingOnCount={workingOnWorkItemIds.size}
        onStateChange={(state) =>
          useWorkItemsStore
            .getState()
            .setStateFilter(state === 'All' ? 'all' : state)
        }
        onAssigneeChange={(assignee) =>
          useWorkItemsStore
            .getState()
            .setAssignedToFilter(assignee === 'Anyone' ? '' : assignee)
        }
        onTrackingFilterChange={(filter) =>
          useWorkItemsStore.getState().setTrackingFilter(filter)
        }
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
