import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../client';
import { aggregateReviewStatus, getClosedPRs, getOpenPRs } from '../pulls';

// Mock the client
function createMockClient() {
  const client = {
    get: vi.fn(),
    getRaw: vi.fn(),
    post: vi.fn(),
    getRateLimit: vi.fn(),
    isRateLimitLow: false,
  } as unknown as GitHubClient;
  return client;
}

const fakePrDto = {
  number: 42,
  title: 'Add feature X',
  body: 'Description of feature X',
  state: 'open',
  html_url: 'https://github.com/owner/repo/pull/42',
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-16T10:00:00Z',
  closed_at: null,
  merged_at: null,
  draft: false,
  mergeable: true,
  comments: 2,
  review_comments: 1,
  additions: 50,
  deletions: 10,
  changed_files: 3,
  commits: 2,
  user: { login: 'alice', avatar_url: 'https://avatars.example.com/alice' },
  head: { ref: 'feature-x' },
  base: { ref: 'main' },
  labels: [{ name: 'enhancement' }],
};

describe('getOpenPRs', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('fetches and maps open PRs correctly', async () => {
    const getSpy = vi.mocked(client.get);

    // First call: PR list
    getSpy.mockResolvedValueOnce([fakePrDto]);
    // Second call: reviews for PR #42
    getSpy.mockResolvedValueOnce([{ state: 'APPROVED', user: { login: 'bob', avatar_url: '' } }]);

    const result = await getOpenPRs(client, 'owner', 'repo');

    expect(result).toHaveLength(1);
    const pr = result[0]!;
    expect(pr.number).toBe(42);
    expect(pr.title).toBe('Add feature X');
    expect(pr.headRef).toBe('feature-x');
    expect(pr.baseRef).toBe('main');
    expect(pr.authorLogin).toBe('alice');
    expect(pr.state).toBe('open');
    expect(pr.isDraft).toBe(false);
    expect(pr.commentCount).toBe(3);
    expect(pr.labels).toEqual(['enhancement']);
    expect(pr.reviewStatus).toBe('approved');
    expect(pr.repoOwner).toBe('owner');
    expect(pr.repoName).toBe('repo');

    expect(getSpy).toHaveBeenCalledWith('repos/owner/repo/pulls?state=open');
    expect(getSpy).toHaveBeenCalledWith('repos/owner/repo/pulls/42/reviews');
  });

  it('defaults reviewStatus to none when reviews fetch fails', async () => {
    const getSpy = vi.mocked(client.get);

    getSpy.mockResolvedValueOnce([fakePrDto]);
    getSpy.mockRejectedValueOnce(new Error('Network error'));

    const result = await getOpenPRs(client, 'owner', 'repo');

    expect(result).toHaveLength(1);
    expect(result[0]!.reviewStatus).toBe('none');
  });

  it('returns empty array when no PRs', async () => {
    vi.mocked(client.get).mockResolvedValueOnce([]);

    const result = await getOpenPRs(client, 'owner', 'repo');
    expect(result).toEqual([]);
  });
});

describe('getClosedPRs', () => {
  it('fetches closed PRs with default parameters', async () => {
    const client = createMockClient();
    const closedDto = { ...fakePrDto, state: 'closed', closed_at: '2025-01-17T10:00:00Z' };
    vi.mocked(client.get).mockResolvedValueOnce([closedDto]);

    const result = await getClosedPRs(client, 'owner', 'repo');

    expect(result).toHaveLength(1);
    expect(result[0]!.state).toBe('closed');
    expect(result[0]!.closedAt).toBe('2025-01-17T10:00:00Z');

    expect(client.get).toHaveBeenCalledWith(
      'repos/owner/repo/pulls?state=closed&sort=updated&direction=desc&per_page=30',
    );
  });

  it('includes since parameter when provided', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce([]);

    await getClosedPRs(client, 'owner', 'repo', '2025-01-01T00:00:00Z');

    expect(client.get).toHaveBeenCalledWith(
      expect.stringContaining('since=2025-01-01T00%3A00%3A00Z'),
    );
  });
});

describe('aggregateReviewStatus', () => {
  it('returns none for empty reviews', () => {
    expect(aggregateReviewStatus([])).toBe('none');
  });

  it('returns approved when only approved reviews', () => {
    expect(
      aggregateReviewStatus([{ state: 'APPROVED', user: { login: 'alice', avatar_url: '' } }]),
    ).toBe('approved');
  });

  it('returns changesRequested when any reviewer requests changes', () => {
    expect(
      aggregateReviewStatus([
        { state: 'APPROVED', user: { login: 'alice', avatar_url: '' } },
        { state: 'CHANGES_REQUESTED', user: { login: 'bob', avatar_url: '' } },
      ]),
    ).toBe('changesRequested');
  });

  it('takes latest review per user', () => {
    // Bob first requests changes, then approves
    expect(
      aggregateReviewStatus([
        { state: 'CHANGES_REQUESTED', user: { login: 'bob', avatar_url: '' } },
        { state: 'APPROVED', user: { login: 'bob', avatar_url: '' } },
      ]),
    ).toBe('approved');
  });

  it('returns commented when only commented reviews', () => {
    expect(
      aggregateReviewStatus([{ state: 'COMMENTED', user: { login: 'alice', avatar_url: '' } }]),
    ).toBe('commented');
  });

  it('returns pending when only pending reviews', () => {
    expect(
      aggregateReviewStatus([{ state: 'PENDING', user: { login: 'alice', avatar_url: '' } }]),
    ).toBe('pending');
  });
});
