import { create } from 'zustand';
import type { WorkItem } from '@/types';

interface LinkCacheEntry {
  workItem: WorkItem;
  fetchedAt: number;
}

interface LinkStoreState {
  cache: Map<number, LinkCacheEntry>;
  setWorkItem: (id: number, workItem: WorkItem) => void;
  getWorkItem: (id: number) => WorkItem | undefined;
  isFresh: (id: number, maxAgeMs?: number) => boolean;
}

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export const useLinkStore = create<LinkStoreState>()((set, get) => ({
  cache: new Map(),

  setWorkItem: (id, workItem) => {
    set((state) => {
      const next = new Map(state.cache);
      next.set(id, { workItem, fetchedAt: Date.now() });
      return { cache: next };
    });
  },

  getWorkItem: (id) => {
    return get().cache.get(id)?.workItem;
  },

  isFresh: (id, maxAgeMs = DEFAULT_MAX_AGE_MS) => {
    const entry = get().cache.get(id);
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < maxAgeMs;
  },
}));
