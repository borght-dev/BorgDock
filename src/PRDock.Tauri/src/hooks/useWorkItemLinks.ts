import { useCallback, useEffect, useState } from 'react';
import { AdoClient } from '@/services/ado/client';
import { getWorkItems } from '@/services/ado/workitems';
import { detectWorkItemIds } from '@/services/work-item-linker';
import { useLinkStore } from '@/stores/link-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequest, WorkItem } from '@/types';

interface UseWorkItemLinksResult {
  workItemIds: number[];
  workItems: WorkItem[];
  isLoading: boolean;
}

export function useWorkItemLinks(pr: PullRequest | null): UseWorkItemLinksResult {
  const [isLoading, setIsLoading] = useState(false);
  const ids = pr ? detectWorkItemIds(pr) : [];
  const settings = useSettingsStore((s) => s.settings);
  const { getWorkItem, setWorkItem, isFresh } = useLinkStore();

  const fetchMissing = useCallback(async () => {
    if (ids.length === 0) return;

    const ado = settings.azureDevOps;
    if (!ado.organization || !ado.project || !ado.personalAccessToken) return;

    const missingIds = ids.filter((id) => !isFresh(id));
    if (missingIds.length === 0) return;

    setIsLoading(true);
    try {
      const client = new AdoClient(ado.organization, ado.project, ado.personalAccessToken);
      const items = await getWorkItems(client, missingIds);
      for (const item of items) {
        setWorkItem(item.id, item);
      }
    } catch {
      // Silently fail — IDs will be shown as plain text
    } finally {
      setIsLoading(false);
    }
  }, [ids.join(','), settings.azureDevOps, isFresh, setWorkItem]);

  useEffect(() => {
    fetchMissing();
  }, [fetchMissing]);

  const workItems = ids
    .map((id) => getWorkItem(id))
    .filter((item): item is WorkItem => item !== undefined);

  return { workItemIds: ids, workItems, isLoading };
}
