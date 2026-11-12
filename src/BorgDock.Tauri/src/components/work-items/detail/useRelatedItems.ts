import { useEffect, useRef, useState } from 'react';
import type { AdoClient } from '@/services/ado/client';
import { getWorkItems } from '@/services/ado/workitems';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { WorkItem } from '@/types';
import { getField } from '@/utils/work-item-helpers';

export interface RelatedItem {
  id: number;
  title: string;
  state: string;
  type: string;
}

/** Titles read this session, so the rail and the peek don't read them twice. */
const cache = new Map<number, RelatedItem>();

function toRelated(item: WorkItem): RelatedItem {
  return {
    id: item.id,
    title: getField(item, 'System.Title'),
    state: getField(item, 'System.State'),
    type: getField(item, 'System.WorkItemType'),
  };
}

/** The title, state and type of linked work items: from the list, the cache, else one batched read. */
export function useRelatedItems(
  ids: readonly number[],
  getClient: () => AdoClient | null,
): Map<number, RelatedItem> {
  const listed = useWorkItemsStore((s) => s.workItems);
  const key = ids.join(',');
  const [items, setItems] = useState<Map<number, RelatedItem>>(() => new Map());
  // The latest client getter, without re-reading when only its identity changes.
  const clientRef = useRef(getClient);
  clientRef.current = getClient;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `ids`
  useEffect(() => {
    let cancelled = false;
    const found = new Map<number, RelatedItem>();
    const missing: number[] = [];
    for (const id of ids) {
      const inList = listed.find((w) => w.id === id);
      const known = inList ? toRelated(inList) : cache.get(id);
      if (known) found.set(id, known);
      else missing.push(id);
    }
    setItems(found);
    const client = missing.length > 0 ? clientRef.current() : null;
    if (client) {
      getWorkItems(client, missing)
        .then((loaded) => {
          if (cancelled) return;
          const next = new Map(found);
          for (const item of loaded) {
            const related = toRelated(item);
            cache.set(item.id, related);
            next.set(item.id, related);
          }
          setItems(next);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [key, listed]);

  return items;
}
