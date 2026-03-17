import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkItemsStore } from '../work-items-store';
import type { WorkItem, AdoQuery } from '@/types';

function makeWorkItem(overrides: {
  id?: number;
  title?: string;
  state?: string;
  assignedTo?: string;
  tags?: string;
}): WorkItem {
  return {
    id: overrides.id ?? 1,
    rev: 1,
    url: '',
    htmlUrl: '',
    relations: [],
    fields: {
      'System.Title': overrides.title ?? 'Test Item',
      'System.State': overrides.state ?? 'Active',
      'System.AssignedTo': overrides.assignedTo ?? 'John Doe',
      'System.Tags': overrides.tags ?? '',
    },
  };
}

function makeQuery(id: string, name: string, children: AdoQuery[] = []): AdoQuery {
  return {
    id,
    name,
    path: `/${name}`,
    isFolder: children.length > 0,
    hasChildren: children.length > 0,
    children,
  };
}

describe('work-items-store', () => {
  beforeEach(() => {
    useWorkItemsStore.setState({
      queryTree: [],
      selectedQueryId: null,
      favoriteQueryIds: [],
      workItems: [],
      stateFilter: 'all',
      assignedToFilter: '',
      searchQuery: '',
      trackingFilter: 'all',
      trackedWorkItemIds: new Set<number>(),
      workingOnWorkItemIds: new Set<number>(),
      workItemWorktreePaths: {},
      currentUserDisplayName: '',
      isLoading: false,
    });
  });

  describe('filtering', () => {
    const items = [
      makeWorkItem({ id: 1, title: 'Bug fix', state: 'Active', assignedTo: 'Alice' }),
      makeWorkItem({ id: 2, title: 'Feature', state: 'New', assignedTo: 'Bob' }),
      makeWorkItem({ id: 3, title: 'Refactor', state: 'Active', assignedTo: 'Alice' }),
      makeWorkItem({ id: 4, title: 'Docs update', state: 'Closed', assignedTo: 'Charlie', tags: 'docs' }),
    ];

    beforeEach(() => {
      useWorkItemsStore.getState().setWorkItems(items);
    });

    it('returns all items when no filters applied', () => {
      expect(useWorkItemsStore.getState().filteredWorkItems()).toHaveLength(4);
    });

    it('filters by state', () => {
      useWorkItemsStore.getState().setStateFilter('Active');
      const result = useWorkItemsStore.getState().filteredWorkItems();
      expect(result).toHaveLength(2);
      result.forEach((item) => {
        expect(item.fields['System.State']).toBe('Active');
      });
    });

    it('filters by assigned to (specific person)', () => {
      useWorkItemsStore.getState().setAssignedToFilter('Alice');
      const result = useWorkItemsStore.getState().filteredWorkItems();
      expect(result).toHaveLength(2);
      result.forEach((item) => {
        expect(item.fields['System.AssignedTo']).toBe('Alice');
      });
    });

    it('filters by @Me', () => {
      useWorkItemsStore.getState().setCurrentUserDisplayName('Bob');
      useWorkItemsStore.getState().setAssignedToFilter('@Me');
      const result = useWorkItemsStore.getState().filteredWorkItems();
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(2);
    });

    it('combines state and assigned to filters', () => {
      useWorkItemsStore.getState().setStateFilter('Active');
      useWorkItemsStore.getState().setAssignedToFilter('Alice');
      const result = useWorkItemsStore.getState().filteredWorkItems();
      expect(result).toHaveLength(2);
    });

    it('searches by title', () => {
      useWorkItemsStore.getState().setSearchQuery('bug');
      const result = useWorkItemsStore.getState().filteredWorkItems();
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(1);
    });

    it('searches by tags', () => {
      useWorkItemsStore.getState().setSearchQuery('docs');
      const result = useWorkItemsStore.getState().filteredWorkItems();
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(4);
    });

    it('searches by id', () => {
      useWorkItemsStore.getState().setSearchQuery('3');
      const result = useWorkItemsStore.getState().filteredWorkItems();
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(3);
    });
  });

  describe('tracking', () => {
    const items = [
      makeWorkItem({ id: 1 }),
      makeWorkItem({ id: 2 }),
      makeWorkItem({ id: 3 }),
    ];

    beforeEach(() => {
      useWorkItemsStore.getState().setWorkItems(items);
    });

    it('toggles tracked status', () => {
      useWorkItemsStore.getState().toggleTracked(1);
      expect(useWorkItemsStore.getState().trackedWorkItemIds.has(1)).toBe(true);
      useWorkItemsStore.getState().toggleTracked(1);
      expect(useWorkItemsStore.getState().trackedWorkItemIds.has(1)).toBe(false);
    });

    it('toggles working on status', () => {
      useWorkItemsStore.getState().toggleWorkingOn(2);
      expect(useWorkItemsStore.getState().workingOnWorkItemIds.has(2)).toBe(true);
      useWorkItemsStore.getState().toggleWorkingOn(2);
      expect(useWorkItemsStore.getState().workingOnWorkItemIds.has(2)).toBe(false);
    });

    it('filters by tracked items', () => {
      useWorkItemsStore.getState().toggleTracked(1);
      useWorkItemsStore.getState().toggleTracked(3);
      useWorkItemsStore.getState().setTrackingFilter('tracked');
      const result = useWorkItemsStore.getState().filteredWorkItems();
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual([1, 3]);
    });

    it('filters by working on items', () => {
      useWorkItemsStore.getState().toggleWorkingOn(2);
      useWorkItemsStore.getState().setTrackingFilter('workingOn');
      const result = useWorkItemsStore.getState().filteredWorkItems();
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(2);
    });
  });

  describe('favorites', () => {
    it('toggles favorite query', () => {
      useWorkItemsStore.getState().toggleFavorite('q1');
      expect(useWorkItemsStore.getState().favoriteQueryIds).toContain('q1');
      useWorkItemsStore.getState().toggleFavorite('q1');
      expect(useWorkItemsStore.getState().favoriteQueryIds).not.toContain('q1');
    });

    it('returns favorite queries from tree', () => {
      const tree = [
        makeQuery('q1', 'My Bugs'),
        makeQuery('folder', 'Folder', [
          makeQuery('q2', 'Team Tasks'),
          makeQuery('q3', 'Backlog'),
        ]),
      ];
      useWorkItemsStore.getState().setQueryTree(tree);
      useWorkItemsStore.getState().toggleFavorite('q1');
      useWorkItemsStore.getState().toggleFavorite('q3');
      const favs = useWorkItemsStore.getState().favoriteQueries();
      expect(favs).toHaveLength(2);
      expect(favs.map((q) => q.name)).toEqual(['My Bugs', 'Backlog']);
    });
  });

  describe('worktree paths', () => {
    it('sets worktree path for work item', () => {
      useWorkItemsStore.getState().setWorktreePath(42, '/path/to/worktree');
      expect(useWorkItemsStore.getState().workItemWorktreePaths[42]).toBe(
        '/path/to/worktree',
      );
    });
  });

  describe('available states and assignees', () => {
    it('returns unique states from work items', () => {
      useWorkItemsStore.getState().setWorkItems([
        makeWorkItem({ id: 1, state: 'Active' }),
        makeWorkItem({ id: 2, state: 'New' }),
        makeWorkItem({ id: 3, state: 'Active' }),
      ]);
      const states = useWorkItemsStore.getState().availableStates();
      expect(states).toEqual(['Active', 'New']);
    });

    it('returns unique assignees from work items', () => {
      useWorkItemsStore.getState().setWorkItems([
        makeWorkItem({ id: 1, assignedTo: 'Bob' }),
        makeWorkItem({ id: 2, assignedTo: 'Alice' }),
        makeWorkItem({ id: 3, assignedTo: 'Bob' }),
      ]);
      const assignees = useWorkItemsStore.getState().availableAssignees();
      expect(assignees).toEqual(['Alice', 'Bob']);
    });
  });
});
