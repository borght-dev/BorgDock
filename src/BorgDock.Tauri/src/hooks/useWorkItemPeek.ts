import { useEffect, useState } from 'react';
import { AdoClient } from '@/services/ado/client';
import { getWorkItems } from '@/services/ado/workitems';
import { useLinkStore } from '@/stores/link-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { WorkItem } from '@/types';
import type { AzureDevOpsSettings } from '@/types/settings';

export type WorkItemPeekState =
  | { status: 'ready'; item: WorkItem }
  | { status: 'loading' }
  | { status: 'unconfigured' }
  | { status: 'missing' }
  | { status: 'error' };

function adoConfigured(ado: AzureDevOpsSettings): boolean {
  const authOk = ado.authMethod === 'azCli' || !!ado.personalAccessToken;
  return !!ado.organization && !!ado.project && authOk;
}

/** One request per id at a time, however many cards ask for it. */
const inflight = new Map<number, Promise<WorkItem | null>>();

function fetchWorkItem(id: number, ado: AzureDevOpsSettings): Promise<WorkItem | null> {
  const running = inflight.get(id);
  if (running) return running;
  const client = new AdoClient(
    ado.organization,
    ado.project,
    ado.personalAccessToken ?? '',
    ado.authMethod,
  );
  const request = getWorkItems(client, [id])
    .then((items) => {
      const item = items.find((candidate) => candidate.id === id) ?? null;
      if (item) useLinkStore.getState().setWorkItem(id, item);
      return item;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, request);
  return request;
}

/**
 * A work item for its hover card: from the link cache when fresh, else read
 * once from Azure DevOps (`initial` shows meanwhile). The read starts when the
 * card mounts, so only references someone hovers cost a request.
 */
export function useWorkItemPeek(id: number, initial?: WorkItem): WorkItemPeekState {
  const ado = useSettingsStore((s) => s.settings.azureDevOps);
  const cached = useLinkStore((s) => s.cache.get(id)?.workItem);
  const configured = adoConfigured(ado);
  const [failure, setFailure] = useState<'missing' | 'error' | null>(null);

  useEffect(() => {
    if (!configured || useLinkStore.getState().isFresh(id)) return;
    let cancelled = false;
    setFailure(null);
    fetchWorkItem(id, ado)
      .then((item) => {
        if (!cancelled && !item) setFailure('missing');
      })
      .catch(() => {
        if (!cancelled) setFailure('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, ado, configured]);

  const item = cached ?? initial;
  if (item) return { status: 'ready', item };
  if (!configured) return { status: 'unconfigured' };
  if (failure) return { status: failure };
  return { status: 'loading' };
}
