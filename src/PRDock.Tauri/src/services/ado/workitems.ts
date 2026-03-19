import type { JsonPatchOperation, WorkItem, WorkItemComment } from '@/types';
import type { AdoClient } from './client';

interface AdoWorkItemListResponse {
  value: WorkItem[];
}

export async function getWorkItems(client: AdoClient, ids: number[]): Promise<WorkItem[]> {
  if (ids.length === 0) return [];

  const results: WorkItem[] = [];

  // Batch in groups of 200 (ADO limit)
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const idList = batch.join(',');
    const response = await client.get<AdoWorkItemListResponse>(
      `wit/workitems?ids=${idList}&$expand=relations`,
    );

    if (response.value) {
      results.push(...response.value);
    }
  }

  return results;
}

export async function getWorkItem(client: AdoClient, id: number): Promise<WorkItem> {
  return client.get<WorkItem>(`wit/workitems/${id}?$expand=relations`);
}

export async function createWorkItem(
  client: AdoClient,
  type: string,
  fields: JsonPatchOperation[],
): Promise<WorkItem> {
  const encodedType = encodeURIComponent(type);
  return client.patch<WorkItem>(
    `wit/workitems/$${encodedType}`,
    fields,
    'application/json-patch+json',
  );
}

export async function updateWorkItem(
  client: AdoClient,
  id: number,
  operations: JsonPatchOperation[],
): Promise<WorkItem> {
  return client.patch<WorkItem>(`wit/workitems/${id}`, operations, 'application/json-patch+json');
}

export async function deleteWorkItem(client: AdoClient, id: number): Promise<void> {
  await client.delete(`wit/workitems/${id}`);
}

export async function downloadAttachment(
  client: AdoClient,
  attachmentId: string,
  fileName: string,
): Promise<Blob> {
  const encodedName = encodeURIComponent(fileName);
  return client.getStream(`wit/attachments/${attachmentId}?fileName=${encodedName}`);
}

export async function getCurrentUserDisplayName(client: AdoClient): Promise<string | null> {
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
  workItemType: string,
): Promise<string[]> {
  const encodedType = encodeURIComponent(workItemType);
  const response = await client.get<{
    value: Array<{ name: string; color: string }>;
  }>(`wit/workitemtypes/${encodedType}/states`);

  return (response.value ?? []).map((s) => s.name);
}

// --- Work item comments (Discussion) ---

interface AdoCommentsResponse {
  totalCount: number;
  count: number;
  comments: WorkItemComment[];
}

const COMMENTS_API_VERSION = '7.1-preview.4';

export async function getWorkItemComments(
  client: AdoClient,
  workItemId: number,
): Promise<WorkItemComment[]> {
  const response = await client.get<AdoCommentsResponse>(
    `wit/workitems/${workItemId}/comments?$top=200&order=asc`,
    COMMENTS_API_VERSION,
  );
  return response.comments ?? [];
}

export async function addWorkItemComment(
  client: AdoClient,
  workItemId: number,
  text: string,
): Promise<WorkItemComment> {
  return client.post<WorkItemComment>(
    `wit/workitems/${workItemId}/comments`,
    { text },
    undefined,
    COMMENTS_API_VERSION,
  );
}

export function buildIdPrefixWiql(prefix: string): string {
  if (!prefix || !/^\d+$/.test(prefix)) {
    throw new Error('Prefix must be a non-empty numeric string.');
  }

  const clauses: string[] = [];
  const prefixValue = parseInt(prefix, 10);

  // Exact match
  clauses.push(`[System.Id] = ${prefixValue}`);

  // Expand to cover IDs with more digits (up to 7 total)
  for (let totalDigits = prefix.length + 1; totalDigits <= 7; totalDigits++) {
    const suffixDigits = totalDigits - prefix.length;
    const lo = prefixValue * 10 ** suffixDigits;
    const hi = lo + 10 ** suffixDigits - 1;
    clauses.push(`([System.Id] >= ${lo} AND [System.Id] <= ${hi})`);
  }

  return `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(' OR ')}`;
}

interface WiqlResponse {
  workItems: Array<{ id: number; url: string }>;
}

export async function searchWorkItemsByIdPrefix(
  client: AdoClient,
  idPrefix: string,
): Promise<WorkItem[]> {
  const wiql = buildIdPrefixWiql(idPrefix);
  const response = await client.post<WiqlResponse>('wit/wiql?$top=20', {
    query: wiql,
  });

  const ids = (response.workItems ?? []).map((w) => w.id);
  if (ids.length === 0) return [];

  return getWorkItems(client, ids);
}

export async function searchWorkItemsByText(client: AdoClient, text: string): Promise<WorkItem[]> {
  // Escape single quotes in WIQL
  const escaped = text.replace(/'/g, "''");
  const wiql =
    `SELECT [System.Id] FROM WorkItems WHERE ` +
    `[System.Title] CONTAINS '${escaped}' ` +
    `OR [System.AssignedTo] CONTAINS '${escaped}' ` +
    `ORDER BY [System.ChangedDate] DESC`;

  const response = await client.post<WiqlResponse>('wit/wiql?$top=20', {
    query: wiql,
  });

  const ids = (response.workItems ?? []).map((w) => w.id);
  if (ids.length === 0) return [];

  return getWorkItems(client, ids);
}
