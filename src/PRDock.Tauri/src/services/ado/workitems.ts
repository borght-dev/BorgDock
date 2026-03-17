import type { WorkItem, JsonPatchOperation } from '@/types';
import type { AdoClient } from './client';

interface AdoWorkItemListResponse {
  value: WorkItem[];
}

export async function getWorkItems(
  client: AdoClient,
  ids: number[]
): Promise<WorkItem[]> {
  if (ids.length === 0) return [];

  const results: WorkItem[] = [];

  // Batch in groups of 200 (ADO limit)
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const idList = batch.join(',');
    const response = await client.get<AdoWorkItemListResponse>(
      `wit/workitems?ids=${idList}&$expand=relations`
    );

    if (response.value) {
      results.push(...response.value);
    }
  }

  return results;
}

export async function getWorkItem(
  client: AdoClient,
  id: number
): Promise<WorkItem> {
  return client.get<WorkItem>(`wit/workitems/${id}?$expand=relations`);
}

export async function createWorkItem(
  client: AdoClient,
  type: string,
  fields: JsonPatchOperation[]
): Promise<WorkItem> {
  const encodedType = encodeURIComponent(type);
  return client.patch<WorkItem>(
    `wit/workitems/$${encodedType}`,
    fields,
    'application/json-patch+json'
  );
}

export async function updateWorkItem(
  client: AdoClient,
  id: number,
  operations: JsonPatchOperation[]
): Promise<WorkItem> {
  return client.patch<WorkItem>(
    `wit/workitems/${id}`,
    operations,
    'application/json-patch+json'
  );
}

export async function deleteWorkItem(
  client: AdoClient,
  id: number
): Promise<void> {
  await client.delete(`wit/workitems/${id}`);
}

export async function downloadAttachment(
  client: AdoClient,
  attachmentId: string,
  fileName: string
): Promise<Blob> {
  const encodedName = encodeURIComponent(fileName);
  return client.getStream(
    `wit/attachments/${attachmentId}?fileName=${encodedName}`
  );
}

export async function getCurrentUserDisplayName(
  client: AdoClient
): Promise<string | null> {
  try {
    const response = await client.getOrgLevel<{
      authenticatedUser?: { providerDisplayName?: string };
    }>('connectionData');
    return response.authenticatedUser?.providerDisplayName ?? null;
  } catch {
    return null;
  }
}

export async function getWorkItemTypeStates(
  client: AdoClient,
  workItemType: string
): Promise<string[]> {
  const encodedType = encodeURIComponent(workItemType);
  const response = await client.get<{
    value: Array<{ name: string; color: string }>;
  }>(`wit/workitemtypes/${encodedType}/states`);

  return (response.value ?? []).map((s) => s.name);
}
