import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../client';
import {
  bypassMergePullRequest,
  closePullRequest,
  mergePullRequest,
  postComment,
  submitReview,
  toggleDraft,
} from '../mutations';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

function createMockClient() {
  return {
    get: vi.fn(),
    getRaw: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    graphql: vi.fn(),
    getRateLimit: vi.fn(),
    isRateLimitLow: false,
  } as unknown as GitHubClient;
}

describe('mergePullRequest', () => {
  it('merges a PR with default merge method', async () => {
    const client = createMockClient();
    vi.mocked(client.put).mockResolvedValueOnce(undefined);

    await mergePullRequest(client, 'owner', 'repo', 42);

    expect(client.put).toHaveBeenCalledWith('repos/owner/repo/pulls/42/merge', {
      merge_method: 'merge',
    });
  });

  it('merges a PR with squash method', async () => {
    const client = createMockClient();
    vi.mocked(client.put).mockResolvedValueOnce(undefined);

    await mergePullRequest(client, 'owner', 'repo', 42, 'squash');

    expect(client.put).toHaveBeenCalledWith('repos/owner/repo/pulls/42/merge', {
      merge_method: 'squash',
    });
  });

  it('merges a PR with rebase method', async () => {
    const client = createMockClient();
    vi.mocked(client.put).mockResolvedValueOnce(undefined);

    await mergePullRequest(client, 'owner', 'repo', 42, 'rebase');

    expect(client.put).toHaveBeenCalledWith('repos/owner/repo/pulls/42/merge', {
      merge_method: 'rebase',
    });
  });

  it('propagates errors from the client', async () => {
    const client = createMockClient();
    vi.mocked(client.put).mockRejectedValueOnce(new Error('Merge conflict'));

    await expect(mergePullRequest(client, 'owner', 'repo', 42)).rejects.toThrow('Merge conflict');
  });
});

describe('closePullRequest', () => {
  it('closes a PR by patching state to closed', async () => {
    const client = createMockClient();
    vi.mocked(client.patch).mockResolvedValueOnce(undefined);

    await closePullRequest(client, 'owner', 'repo', 42);

    expect(client.patch).toHaveBeenCalledWith('repos/owner/repo/pulls/42', {
      state: 'closed',
    });
  });

  it('propagates errors from the client', async () => {
    const client = createMockClient();
    vi.mocked(client.patch).mockRejectedValueOnce(new Error('Not authorized'));

    await expect(closePullRequest(client, 'owner', 'repo', 42)).rejects.toThrow('Not authorized');
  });
});

describe('toggleDraft', () => {
  it('converts PR to draft when isDraft is true', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({ node_id: 'PR_node123' });
    vi.mocked(client.graphql).mockResolvedValueOnce({
      convertPullRequestToDraft: { pullRequest: { id: 'PR_node123' } },
    });

    await toggleDraft(client, 'owner', 'repo', 42, true);

    expect(client.get).toHaveBeenCalledWith('repos/owner/repo/pulls/42');
    expect(client.graphql).toHaveBeenCalledWith(
      expect.stringContaining('convertPullRequestToDraft'),
      { pullRequestId: 'PR_node123' },
    );
  });

  it('marks PR as ready for review when isDraft is false', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({ node_id: 'PR_node456' });
    vi.mocked(client.graphql).mockResolvedValueOnce({
      markPullRequestReadyForReview: { pullRequest: { id: 'PR_node456' } },
    });

    await toggleDraft(client, 'owner', 'repo', 42, false);

    expect(client.get).toHaveBeenCalledWith('repos/owner/repo/pulls/42');
    expect(client.graphql).toHaveBeenCalledWith(
      expect.stringContaining('markPullRequestReadyForReview'),
      { pullRequestId: 'PR_node456' },
    );
  });

  it('propagates errors from get', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockRejectedValueOnce(new Error('Not found'));

    await expect(toggleDraft(client, 'owner', 'repo', 42, true)).rejects.toThrow('Not found');
  });

  it('propagates errors from graphql', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({ node_id: 'PR_node789' });
    vi.mocked(client.graphql).mockRejectedValueOnce(new Error('GraphQL error'));

    await expect(toggleDraft(client, 'owner', 'repo', 42, true)).rejects.toThrow('GraphQL error');
  });
});

describe('submitReview', () => {
  it('submits an APPROVE review', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce(undefined);

    await submitReview(client, 'owner', 'repo', 42, 'APPROVE', 'Looks good!');

    expect(client.post).toHaveBeenCalledWith('repos/owner/repo/pulls/42/reviews', {
      event: 'APPROVE',
      body: 'Looks good!',
    });
  });

  it('submits a REQUEST_CHANGES review', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce(undefined);

    await submitReview(client, 'owner', 'repo', 42, 'REQUEST_CHANGES', 'Please fix the bug');

    expect(client.post).toHaveBeenCalledWith('repos/owner/repo/pulls/42/reviews', {
      event: 'REQUEST_CHANGES',
      body: 'Please fix the bug',
    });
  });

  it('submits a COMMENT review', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce(undefined);

    await submitReview(client, 'owner', 'repo', 42, 'COMMENT', 'Interesting approach');

    expect(client.post).toHaveBeenCalledWith('repos/owner/repo/pulls/42/reviews', {
      event: 'COMMENT',
      body: 'Interesting approach',
    });
  });

  it('submits review without body', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce(undefined);

    await submitReview(client, 'owner', 'repo', 42, 'APPROVE');

    expect(client.post).toHaveBeenCalledWith('repos/owner/repo/pulls/42/reviews', {
      event: 'APPROVE',
      body: undefined,
    });
  });

  it('propagates errors from the client', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockRejectedValueOnce(new Error('Forbidden'));

    await expect(submitReview(client, 'owner', 'repo', 42, 'APPROVE')).rejects.toThrow('Forbidden');
  });
});

describe('bypassMergePullRequest', () => {
  it('invokes run_gh_command with correct args', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mockedInvoke = vi.mocked(invoke);
    mockedInvoke.mockResolvedValueOnce(undefined);

    await bypassMergePullRequest('owner', 'repo', 42);

    expect(mockedInvoke).toHaveBeenCalledWith('run_gh_command', {
      args: ['pr', 'merge', '42', '--squash', '--admin', '--repo', 'owner/repo'],
    });
  });

  it('propagates errors from invoke', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mockedInvoke = vi.mocked(invoke);
    mockedInvoke.mockRejectedValueOnce(new Error('gh not found'));

    await expect(bypassMergePullRequest('owner', 'repo', 42)).rejects.toThrow('gh not found');
  });
});

describe('postComment', () => {
  it('posts a comment to a PR via issue comments API', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce(undefined);

    await postComment(client, 'owner', 'repo', 42, 'Hello world');

    expect(client.post).toHaveBeenCalledWith('repos/owner/repo/issues/42/comments', {
      body: 'Hello world',
    });
  });

  it('propagates errors from the client', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockRejectedValueOnce(new Error('Server error'));

    await expect(postComment(client, 'owner', 'repo', 42, 'test')).rejects.toThrow('Server error');
  });
});
