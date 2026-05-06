// src/components/work-items/WorkItemDetailPanel/parseLinkedPRs.ts
import type { WorkItemRelation } from '@/types';

export interface LinkedPR {
  id: number;
  comment?: string;
}

const PR_URL_RE = /Git\/PullRequestId\/[^/]+\/[^/]+\/(\d+)/;

export function parseLinkedPRs(relations: WorkItemRelation[]): LinkedPR[] {
  const result: LinkedPR[] = [];
  for (const r of relations) {
    if (r.rel !== 'ArtifactLink') continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(r.url);
    } catch {
      continue;
    }
    const match = decoded.match(PR_URL_RE);
    if (!match) continue;
    const id = Number(match[1]);
    if (!Number.isFinite(id)) continue;
    const comment =
      typeof r.attributes.comment === 'string' ? r.attributes.comment : undefined;
    result.push({ id, comment });
  }
  return result;
}
