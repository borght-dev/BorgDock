import { DeploymentReader } from '@/services/delivery/deployments';
import { InclusionChecker, type MergedPr } from '@/services/delivery/inclusion';
import type { GitHubClient } from '@/services/github/client';
import { resolvedLogin } from '@/services/github/login';
import { GITHUB_HOST, scopeOf } from '@/services/github/scope';
import { createLogger } from '@/services/logger';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import {
  type DeliveryBaseline,
  type DeliveryObservation,
  deriveDelivery,
  type HeadDeploymentFacts,
  reachedEnvironments,
} from '../derive/delivery';
import { ingest, monotonicTime, peekBaseline, type SourceDescriptor } from '../ingest';
import { sourceId } from '../sources';

const log = createLogger('activity:delivery');

/** The deployment list is read this often; every fourth time while all windows are hidden. */
export const DELIVERY_MS = 2 * 60_000;

/** My merged PRs are followed to the environments for this long. */
const MERGED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function deliverySource(owner: string, repo: string, login: string): SourceDescriptor {
  const scope = scopeOf({ host: GITHUB_HOST, account: login, owner, repo });
  return {
    sourceId: sourceId.deploy(scope),
    kind: 'deploy',
    label: `Deployments of ${owner}/${repo} (${login})`,
    configKey: scope,
    intervalMs: DELIVERY_MS,
  };
}

function sameRepo(pr: PullRequestWithChecks, owner: string, repo: string): boolean {
  return (
    pr.pullRequest.repoOwner.toLowerCase() === owner.toLowerCase() &&
    pr.pullRequest.repoName.toLowerCase() === repo.toLowerCase()
  );
}

function headsOf(prs: readonly PullRequestWithChecks[], login: string): HeadDeploymentFacts[] {
  return prs
    .filter((pr) => pr.pullRequest.authorLogin.toLowerCase() === login)
    .flatMap((pr) =>
      (pr.headDeployments ?? []).map((deployment) => ({
        prNumber: pr.pullRequest.number,
        prTitle: pr.pullRequest.title,
        prUrl: pr.pullRequest.htmlUrl,
        deploymentId: deployment.id,
        environment: deployment.environment,
        createdAt: deployment.createdAt,
        status: deployment.status,
      })),
    );
}

/** The head deployments a GitHub poll read for my open PRs. No requests of its own. */
export function ingestDeliveryHeads(
  owner: string,
  repo: string,
  login: string,
  prs: readonly PullRequestWithChecks[],
): Promise<unknown> {
  const heads = headsOf(prs, login);
  const source = deliverySource(owner, repo, login);
  return ingest(source, monotonicTime(source.sourceId), deriveDelivery, {
    owner,
    repo,
    heads,
    inclusions: [],
  } satisfies DeliveryObservation);
}

function myMergedPrs(owner: string, repo: string, login: string, now: number): MergedPr[] {
  return usePrStore
    .getState()
    .closedPullRequests.filter((pr) => sameRepo(pr, owner, repo))
    .flatMap((pr) => {
      const p = pr.pullRequest;
      if (p.authorLogin.toLowerCase() !== login || !p.mergedAt || !p.mergeCommitSha) return [];
      if (now - Date.parse(p.mergedAt) > MERGED_WINDOW_MS) return [];
      return [
        {
          number: p.number,
          title: p.title,
          url: p.htmlUrl,
          mergedAt: p.mergedAt,
          mergeCommitSha: p.mergeCommitSha,
        },
      ];
    });
}

const readers = new Map<string, DeploymentReader>();
const checkers = new Map<string, InclusionChecker>();

function cached<T>(map: Map<string, T>, key: string, make: () => T): T {
  let value = map.get(key);
  if (!value) {
    value = make();
    map.set(key, value);
  }
  return value;
}

/**
 * One cycle of the deployment poller for one repository that opted in:
 * the deployment list, a few statuses, a few compares, then one
 * observation with my PR heads and the inclusions.
 */
export async function pollRepositoryDeliveries(
  client: GitHubClient,
  owner: string,
  repo: string,
  environments: readonly string[],
  now: number = Date.now(),
): Promise<{ requests: number }> {
  const login = await resolvedLogin(client);
  if (!login) return { requests: 0 };
  const source = deliverySource(owner, repo, login);
  const key = source.sourceId;
  const read = await cached(readers, key, () => new DeploymentReader()).read(
    client,
    owner,
    repo,
    environments,
    now,
  );
  const baseline = await peekBaseline<DeliveryBaseline>(source);
  const facts = await cached(checkers, key, () => new InclusionChecker()).inclusions(
    client,
    owner,
    repo,
    read.deployments,
    myMergedPrs(owner, repo, login, now),
    (number) => reachedEnvironments(baseline, number),
  );
  const prs = usePrStore.getState().pullRequests.filter((pr) => sameRepo(pr, owner, repo));
  await ingest(source, monotonicTime(source.sourceId), deriveDelivery, {
    owner,
    repo,
    heads: headsOf(prs, login),
    inclusions: facts.map(({ pr, deployment, included }) => ({
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.url,
      deploymentId: deployment.id,
      environment: deployment.environment,
      deploymentCreatedAt: deployment.createdAt,
      status: deployment.status!,
      included,
    })),
  } satisfies DeliveryObservation);
  return { requests: read.requests };
}

/** The deployment poller's cycle: every repository that opted in. */
export async function pollDeliveries(
  clientFor: (owner: string, repo: string) => GitHubClient | null,
): Promise<void> {
  const repos = useSettingsStore
    .getState()
    .settings.repos.filter((repo) => repo.enabled && repo.deployments?.enabled);
  for (const repo of repos) {
    const client = clientFor(repo.owner, repo.name);
    if (!client) continue;
    try {
      await pollRepositoryDeliveries(
        client,
        repo.owner,
        repo.name,
        repo.deployments?.environments ?? [],
      );
    } catch (error) {
      log.warn('deployment poll failed', {
        repo: `${repo.owner}/${repo.name}`,
        error: String(error),
      });
    }
  }
}
