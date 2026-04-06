import type { AdoQueryTreeNode } from '@/components/work-items/QueryBrowser';
import type { WorkItemCardData } from '@/components/work-items/WorkItemCard';
import type { AdoQuery, WorkItem } from '@/types';

// ---- Helpers ----

export function getField(item: WorkItem, field: string): string {
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

export function formatAge(dateStr: string): string {
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

export interface WorkItemsStoreSnapshot {
  trackedWorkItemIds: Set<number>;
  workingOnWorkItemIds: Set<number>;
  workItemWorktreePaths: Record<number, string>;
}

export function mapToCardData(
  item: WorkItem,
  store: WorkItemsStoreSnapshot,
  selectedId: number | null,
  organization: string,
  project: string,
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

// ---- Query tree node mapping ----

export function mapQueryTreeNodes(queries: AdoQuery[], favoriteIds: string[]): AdoQueryTreeNode[] {
  return queries.map((q) => ({
    ...q,
    isFavorite: favoriteIds.includes(q.id),
    isExpanded: false,
    children: mapQueryTreeNodes(q.children, favoriteIds),
  }));
}

export function flattenQueries(queries: AdoQuery[]): AdoQuery[] {
  const result: AdoQuery[] = [];
  for (const q of queries) {
    result.push(q);
    if (q.children.length > 0) {
      result.push(...flattenQueries(q.children));
    }
  }
  return result;
}
