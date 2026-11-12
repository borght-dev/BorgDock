import { useEffect, useState } from 'react';
import type { AdoClient } from '@/services/ado/client';
import { getWorkItemUpdates } from '@/services/ado/workitems';
import { createLogger } from '@/services/logger';
import type { WorkItemUpdate } from '@/types';

const log = createLogger('useWorkItemUpdates');

export interface WorkItemUpdatesState {
  updates: WorkItemUpdate[];
  isLoading: boolean;
  /** The history could not be read; comments still show. */
  failed: boolean;
}

const EMPTY: WorkItemUpdate[] = [];

/** The item's revisions for the Activity tab, read again when the item changes. */
export function useWorkItemUpdates(
  itemId: number,
  getClient: () => AdoClient | null,
): WorkItemUpdatesState {
  const [state, setState] = useState<WorkItemUpdatesState>({
    updates: EMPTY,
    isLoading: true,
    failed: false,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: getClient reads the current settings; only another item reloads
  useEffect(() => {
    const client = getClient();
    if (!client) {
      setState({ updates: EMPTY, isLoading: false, failed: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true, failed: false }));
    getWorkItemUpdates(client, itemId)
      .then((updates) => {
        if (!cancelled) setState({ updates, isLoading: false, failed: false });
      })
      .catch((err) => {
        if (cancelled) return;
        log.debug('work item history unavailable', { id: itemId, error: String(err) });
        setState({ updates: EMPTY, isLoading: false, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  return state;
}
