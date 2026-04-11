import type { AdoQuery, WorkItem } from '@/types';
import type { AdoClient } from './client';
import { getWorkItems } from './workitems';

interface AdoQueryListResponse {
  value: AdoQueryResponseItem[];
}

interface AdoQueryResponseItem {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  hasChildren: boolean;
  children?: AdoQueryResponseItem[];
}

interface AdoQueryExecuteResponse {
  queryType: string;
  workItems: Array<{ id: number; url: string }>;
}

export async function getQueryTree(client: AdoClient): Promise<AdoQuery[]> {
  const response = await client.get<AdoQueryListResponse>('wit/queries?$depth=2&$expand=minimal');

  return (response.value ?? []).map(mapToAdoQuery);
}

export async function executeQuery(client: AdoClient, queryId: string): Promise<WorkItem[]> {
  const response = await client.get<AdoQueryExecuteResponse>(`wit/wiql/${queryId}`);

  let ids: number[];
  if (response.queryType === 'tree' || response.queryType === 'oneHop') {
    const relations = (response as any).workItemRelations ?? [];
    ids = [...new Set(
      relations.flatMap((r: any) => [r.target?.id, r.source?.id].filter(Boolean) as number[])
    )];
  } else {
    ids = (response.workItems ?? []).map((w) => w.id);
  }
  if (ids.length === 0) return [];

  return getWorkItems(client, ids);
}

function mapToAdoQuery(item: AdoQueryResponseItem): AdoQuery {
  return {
    id: item.id,
    name: item.name,
    path: item.path,
    isFolder: item.isFolder,
    hasChildren: item.hasChildren,
    children: (item.children ?? []).map(mapToAdoQuery),
  };
}
