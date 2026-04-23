import type { PullRequest } from '@/types';

const AB_PATTERN = /\bAB#(\d+)\b/gi;
const GENERIC_PATTERN = /(?:^|[\s(])#(\d+)\b/g;

export function detectWorkItemIds(pr: PullRequest): number[] {
  const sources = [pr.title, pr.body, pr.headRef, ...pr.labels];
  const text = sources.join(' ');
  const ids = new Set<number>();

  // AB#12345 pattern (Azure DevOps shorthand)
  let match: RegExpExecArray | null;
  AB_PATTERN.lastIndex = 0;
  while ((match = AB_PATTERN.exec(text)) !== null) {
    const id = parseInt(match[1]!, 10);
    if (!Number.isNaN(id) && id > 0) ids.add(id);
  }

  // Generic #12345 pattern — only from title and branch, not body (too noisy)
  const narrowSources = [pr.title, pr.headRef].join(' ');
  GENERIC_PATTERN.lastIndex = 0;
  while ((match = GENERIC_PATTERN.exec(narrowSources)) !== null) {
    const id = parseInt(match[1]!, 10);
    // Only consider larger IDs (> 100) to avoid false positives with GitHub issue numbers
    if (!Number.isNaN(id) && id > 100) ids.add(id);
  }

  return [...ids];
}
