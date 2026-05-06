// src/components/work-items/WorkItemDetailPanel/parseLinkedPRs.ts
import type { WorkItemRelation } from '@/types';

export interface LinkedPR {
  id: number;
  comment?: string;
}

const PR_URL_RE = /Git\/PullRequestId\/[^/]+\/[^/]+\/(\d+)/;

export function parseLinkedPRs(relations: WorkItemRelation[]): LinkedPR[] {
  const results: LinkedPR[] = [];
  for (const r of relations) {
    if (r.rel !== 'ArtifactLink') continue;
    const match = decodeURIComponent(r.url).match(PR_URL_RE);
    if (!match) continue;
    const id = Number(match[1]);
    if (!Number.isFinite(id)) continue;
    const comment =
      typeof r.attributes.comment === 'string' ? (r.attributes.comment as string) : undefined;
    results.push({ id, comment });
  }
  return results;
}
