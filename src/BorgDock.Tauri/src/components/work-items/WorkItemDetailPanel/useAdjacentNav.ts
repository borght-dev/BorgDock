// src/components/work-items/WorkItemDetailPanel/useAdjacentNav.ts
import { useMemo } from 'react';

const NAVLIST_KEY = 'borgdock-palette-navlist';
const STALE_MS = 60 * 60 * 1000; // 1h

export interface AdjacentNav {
  prevId: number | null;
  nextId: number | null;
  total: number;
  index: number;
}

export function useAdjacentNav(currentId: number | null): AdjacentNav {
  return useMemo(() => {
    if (currentId == null) return { prevId: null, nextId: null, total: 0, index: -1 };
    try {
      const raw = localStorage.getItem(NAVLIST_KEY);
      if (!raw) return { prevId: null, nextId: null, total: 0, index: -1 };
      const parsed = JSON.parse(raw) as { ids: number[]; savedAt: number };
      if (Date.now() - parsed.savedAt > STALE_MS) {
        return { prevId: null, nextId: null, total: 0, index: -1 };
      }
      const idx = parsed.ids.indexOf(currentId);
      if (idx === -1) return { prevId: null, nextId: null, total: parsed.ids.length, index: -1 };
      return {
        prevId: idx > 0 ? parsed.ids[idx - 1]! : null,
        nextId: idx < parsed.ids.length - 1 ? parsed.ids[idx + 1]! : null,
        total: parsed.ids.length,
        index: idx,
      };
    } catch {
      return { prevId: null, nextId: null, total: 0, index: -1 };
    }
  }, [currentId]);
}
