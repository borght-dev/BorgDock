import type { CiGroupSummary } from '@/services/ci-failures/types';
import { resolvedLogin } from '@/services/github/login';
import { parseScope, resolvedScope } from '@/services/github/scope';
import { getClientForRepo } from '@/services/github/singleton';
import { usePrStore } from '@/stores/pr-store';
import { deriveCi } from '../derive/ci';
import { ingest } from '../ingest';
import { sourceId } from '../sources';

export interface CiContext {
  threshold: number;
  ownerStale: (group: CiGroupSummary) => boolean;
}

/** A claim BorgDock made on this machine: me, a T3 thread or a terminal, not a tracking issue. */
function ownedByMe(group: CiGroupSummary): boolean {
  const claim = group.claim;
  return (
    !!claim &&
    claim.ownerKind !== 'github_issue' &&
    (claim.state === 'active' || claim.state === 'stale')
  );
}

async function ingestScope(
  scope: string,
  groups: CiGroupSummary[],
  revision: number,
  context: CiContext,
): Promise<void> {
  const parts = parseScope(scope);
  if (!parts) return;
  const client = getClientForRepo(parts.owner, parts.repo);
  const login = client ? await resolvedLogin(client) : null;
  if (!login) return;
  const resolved = resolvedScope(scope, login);
  const mine = usePrStore
    .getState()
    .pullRequests.filter(
      (pr) =>
        pr.pullRequest.repoOwner.toLowerCase() === parts.owner &&
        pr.pullRequest.repoName.toLowerCase() === parts.repo &&
        pr.pullRequest.authorLogin.toLowerCase() === login,
    );
  await ingest(
    {
      sourceId: sourceId.ci(resolved),
      kind: 'ci',
      label: `CI failures in ${parts.owner}/${parts.repo}`,
      configKey: resolved,
    },
    { sequence: revision },
    deriveCi,
    {
      scope,
      groups,
      threshold: context.threshold,
      ownerStale: context.ownerStale,
      ownedByMe,
      myPrs: mine.map((pr) => pr.pullRequest.number),
      myRedPrs: mine.filter((pr) => pr.overallStatus === 'red').map((pr) => pr.pullRequest.number),
    },
  );
}

/**
 * The CI failure groups the store holds after a refresh, one source per
 * repository. The baseline is the previous group list, so `eventsBetween`
 * compares across restarts.
 */
export function ingestCiGroups(
  groups: readonly CiGroupSummary[],
  revision: number,
  scopes: readonly string[],
  context: CiContext,
): void {
  for (const scope of scopes) {
    const own = groups.filter((group) => group.scope === scope);
    void ingestScope(scope, own, revision, context);
  }
}
