import type { PullRequest } from '@/types';

const AB_PATTERN = /\bAB#(\d+)\b/gi;
const GENERIC_PATTERN = /(?:^|[\s(])#(\d+)\b/g;

/** Work item ids written as `AB#12345` (Azure DevOps shorthand) in `text`. */
export function abReferences(text: string): number[] {
  const ids: number[] = [];
  for (const match of text.matchAll(AB_PATTERN)) {
    const id = parseInt(match[1]!, 10);
    if (!Number.isNaN(id) && id > 0) ids.push(id);
  }
  return ids;
}

export function detectWorkItemIds(pr: PullRequest): number[] {
  const sources = [pr.title, pr.body, pr.headRef, ...pr.labels];
  const text = sources.join(' ');
  const ids = new Set<number>(abReferences(text));

  // Generic #12345 pattern — only from title and branch, not body (too noisy)
  let match: RegExpExecArray | null;
  const narrowSources = [pr.title, pr.headRef].join(' ');
  GENERIC_PATTERN.lastIndex = 0;
  while ((match = GENERIC_PATTERN.exec(narrowSources)) !== null) {
    const id = parseInt(match[1]!, 10);
    // Only consider larger IDs (> 100) to avoid false positives with GitHub issue numbers
    if (!Number.isNaN(id) && id > 100) ids.add(id);
  }

  return [...ids];
}
