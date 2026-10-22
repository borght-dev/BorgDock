import type { PrReview } from '@/types';
import type { GitHubClient } from './client';
import { getRepoMergeConfig, type MergeMethod, pickMergeMethod } from './repo';

// --- Merge a pull request ---

/**
 * Merge a PR via REST. When `method` is omitted, the repo's allowed merge
 * methods are fetched (and cached) so we never POST `merge_method: 'merge'`
 * to a repo that has merge commits disabled — that returns 405 from GitHub.
 * Pass `method` explicitly only when the caller has its own opinion (e.g.
 * MergeToast / OverviewTab both pin 'squash').
 */
export async function mergePullRequest(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  method?: MergeMethod,
): Promise<void> {
  let chosen = method;
  if (!chosen) {
    let config = null;
    try {
      config = await getRepoMergeConfig(client, owner, repo);
    } catch {
      // Repo lookup failed (network / auth scope). Fall through to the
      // pickMergeMethod default ('squash') so the merge still has a fighting
      // chance — repos without squash but with merge commits enabled are rare
      // in the codebase's target population.
    }
    chosen = pickMergeMethod(config);
  }
  await client.put(`repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
    merge_method: chosen,
  });
}

// --- Close a pull request ---

export async function closePullRequest(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  await client.patch(`repos/${owner}/${repo}/pulls/${prNumber}`, {
    state: 'closed',
  });
}

// --- Toggle draft status using GraphQL ---

interface PrNodeIdResponse {
  node_id: string;
}

interface ConvertToDraftResult {
  convertPullRequestToDraft: { pullRequest: { id: string } };
}

interface MarkReadyResult {
  markPullRequestReadyForReview: { pullRequest: { id: string } };
}

export async function toggleDraft(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  isDraft: boolean,
): Promise<void> {
  // Step 1: Get the PR's GraphQL node ID via REST
  const pr = await client.get<PrNodeIdResponse>(`repos/${owner}/${repo}/pulls/${prNumber}`);
  const nodeId = pr.node_id;

  // Step 2: Call the appropriate GraphQL mutation
  if (isDraft) {
    // Mark as draft
    const mutation = `
      mutation ConvertToDraft($pullRequestId: ID!) {
        convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) {
          pullRequest { id }
        }
      }
    `;
    await client.graphql<ConvertToDraftResult>(mutation, {
      pullRequestId: nodeId,
    });
  } else {
    // Mark as ready for review
    const mutation = `
      mutation MarkReady($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
          pullRequest { id }
        }
      }
    `;
    await client.graphql<MarkReadyResult>(mutation, {
      pullRequestId: nodeId,
    });
  }
}

// --- Submit a review ---

export async function submitReview(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
  body?: string,
  review?: {
    commit_id: string;
    comments: { path: string; line: number; side: 'LEFT' | 'RIGHT'; body: string }[];
  },
): Promise<PrReview | undefined> {
  const posted = await client.post<{
    user?: { login: string };
    submitted_at?: string;
    commit_id?: string;
  }>(`repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    event,
    body,
    ...review,
  });
  if (!posted?.user?.login) return;
  return {
    authorLogin: posted.user.login,
    state:
      event === 'APPROVE'
        ? 'approved'
        : event === 'REQUEST_CHANGES'
          ? 'changesRequested'
          : 'commented',
    submittedAt: posted.submitted_at,
    commitSha: posted.commit_id,
  };
}

/** GitHub merges these at once and refuses to enable auto merge on them. */
const MERGEABLE_NOW = new Set(['CLEAN', 'UNSTABLE', 'HAS_HOOKS']);

export async function enableAutoMerge(
  client: GitHubClient,
  owner: string,
  repo: string,
  number: number,
  headSha: string,
): Promise<'enabled' | 'merged'> {
  const data = await client.graphql<{
    repository: {
      pullRequest: {
        id: string;
        headRefOid: string;
        mergeStateStatus: string;
        state: string;
        merged: boolean;
        autoMergeRequest: { enabledAt: string } | null;
      } | null;
    } | null;
  }>(
    `query AutoMergeTarget($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
      id headRefOid mergeStateStatus state merged autoMergeRequest { enabledAt }
    } }
  }`,
    { owner, repo, number },
  );
  const pr = data.repository?.pullRequest;
  if (!pr) throw new Error('Pull request not found.');
  if (pr.merged) return 'merged';
  if (pr.state !== 'OPEN') throw new Error('Pull request is no longer open.');
  if (pr.headRefOid !== headSha)
    throw new Error(
      'The PR changed after your review. Review the new changes before enabling auto merge.',
    );
  if (pr.autoMergeRequest) return 'enabled';
  const config = await getRepoMergeConfig(client, owner, repo);
  const operation = MERGEABLE_NOW.has(pr.mergeStateStatus)
    ? 'mergePullRequest'
    : 'enablePullRequestAutoMerge';
  const inputType =
    operation === 'mergePullRequest' ? 'MergePullRequestInput' : 'EnablePullRequestAutoMergeInput';
  const result = await client.graphql<
    Record<string, { pullRequest: { merged: boolean; autoMergeRequest: object | null } }>
  >(
    `mutation ApproveAutoMerge($input: ${inputType}!) {
    ${operation}(input: $input) { pullRequest { merged autoMergeRequest { enabledAt } } }
  }`,
    {
      input: {
        pullRequestId: pr.id,
        expectedHeadOid: headSha,
        mergeMethod: pickMergeMethod(config).toUpperCase(),
      },
    },
  );
  const updated = result[operation]?.pullRequest;
  if (updated?.merged) return 'merged';
  if (updated?.autoMergeRequest) return 'enabled';
  throw new Error('GitHub did not confirm auto merge.');
}

// --- Bypass merge (admin) using gh CLI via Tauri shell ---

export async function bypassMergePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('run_gh_command', {
    args: ['pr', 'merge', String(prNumber), '--squash', '--admin', '--repo', `${owner}/${repo}`],
  });
}

// --- Post a comment ---

export async function postComment(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  await client.post(`repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    body,
  });
}
