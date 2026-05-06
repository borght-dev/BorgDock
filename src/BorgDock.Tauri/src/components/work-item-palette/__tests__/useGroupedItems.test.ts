// src/components/work-item-palette/__tests__/useGroupedItems.test.ts
import { describe, expect, it } from 'vitest';
import { groupItems } from '../useGroupedItems';
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

const items: ResultItem[] = [
  { id: 1, title: 'a', state: 'Active', workItemType: 'Bug', assignedTo: 'KV' },
  { id: 2, title: 'b', state: 'New', workItemType: 'Bug', assignedTo: 'SS' },
  { id: 3, title: 'c', state: 'Active', workItemType: 'Task', assignedTo: 'KV' },
];

describe('groupItems', () => {
  it('returns one group when groupBy = none', () => {
    const groups = groupItems(items, 'none', 'KV');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(3);
  });

  it('groups by state', () => {
    const groups = groupItems(items, 'state', 'KV');
    expect(groups.map((g) => g.label).sort()).toEqual(['Active', 'New']);
  });

  it('puts current user first when groupBy = assignee', () => {
    const groups = groupItems(items, 'assignee', 'KV');
    expect(groups[0]?.label).toBe('KV');
  });

  it('groups by assignee alphabetically when no current user', () => {
    const groups = groupItems(items, 'assignee', '');
    expect(groups.map((g) => g.label)).toEqual(['KV', 'SS']);
  });

  it('groups by iter using ResultItem.iteration', () => {
    const itemsWithIter: ResultItem[] = [
      { id: 10, title: 'x', state: 'Active', workItemType: 'Bug', assignedTo: 'KV', iteration: 'R5.2' },
      { id: 11, title: 'y', state: 'New', workItemType: 'Task', assignedTo: 'SS', iteration: 'R5.3' },
      { id: 12, title: 'z', state: 'Active', workItemType: 'Bug', assignedTo: 'KV', iteration: 'R5.2' },
    ];
    const groups = groupItems(itemsWithIter, 'iter', '');
    expect(groups.map((g) => g.label).sort()).toEqual(['R5.2', 'R5.3']);
    const r52 = groups.find((g) => g.label === 'R5.2');
    expect(r52?.items).toHaveLength(2);
  });
});
