import { create } from 'zustand';
import type { WorkItem, AdoQuery } from '@/types';

interface WorkItemsState {
  queryTree: AdoQuery[];
  selectedQueryId: string | null;
  favoriteQueryIds: string[];
  workItems: WorkItem[];
  stateFilter: string;
  assignedToFilter: string;
  searchQuery: string;
  trackingFilter: 'all' | 'tracked' | 'workingOn';
  trackedWorkItemIds: Set<number>;
  workingOnWorkItemIds: Set<number>;
  workItemWorktreePaths: Record<number, string>;
  recentWorkItemIds: number[];
  currentUserDisplayName: string;
  isLoading: boolean;

  filteredWorkItems: () => WorkItem[];
  favoriteQueries: () => AdoQuery[];
  availableStates: () => string[];
  availableAssignees: () => string[];

  setQueryTree: (queries: AdoQuery[]) => void;
  selectQuery: (queryId: string | null) => void;
  toggleFavorite: (queryId: string) => void;
  setWorkItems: (items: WorkItem[]) => void;
  setStateFilter: (state: string) => void;
  setAssignedToFilter: (filter: string) => void;
  setSearchQuery: (query: string) => void;
  setTrackingFilter: (filter: 'all' | 'tracked' | 'workingOn') => void;
  toggleTracked: (workItemId: number) => void;
  toggleWorkingOn: (workItemId: number) => void;
  setWorktreePath: (workItemId: number, path: string) => void;
  applyWorktreeToAllWorkingOn: (path: string) => void;
  addRecentWorkItem: (id: number) => void;
  setRecentWorkItemIds: (ids: number[]) => void;
  setCurrentUserDisplayName: (name: string) => void;
  setIsLoading: (loading: boolean) => void;
}

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

export const useWorkItemsStore = create<WorkItemsState>()((set, get) => ({
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
  recentWorkItemIds: [],
  currentUserDisplayName: '',
  isLoading: false,

  filteredWorkItems: () => {
    const {
      workItems,
      stateFilter,
      assignedToFilter,
      searchQuery,
      trackingFilter,
      trackedWorkItemIds,
      workingOnWorkItemIds,
      currentUserDisplayName,
    } = get();

    let result = workItems;

    // State filter
    if (stateFilter !== 'all') {
      result = result.filter(
        (item) => getField(item, 'System.State') === stateFilter,
      );
    }

    // Assigned to filter
    if (assignedToFilter === '@Me') {
      result = result.filter(
        (item) =>
          getField(item, 'System.AssignedTo').toLowerCase() ===
          currentUserDisplayName.toLowerCase(),
      );
    } else if (assignedToFilter !== '') {
      result = result.filter(
        (item) =>
          getField(item, 'System.AssignedTo').toLowerCase() ===
          assignedToFilter.toLowerCase(),
      );
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => {
        const title = getField(item, 'System.Title').toLowerCase();
        const tags = getField(item, 'System.Tags').toLowerCase();
        const id = item.id.toString();
        return title.includes(q) || tags.includes(q) || id.includes(q);
      });
    }

    // Tracking filter
    if (trackingFilter === 'tracked') {
      result = result.filter((item) => trackedWorkItemIds.has(item.id));
    } else if (trackingFilter === 'workingOn') {
      result = result.filter((item) => workingOnWorkItemIds.has(item.id));
    }

    return result;
  },

  favoriteQueries: () => {
    const { queryTree, favoriteQueryIds } = get();
    const all = flattenQueries(queryTree);
    return all.filter((q) => favoriteQueryIds.includes(q.id));
  },

  availableStates: () => {
    const { workItems } = get();
    const states = new Set<string>();
    for (const item of workItems) {
      const state = getField(item, 'System.State');
      if (state) states.add(state);
    }
    return [...states].sort();
  },

  availableAssignees: () => {
    const { workItems } = get();
    const assignees = new Set<string>();
    for (const item of workItems) {
      const assignee = getField(item, 'System.AssignedTo');
      if (assignee) assignees.add(assignee);
    }
    return [...assignees].sort();
  },

  setQueryTree: (queries) => set({ queryTree: queries }),

  selectQuery: (queryId) => set({ selectedQueryId: queryId }),

  toggleFavorite: (queryId) =>
    set((state) => {
      const ids = state.favoriteQueryIds.includes(queryId)
        ? state.favoriteQueryIds.filter((id) => id !== queryId)
        : [...state.favoriteQueryIds, queryId];
      return { favoriteQueryIds: ids };
    }),

  setWorkItems: (items) => set({ workItems: items }),
  setStateFilter: (stateFilter) => set({ stateFilter }),
  setAssignedToFilter: (assignedToFilter) => set({ assignedToFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setTrackingFilter: (trackingFilter) => set({ trackingFilter }),

  toggleTracked: (workItemId) =>
    set((state) => {
      const next = new Set(state.trackedWorkItemIds);
      if (next.has(workItemId)) {
        next.delete(workItemId);
      } else {
        next.add(workItemId);
      }
      return { trackedWorkItemIds: next };
    }),

  toggleWorkingOn: (workItemId) =>
    set((state) => {
      const next = new Set(state.workingOnWorkItemIds);
      if (next.has(workItemId)) {
        next.delete(workItemId);
      } else {
        next.add(workItemId);
      }
      return { workingOnWorkItemIds: next };
    }),

  setWorktreePath: (workItemId, path) =>
    set((state) => ({
      workItemWorktreePaths: {
        ...state.workItemWorktreePaths,
        [workItemId]: path,
      },
    })),

  applyWorktreeToAllWorkingOn: (path) =>
    set((state) => {
      const updated = { ...state.workItemWorktreePaths };
      for (const id of state.workingOnWorkItemIds) {
        updated[id] = path;
      }
      return { workItemWorktreePaths: updated };
    }),

  addRecentWorkItem: (id) =>
    set((state) => {
      const filtered = state.recentWorkItemIds.filter((x) => x !== id);
      return { recentWorkItemIds: [id, ...filtered].slice(0, 20) };
    }),

  setRecentWorkItemIds: (ids) => set({ recentWorkItemIds: ids }),

  setCurrentUserDisplayName: (name) => set({ currentUserDisplayName: name }),
  setIsLoading: (loading) => set({ isLoading: loading }),
}));
