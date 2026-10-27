import type { GitHubClient } from '@/services/github/client';
import { type DeploymentFact, isTerminal } from './deployments';

/**
 * Whether a deployment carried a merged PR: GitHub's compare of the merge
 * commit with the deployed commit says `ahead` or `identical` when it did.
 * Answers never change, so they are kept per pair.
 */

export const COMPARES_PER_CYCLE = 10;

export interface MergedPr {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  mergeCommitSha: string;
}

export interface InclusionFact {
  pr: MergedPr;
  deployment: DeploymentFact;
  included: boolean;
}

export class InclusionChecker {
  private readonly answers = new Map<string, boolean>();

  /** Null when the cycle's compares are spent. */
  async includes(
    client: GitHubClient,
    owner: string,
    repo: string,
    mergeSha: string,
    deployedSha: string,
    budget: { left: number },
  ): Promise<boolean | null> {
    if (mergeSha === deployedSha) return true;
    const key = `${mergeSha}...${deployedSha}`;
    const known = this.answers.get(key);
    if (known !== undefined) return known;
    if (budget.left <= 0) return null;
    budget.left--;
    const compare = await client.get<{ status: string }>(
      `repos/${owner}/${repo}/compare/${mergeSha}...${deployedSha}?per_page=1`,
    );
    const included = compare.status === 'ahead' || compare.status === 'identical';
    this.answers.set(key, included);
    return included;
  }

  /**
   * For the newest settled deployment of each environment, whether it
   * carried each of my merged PRs that has not reached that environment.
   */
  async inclusions(
    client: GitHubClient,
    owner: string,
    repo: string,
    deployments: readonly DeploymentFact[],
    merged: readonly MergedPr[],
    reached: (number: number) => ReadonlySet<string>,
  ): Promise<InclusionFact[]> {
    const newest = new Map<string, DeploymentFact>();
    for (const deployment of deployments) {
      if (!isTerminal(deployment.status?.state)) continue;
      const known = newest.get(deployment.environment);
      if (!known || deployment.createdAt > known.createdAt) {
        newest.set(deployment.environment, deployment);
      }
    }
    const budget = { left: COMPARES_PER_CYCLE };
    const facts: InclusionFact[] = [];
    for (const deployment of newest.values()) {
      for (const pr of merged) {
        if (reached(pr.number).has(deployment.environment)) continue;
        if (pr.mergedAt > deployment.createdAt) continue;
        const included = await this.includes(
          client,
          owner,
          repo,
          pr.mergeCommitSha,
          deployment.sha,
          budget,
        );
        if (included !== null) facts.push({ pr, deployment, included });
      }
    }
    return facts;
  }
}
