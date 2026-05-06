// src/components/work-item-palette/useGroupedItems.ts
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

export type GroupBy = 'none' | 'state' | 'assignee' | 'iter';

export interface ItemGroup {
  key: string;
  label: string | null;
  items: ResultItem[];
}

export function groupItems(
  items: ResultItem[],
  groupBy: GroupBy,
  currentUser: string,
): ItemGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: null, items }];
  }
  const map = new Map<string, ResultItem[]>();
  for (const item of items) {
    let key: string;
    if (groupBy === 'state') key = item.state || 'No state';
    else if (groupBy === 'assignee') key = item.assignedTo || 'Unassigned';
    else key = 'No iteration';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const entries = [...map.entries()];
  entries.sort((a, b) => {
    if (groupBy === 'assignee' && currentUser) {
      if (a[0] === currentUser) return -1;
      if (b[0] === currentUser) return 1;
    }
    if (a[0] === 'Unassigned') return 1;
    if (b[0] === 'Unassigned') return -1;
    return a[0].localeCompare(b[0]);
  });
  return entries.map(([key, bucketItems]) => ({ key, label: key, items: bucketItems }));
}
