import type { AgentThread } from '@/services/dispatch/types';
import type { GitHubClient } from '@/services/github/client';
import { createLogger } from '@/services/logger';
import type { PullRequestWithChecks } from '@/types';
import { parseScope } from './identity';
import { FIX_MARKER, shortGroupId } from './prompts';
import * as store from './store-api';
import type { CiGroupSummary } from './types';

const log = createLogger('ci-failures-fixes');

/**
 * Fix pull requests BorgDock can name for groups that have none: a PR whose
 * body carries `BorgDock-CI-Group: <short id>`, or the PR of the T3 thread
 * that owns the group. Pure.
 */
export function suggestedFixes(
  groups: readonly CiGroupSummary[],
  prs: readonly PullRequestWithChecks[],
  threads: readonly AgentThread[],
): { group: CiGroupSummary; url: string }[] {
  const byShortId = new Map(groups.map((g) => [shortGroupId(g.id), g]));
  const found = new Map<string, { group: CiGroupSummary; url: string }>();
  for (const pr of prs) {
    const short = FIX_MARKER.exec(pr.pullRequest.body ?? '')?.[1];
    const group = short ? byShortId.get(short) : undefined;
    if (group && !group.fixPr) found.set(group.id, { group, url: pr.pullRequest.htmlUrl });
  }
  for (const group of groups) {
    if (group.fixPr || found.has(group.id) || group.claim?.ownerKind !== 't3') continue;
    const thread = threads.find((t) => t.id === group.claim?.ownerRef);
    // A thread reports its checkout's PRs; an affected PR is never the fix.
    const pr = thread?.pullRequests.find((p) => !group.prNumbers.includes(p.number));
    if (pr) found.set(group.id, { group, url: pr.url });
  }
  return [...found.values()];
}

interface PullDto {
  merged_at: string | null;
  state: string;
}

/** Links suggested fixes and records when linked fixes merge. */
export async function trackFixes(
  groups: readonly CiGroupSummary[],
  prs: readonly PullRequestWithChecks[],
  threads: readonly AgentThread[],
  clientFor: (owner: string, repo: string) => GitHubClient | null,
): Promise<void> {
  for (const { group, url } of suggestedFixes(groups, prs, threads)) {
    await store
      .setGroup(group.id, { fixPr: url }, group.revision)
      .catch((error) => log.debug('linking fix failed', { group: group.id, error: String(error) }));
  }
  for (const group of groups) {
    if (!group.fixPr || group.fixMergedAt || group.status === 'resolved') continue;
    const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(group.fixPr);
    if (!match) continue;
    const [, owner = '', repo = '', number = ''] = match;
    const open = prs.some(
      (pr) =>
        pr.pullRequest.repoOwner.toLowerCase() === owner.toLowerCase() &&
        pr.pullRequest.repoName.toLowerCase() === repo.toLowerCase() &&
        pr.pullRequest.number === Number(number),
    );
    if (open) continue;
    const client =
      clientFor(owner, repo) ??
      clientFor(parseScope(group.scope)?.owner ?? '', parseScope(group.scope)?.repo ?? '');
    if (!client) continue;
    try {
      const pull = await client.get<PullDto>(`repos/${owner}/${repo}/pulls/${number}`);
      if (pull.merged_at) {
        await store.setGroup(group.id, { fixMergedAt: pull.merged_at }, group.revision);
      }
    } catch (error) {
      log.debug('reading fix PR failed', { url: group.fixPr, error: String(error) });
    }
  }
}
