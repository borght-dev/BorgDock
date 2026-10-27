import type { GitHubClient } from '@/services/github/client';
import { matchesEnvironment } from './environments';

/**
 * Deployment facts of one repository, read from GitHub's Deployments API.
 * The list is one request (a 304 through the client's ETag cache costs
 * nothing); statuses are one request per deployment, a few per cycle,
 * newest first. #87 reads these facts for its delivery view.
 */

export interface DeploymentStatusFact {
  /** REST's number, as text. */
  id: string;
  /** success, failure, error, inactive, in_progress, queued, pending. */
  state: string;
  createdAt: string;
  logUrl: string | null;
  environmentUrl: string | null;
}

export interface DeploymentFact {
  id: number;
  sha: string;
  environment: string;
  createdAt: string;
  status: DeploymentStatusFact | null;
}

interface RestDeployment {
  id: number;
  sha: string;
  environment: string;
  created_at: string;
}

interface RestDeploymentStatus {
  id: number;
  state: string;
  created_at: string;
  log_url?: string | null;
  target_url?: string | null;
  environment_url?: string | null;
}

/** Statuses read per repository and cycle; the rest wait for the next cycle. */
export const STATUSES_PER_CYCLE = 10;
/** Deployments older than this are left alone. */
export const DEPLOYMENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** A deployment with one of these is settled; its status is not read again. */
const SETTLED = new Set(['success', 'failure', 'error', 'inactive']);

export function isTerminal(state: string | undefined): boolean {
  return state === 'success' || state === 'failure' || state === 'error';
}

export interface DeploymentRead {
  deployments: DeploymentFact[];
  /** Every environment the listed deployments went to, for the setup's suggestions. */
  environments: string[];
  requests: number;
}

export class DeploymentReader {
  private readonly statuses = new Map<number, DeploymentStatusFact>();

  async read(
    client: GitHubClient,
    owner: string,
    repo: string,
    patterns: readonly string[],
    now: number = Date.now(),
  ): Promise<DeploymentRead> {
    const listed = await client.get<RestDeployment[]>(
      `repos/${owner}/${repo}/deployments?per_page=100`,
    );
    let requests = 1;
    const followed = listed
      .filter((deployment) => matchesEnvironment(deployment.environment, patterns))
      .filter((deployment) => now - Date.parse(deployment.created_at) < DEPLOYMENT_WINDOW_MS)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const unsettled = followed.filter(
      (deployment) => !SETTLED.has(this.statuses.get(deployment.id)?.state ?? ''),
    );
    for (const deployment of unsettled.slice(0, STATUSES_PER_CYCLE)) {
      requests++;
      const [latest] = await client.get<RestDeploymentStatus[]>(
        `repos/${owner}/${repo}/deployments/${deployment.id}/statuses?per_page=1`,
      );
      if (!latest) continue;
      this.statuses.set(deployment.id, {
        id: String(latest.id),
        state: latest.state,
        createdAt: latest.created_at,
        logUrl: latest.log_url ?? latest.target_url ?? null,
        environmentUrl: latest.environment_url ?? null,
      });
    }
    return {
      deployments: followed.map((deployment) => ({
        id: deployment.id,
        sha: deployment.sha,
        environment: deployment.environment,
        createdAt: deployment.created_at,
        status: this.statuses.get(deployment.id) ?? null,
      })),
      environments: listed.map((deployment) => deployment.environment),
      requests,
    };
  }
}

/** The environments of a repository's last 100 deployments, for the opt-in. */
export async function recentEnvironments(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<string[]> {
  const listed = await client.get<RestDeployment[]>(
    `repos/${owner}/${repo}/deployments?per_page=100`,
  );
  return listed.map((deployment) => deployment.environment);
}
