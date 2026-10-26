import { create } from 'zustand';
import type { LookupResult } from '@/services/github/pr-lookup';
import type { Assessment } from '@/services/workstreams/attention';
import type { CachedMeta } from '@/services/workstreams/resolve';
import type { MemberSuggestion } from '@/services/workstreams/suggest';
import type { RefKey } from '@/services/workstreams/types';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';

/** Last seen metadata per reference, on this device only: it never goes into a workstream file. */
const CACHE_FILE = 'workstreams-cache.json';
const CACHE_KEY = 'meta';

interface WorkstreamSourcesState {
  /** Pull requests read by number, by `owner/repo#number`. */
  lookedUp: Map<string, LookupResult>;
  cache: Record<RefKey, CachedMeta>;
  /** Built by `recomputeWorkstreams` whenever an input changes. */
  assessments: Record<string, Assessment>;
  suggestions: Record<string, MemberSuggestion[]>;

  mergeLookups: (results: ReadonlyMap<string, LookupResult>) => void;
  clearLookups: () => void;
  rememberMeta: (entries: Record<RefKey, CachedMeta>) => void;
  setAssessments: (
    assessments: Record<string, Assessment>,
    suggestions: Record<string, MemberSuggestion[]>,
  ) => void;
  restoreCache: () => Promise<void>;
}

let cacheTimer: ReturnType<typeof setTimeout> | undefined;

export const useWorkstreamSourcesStore = create<WorkstreamSourcesState>()((set, get) => ({
  lookedUp: new Map(),
  cache: {},
  assessments: {},
  suggestions: {},

  mergeLookups: (results) => {
    if (results.size === 0) return;
    set((state) => ({ lookedUp: new Map([...state.lookedUp, ...results]) }));
  },

  clearLookups: () => set({ lookedUp: new Map() }),

  rememberMeta: (entries) => {
    const cache = get().cache;
    const changed = Object.entries(entries).filter(([key, meta]) => {
      const known = cache[key];
      return !known || known.title !== meta.title || known.stateLabel !== meta.stateLabel;
    });
    if (changed.length === 0) return;
    const next = { ...cache, ...Object.fromEntries(changed) };
    set({ cache: next });
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      persistToTauriStore(CACHE_FILE, CACHE_KEY, get().cache).catch(() => {});
    }, 2_000);
  },

  setAssessments: (assessments, suggestions) => set({ assessments, suggestions }),

  restoreCache: async () => {
    const stored = await readFromTauriStore<Record<RefKey, CachedMeta>>(
      CACHE_FILE,
      CACHE_KEY,
    ).catch(() => undefined);
    if (stored) set((state) => ({ cache: { ...stored, ...state.cache } }));
  },
}));
