import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, Card, HoverPopover } from '@/components/shared/primitives';
import type { AdoQueryTreeNode } from '@/components/work-items/QueryBrowser';
import { QueryBrowser } from '@/components/work-items/QueryBrowser';
import { QueriesRail, type QueryRowData } from '@/components/work-items/QueriesRail';
import { WorkItemDetailPanel } from '@/components/work-items/WorkItemDetailPanel';
import { parseLinkedPRs } from '@/components/work-items/WorkItemDetailPanel/parseLinkedPRs';
import { useAdjacentNav } from '@/components/work-items/WorkItemDetailPanel/useAdjacentNav';
import { WorkItemFilterPopover } from '@/components/work-items/WorkItemFilterPopover';
import { WorkItemRow } from '@/components/work-items/WorkItemRow';
import { useWorkItemHandlers } from '@/hooks/useWorkItemHandlers';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { classifyFields, extractAttachments } from '@/utils/work-item-fields';
import { flattenQueries, getField } from '@/utils/work-item-helpers';

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
  const isLoading = useWorkItemsStore((s) => s.isLoading);
  const fieldDefinitions = useWorkItemsStore((s) => s.fieldDefinitions);
  const workItemTypeLayouts = useWorkItemsStore((s) => s.workItemTypeLayouts);

  // UI store — persisted selection
  const persistedSelectedId = useUiStore((s) => s.workItemsSelectedId);
  const setPersistedSelectedId = useUiStore((s) => s.setWorkItemsSelectedId);

  // Event handlers hook (owns the detail load lifecycle)
  const {
    queryBrowserOpen,
    setQueryBrowserOpen,
    selectedWorkItemId,
    isDetailLoading,
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
  } = useWorkItemHandlers({
    organization: adoSettings.organization,
    project: adoSettings.project,
    personalAccessToken: adoSettings.personalAccessToken,
    authMethod: adoSettings.authMethod,
  });

  // Restore persisted selection on mount: if ui-store has a selected id and
  // the hook hasn't loaded one yet, kick off the load.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only restore — adding deps would re-trigger on every selection change
  useEffect(() => {
    if (persistedSelectedId !== null && selectedWorkItemId === null) {
      void handleSelectWorkItem(persistedSelectedId);
    }
  }, []);

  // Mirror hook → ui-store so the selection survives tab switches and reloads.
  useEffect(() => {
    if (selectedWorkItemId !== persistedSelectedId) {
      setPersistedSelectedId(selectedWorkItemId);
    }
  }, [selectedWorkItemId, persistedSelectedId, setPersistedSelectedId]);

  // Resolve the selected query name for display
  const selectedQueryName = useMemo(() => {
    if (!selectedQueryId) return undefined;
    const all = flattenQueries(queryTree);
    const match = all.find((q) => q.id === selectedQueryId);
    return match?.name;
  }, [selectedQueryId, queryTree]);

  // Map filtered items to row data
  const items = filteredWorkItems();

  // Persist navlist so the detail panel can do prev/next navigation
  useEffect(() => {
    if (!items || items.length === 0) return;
    try {
      localStorage.setItem(
        'borgdock-palette-navlist',
        JSON.stringify({ ids: items.map((wi) => wi.id), savedAt: Date.now() }),
      );
    } catch {
      /* ignore */
    }
  }, [items]);

  // Adjacent nav for the in-app side panel
  const adjacent = useAdjacentNav(selectedWorkItemId);
  const handleArrowNav = useCallback(
    (dir: 'prev' | 'next') => {
      const target = dir === 'prev' ? adjacent.prevId : adjacent.nextId;
      if (target == null) return;
      void handleSelectWorkItem(target);
    },
    [adjacent.prevId, adjacent.nextId, handleSelectWorkItem],
  );

  // Local list-search (sits above store filters; quick text triage only)
  const [listSearch, setListSearch] = useState('');

  // Filter rows by local search (title or AB#id substring)
  const visibleItems = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const title = getField(it, 'System.Title').toLowerCase();
      const idStr = String(it.id);
      return title.includes(q) || idStr.includes(q);
    });
  }, [items, listSearch]);

  // Build row data (lightweight — no card details)
  const rowItems = useMemo(
    () =>
      visibleItems.map((it) => ({
        id: it.id,
        type: getField(it, 'System.WorkItemType') || 'Task',
        title: getField(it, 'System.Title'),
        state: getField(it, 'System.State'),
        priority: Number(it.fields['Microsoft.VSTS.Common.Priority']) || undefined,
        isTracked: trackedWorkItemIds.has(it.id),
        isWorking: workingOnWorkItemIds.has(it.id),
      })),
    [visibleItems, trackedWorkItemIds, workingOnWorkItemIds],
  );

  // Query browser tree nodes
  const queryTreeNodes: AdoQueryTreeNode[] = useMemo(() => {
    function map(qs: typeof queryTree): AdoQueryTreeNode[] {
      return qs.map((q) => ({
        ...q,
        isFavorite: favoriteQueryIds.includes(q.id),
        isExpanded: false,
        children: map(q.children),
      }));
    }
    return map(queryTree);
  }, [queryTree, favoriteQueryIds]);

  const favoriteQueriesForBrowser: AdoQueryTreeNode[] = useMemo(() => {
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

  // Rail-friendly query lists
  const favoriteQueriesForRail: QueryRowData[] = useMemo(() => {
    const all = flattenQueries(queryTree);
    return all
      .filter((q) => !q.isFolder && favoriteQueryIds.includes(q.id))
      .map((q) => ({ id: q.id, name: q.name }));
  }, [queryTree, favoriteQueryIds]);

  const myQueriesForRail: QueryRowData[] = useMemo(() => {
    const all = flattenQueries(queryTree);
    const favSet = new Set(favoriteQueryIds);
    return all
      .filter((q) => !q.isFolder && !favSet.has(q.id))
      .slice(0, 50)
      .map((q) => ({ id: q.id, name: q.name }));
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
      severity:
        typeof detailItem.fields['Microsoft.VSTS.Common.Severity'] === 'string'
          ? detailItem.fields['Microsoft.VSTS.Common.Severity']
          : undefined,
      reporter: getField(detailItem, 'System.CreatedBy'),
      iteration: (() => {
        const p = String(detailItem.fields['System.IterationPath'] ?? '');
        return p ? (p.split(/[\\/]/).pop() ?? p) : undefined;
      })(),
      area: (() => {
        const p = String(detailItem.fields['System.AreaPath'] ?? '');
        return p ? (p.split(/[\\/]/).pop() ?? p) : undefined;
      })(),
      backlogPriority:
        (detailItem.fields['Microsoft.VSTS.Common.BacklogPriority'] as
          | number
          | string
          | undefined) ?? undefined,
      foundIn:
        typeof detailItem.fields['Microsoft.VSTS.Build.FoundIn'] === 'string'
          ? detailItem.fields['Microsoft.VSTS.Build.FoundIn']
          : undefined,
      changedAgo: (() => {
        const cd = detailItem.fields['System.ChangedDate'];
        if (typeof cd !== 'string') return undefined;
        const seconds = Math.floor((Date.now() - new Date(cd).getTime()) / 1000);
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
        return `${Math.floor(seconds / 86_400)}d`;
      })(),
      linkedPRs: parseLinkedPRs(detailItem.relations),
    };
  }, [detailItem, adoSettings.organization, adoSettings.project]);

  const { richText, standard, custom } = useMemo(() => {
    if (!detailItem) return { richText: [], standard: [], custom: [] };
    return classifyFields(detailItem, fieldDefinitions);
  }, [detailItem, fieldDefinitions]);

  const detailLayout = useMemo(() => {
    if (!detailItem) return null;
    const witType = getField(detailItem, 'System.WorkItemType');
    return witType ? (workItemTypeLayouts.get(witType) ?? null) : null;
  }, [detailItem, workItemTypeLayouts]);

  const attachments = useMemo(() => {
    if (!detailItem) return [];
    return extractAttachments(detailItem);
  }, [detailItem]);

  // Track-toggle: also persist to settings (matches old behavior)
  const handleToggleTracked = useCallback((id: number) => {
    useWorkItemsStore.getState().toggleTracked(id);
    const ids = [...useWorkItemsStore.getState().trackedWorkItemIds];
    const current = useSettingsStore.getState().settings;
    useSettingsStore.getState().saveSettings({
      ...current,
      azureDevOps: { ...current.azureDevOps, trackedWorkItemIds: ids },
    });
  }, []);

  const handleToggleWorking = useCallback((id: number) => {
    useWorkItemsStore.getState().toggleWorkingOn(id);
    const ids = [...useWorkItemsStore.getState().workingOnWorkItemIds];
    const current = useSettingsStore.getState().settings;
    useSettingsStore.getState().saveSettings({
      ...current,
      azureDevOps: { ...current.azureDevOps, workingOnWorkItemIds: ids },
    });
  }, []);

  // Not configured state — spans all 3 panes (rendered above the grid).
  const hasCredentials =
    adoSettings.authMethod === 'azCli' || !!adoSettings.personalAccessToken;
  if (!adoSettings.organization || !hasCredentials) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <Card padding="lg" className="text-center">
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
            Configure Azure DevOps in Settings to see work items
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void invoke('open_settings_window', { section: 'ado' }).catch(console.error)}
          >
            Open Settings
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="bd-workitems">
      {queryBrowserOpen && (
        <div
          className="bd-modal-backdrop"
          onClick={() => setQueryBrowserOpen(false)}
          role="presentation"
        >
          <div
            className="bd-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <QueryBrowser
              queryTree={queryTreeNodes}
              favoriteQueries={favoriteQueriesForBrowser}
              isLoading={isLoading}
              selectedQueryId={selectedQueryId ?? undefined}
              onSelectQuery={handleSelectQuery}
              onToggleFavorite={handleToggleFavorite}
              onClose={() => setQueryBrowserOpen(false)}
            />
          </div>
        </div>
      )}

      <QueriesRail
        favorites={favoriteQueriesForRail}
        myQueries={myQueriesForRail}
        selectedId={selectedQueryId ?? undefined}
        onSelectQuery={handleSelectQuery}
        onOpenQueryBrowser={() => setQueryBrowserOpen(true)}
      />

      <div className="bd-workitems__items">
        <div className="bd-workitems__items-toolbar">
          <div className="bd-input bd-workitems__search">
            <input
              type="text"
              placeholder={`Filter ${items.length} items…`}
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              aria-label="Filter items"
            />
          </div>
          <HoverPopover
            maxWidth={260}
            maxHeight={320}
            content={
              <WorkItemFilterPopover
                states={availableStates()}
                assignees={availableAssignees()}
                selectedState={stateFilter === 'all' ? 'All' : stateFilter}
                selectedAssignee={assignedToFilter === '' ? 'Anyone' : assignedToFilter}
                trackingFilter={trackingFilter}
                onStateChange={(s) =>
                  useWorkItemsStore.getState().setStateFilter(s === 'All' ? 'all' : s)
                }
                onAssigneeChange={(a) =>
                  useWorkItemsStore.getState().setAssignedToFilter(a === 'Anyone' ? '' : a)
                }
                onTrackingChange={(t) => useWorkItemsStore.getState().setTrackingFilter(t)}
              />
            }
          >
            <button type="button" className="bd-icon-btn" aria-label="Filter">
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <path d="M2 4h12M4 8h8M6 12h4" />
              </svg>
            </button>
          </HoverPopover>
        </div>
        <div className="bd-workitems__items-list">
          {isLoading && rowItems.length === 0 && (
            <div className="bd-empty">Loading work items…</div>
          )}
          {!isLoading &&
            rowItems.map((it) => (
              <WorkItemRow
                key={it.id}
                item={it}
                selected={selectedWorkItemId === it.id}
                onClick={() => void handleSelectWorkItem(it.id)}
                onToggleTracked={() => handleToggleTracked(it.id)}
                onToggleWorking={() => handleToggleWorking(it.id)}
              />
            ))}
          {!isLoading && rowItems.length === 0 && selectedQueryId && (
            <div className="bd-empty">
              No items in {selectedQueryName ?? 'this query'}
            </div>
          )}
          {!isLoading && !selectedQueryId && (
            <div className="bd-empty">Pick a query from the rail</div>
          )}
        </div>
      </div>

      <div className="bd-workitems__detail">
        {selectedWorkItemId !== null && detailData ? (
          <WorkItemDetailPanel
            item={detailData}
            isLoading={isDetailLoading}
            statusText={statusText}
            availableStates={detailStates}
            richTextFields={richText}
            standardFields={standard}
            customFields={custom}
            extraTabs={detailLayout?.extraTabs}
            detailsFieldKeys={detailLayout?.detailsFieldKeys}
            attachments={attachments}
            comments={detailComments}
            isLoadingComments={isLoadingComments}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={handleCloseDetail}
            onOpenInBrowser={handleOpenInBrowser}
            onDownloadAttachment={handleDownloadAttachment}
            onAddComment={handleAddComment}
            adjacent={adjacent}
            onArrowNav={handleArrowNav}
          />
        ) : (
          <div className="bd-empty">Select a work item</div>
        )}
      </div>
    </div>
  );
}
