// src/components/work-items/WorkItemDetailPanel/parseLinkedPRs.ts
import type { WorkItemRelation } from '@/types';

export interface LinkedPR {
  id: number;
  comment?: string;
}

const PR_URL_RE = /Git\/PullRequestId\/[^/]+\/[^/]+\/(\d+)/;

export function parseLinkedPRs(relations: WorkItemRelation[]): LinkedPR[] {
  return relations
    .filter((r) => r.rel === 'ArtifactLink')
    .map((r) => {
      const match = decodeURIComponent(r.url).match(PR_URL_RE);
      if (!match) return null;
      const id = Number(match[1]);
      if (!Number.isFinite(id)) return null;
      const comment =
        typeof r.attributes.comment === 'string' ? (r.attributes.comment as string) : undefined;
      return { id, comment };
    })
    .filter((x): x is LinkedPR => x !== null);
}
