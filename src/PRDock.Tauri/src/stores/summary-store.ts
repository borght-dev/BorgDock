import { create } from 'zustand';

interface SummaryCacheEntry {
  text: string;
  generatedAt: number;
  prUpdatedAt: string;
}

interface SummaryStoreState {
  cache: Map<string, SummaryCacheEntry>;
  loading: Set<string>;

  getSummary: (key: string, prUpdatedAt: string) => string | undefined;
  isLoading: (key: string) => boolean;
  setLoading: (key: string, loading: boolean) => void;
  setSummary: (key: string, text: string, prUpdatedAt: string) => void;
  invalidate: (key: string) => void;
}

function cacheKey(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`;
}

export { cacheKey as summaryKey };

export const useSummaryStore = create<SummaryStoreState>()((set, get) => ({
  cache: new Map(),
  loading: new Set(),

  getSummary: (key, prUpdatedAt) => {
    const entry = get().cache.get(key);
    if (!entry) return undefined;
    // Stale if PR was updated after summary was generated
    if (entry.prUpdatedAt !== prUpdatedAt) return undefined;
    return entry.text;
  },

  isLoading: (key) => get().loading.has(key),

  setLoading: (key, loading) => {
    set((state) => {
      const next = new Set(state.loading);
      if (loading) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return { loading: next };
    });
  },

  setSummary: (key, text, prUpdatedAt) => {
    set((state) => {
      const next = new Map(state.cache);
      next.set(key, { text, generatedAt: Date.now(), prUpdatedAt });
      const loading = new Set(state.loading);
      loading.delete(key);
      return { cache: next, loading };
    });
  },

  invalidate: (key) => {
    set((state) => {
      const next = new Map(state.cache);
      next.delete(key);
      return { cache: next };
    });
  },
}));
