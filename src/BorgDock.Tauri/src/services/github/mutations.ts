import type { GitHubClient } from './client';

// --- Merge a pull request ---

export async function mergePullRequest(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
  method: 'merge' | 'squash' | 'rebase' = 'merge',
): Promise<void> {
  await client.put(`repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
    merge_method: method,
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
): Promise<void> {
  await client.post(`repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    event,
    body,
  });
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
