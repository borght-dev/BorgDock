import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../client';
import {
  aggregateReviewStatus,
  getClosedPRs,
  getCommitFiles,
  getOpenPRs,
  getPRCommits,
  getPRFiles,
} from '../pulls';

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
    // Second + third call (parallel): individual PR detail + reviews for PR #42
    getSpy.mockResolvedValueOnce({ ...fakePrDto, mergeable: true, requested_reviewers: [] });
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
    expect(getSpy).toHaveBeenCalledWith('repos/owner/repo/pulls/42');
    expect(getSpy).toHaveBeenCalledWith('repos/owner/repo/pulls/42/reviews');
  });

  it('defaults reviewStatus to none when reviews fetch fails', async () => {
    const getSpy = vi.mocked(client.get);

    getSpy.mockResolvedValueOnce([fakePrDto]);
    // Detail + reviews are fetched in parallel via Promise.all inside Promise.allSettled.
    // If either rejects, the whole per-PR Promise.all rejects, and allSettled catches it.
    getSpy.mockRejectedValueOnce(new Error('Network error'));
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

  it('skips detail and review fetches when hydrateDetails is false', async () => {
    const getSpy = vi.mocked(client.get);
    getSpy.mockResolvedValueOnce([fakePrDto]);

    const result = await getOpenPRs(client, 'owner', 'repo', { hydrateDetails: false });

    expect(result).toHaveLength(1);
    expect(result[0]!.number).toBe(42);
    // Only the list endpoint should have been called — no detail, no reviews
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith('repos/owner/repo/pulls?state=open');
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

  it('returns none when reviews have no login or state', () => {
    expect(
      aggregateReviewStatus([
        { state: '', user: { login: 'alice', avatar_url: '' } },
        { state: 'APPROVED', user: { login: '', avatar_url: '' } },
        { state: '', user: null },
      ]),
    ).toBe('none');
  });

  it('returns none when all reviews have unrecognized states', () => {
    expect(
      aggregateReviewStatus([
        { state: 'DISMISSED', user: { login: 'alice', avatar_url: '' } },
      ]),
    ).toBe('none');
  });

  it('handles reviews with null user', () => {
    expect(
      aggregateReviewStatus([
        { state: 'APPROVED', user: null },
      ]),
    ).toBe('none');
  });

  it('handles reviews with null state', () => {
    expect(
      aggregateReviewStatus([
        { state: null as unknown as string, user: { login: 'alice', avatar_url: '' } },
      ]),
    ).toBe('none');
  });
});

describe('getPRCommits', () => {
  it('fetches and maps commits correctly', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce([
      {
        sha: 'abc123',
        commit: {
          message: 'Initial commit',
          author: { name: 'Alice', date: '2025-01-15T10:00:00Z' },
        },
        author: { login: 'alice', avatar_url: 'https://avatars.example.com/alice' },
      },
      {
        sha: 'def456',
        commit: {
          message: 'Fix bug',
          author: { name: 'Bob', date: '2025-01-16T10:00:00Z' },
        },
        author: null,
      },
    ]);

    const result = await getPRCommits(client, 'owner', 'repo', 42);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      sha: 'abc123',
      message: 'Initial commit',
      authorLogin: 'alice',
      authorAvatarUrl: 'https://avatars.example.com/alice',
      date: '2025-01-15T10:00:00Z',
    });
    expect(result[1]).toEqual({
      sha: 'def456',
      message: 'Fix bug',
      authorLogin: 'Bob',
      authorAvatarUrl: '',
      date: '2025-01-16T10:00:00Z',
    });

    expect(client.get).toHaveBeenCalledWith('repos/owner/repo/pulls/42/commits');
  });

  it('handles null commit and author fields', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce([
      {
        sha: 'abc123',
        commit: null,
        author: null,
      },
    ]);

    const result = await getPRCommits(client, 'owner', 'repo', 42);

    expect(result[0]).toEqual({
      sha: 'abc123',
      message: '',
      authorLogin: '',
      authorAvatarUrl: '',
      date: '',
    });
  });
});

describe('getPRFiles', () => {
  it('fetches file changes for a PR', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce([
      {
        filename: 'src/index.ts',
        status: 'modified',
        additions: 10,
        deletions: 2,
        patch: '@@ -1,5 +1,7 @@',
        previous_filename: undefined,
        sha: 'abc123',
      },
    ]);

    const result = await getPRFiles(client, 'owner', 'repo', 42);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      filename: 'src/index.ts',
      status: 'modified',
      additions: 10,
      deletions: 2,
      patch: '@@ -1,5 +1,7 @@',
      previousFilename: undefined,
      sha: 'abc123',
    });

    expect(client.get).toHaveBeenCalledWith(
      'repos/owner/repo/pulls/42/files?per_page=100&page=1',
    );
  });

  it('paginates when there are exactly 100 files', async () => {
    const client = createMockClient();
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      filename: `file${i}.ts`,
      status: 'added',
      additions: 1,
      deletions: 0,
    }));
    const page2 = [
      {
        filename: 'file100.ts',
        status: 'added',
        additions: 1,
        deletions: 0,
      },
    ];

    vi.mocked(client.get)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const result = await getPRFiles(client, 'owner', 'repo', 42);

    expect(result).toHaveLength(101);
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(client.get).toHaveBeenCalledWith(
      'repos/owner/repo/pulls/42/files?per_page=100&page=1',
    );
    expect(client.get).toHaveBeenCalledWith(
      'repos/owner/repo/pulls/42/files?per_page=100&page=2',
    );
  });

  it('handles null/undefined filename and status', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce([
      {
        filename: undefined,
        status: undefined,
        additions: 0,
        deletions: 0,
      },
    ]);

    const result = await getPRFiles(client, 'owner', 'repo', 42);
    expect(result[0]!.filename).toBe('');
    expect(result[0]!.status).toBe('');
  });

  it('handles renamed files with previous_filename', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce([
      {
        filename: 'src/new-name.ts',
        status: 'renamed',
        additions: 0,
        deletions: 0,
        previous_filename: 'src/old-name.ts',
        sha: 'abc',
      },
    ]);

    const result = await getPRFiles(client, 'owner', 'repo', 42);

    expect(result[0]!.previousFilename).toBe('src/old-name.ts');
    expect(result[0]!.status).toBe('renamed');
  });
});

describe('getCommitFiles', () => {
  it('fetches file changes for a specific commit', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      files: [
        {
          filename: 'src/utils.ts',
          status: 'modified',
          additions: 5,
          deletions: 3,
          patch: '@@ ...',
          sha: 'xyz',
        },
      ],
    });

    const result = await getCommitFiles(client, 'owner', 'repo', 'abc123');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      filename: 'src/utils.ts',
      status: 'modified',
      additions: 5,
      deletions: 3,
      patch: '@@ ...',
      previousFilename: undefined,
      sha: 'xyz',
    });

    expect(client.get).toHaveBeenCalledWith('repos/owner/repo/commits/abc123');
  });

  it('returns empty array when files is undefined', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({});

    const result = await getCommitFiles(client, 'owner', 'repo', 'abc123');

    expect(result).toEqual([]);
  });

  it('handles null/undefined filename and status in commit files', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      files: [
        {
          filename: undefined,
          status: undefined,
          additions: 0,
          deletions: 0,
        },
      ],
    });

    const result = await getCommitFiles(client, 'owner', 'repo', 'abc123');

    expect(result[0]!.filename).toBe('');
    expect(result[0]!.status).toBe('');
  });
});

describe('getOpenPRs edge cases', () => {
  it('handles null user/head/base/labels in PR DTO', async () => {
    const client = createMockClient();
    const minimalDto = {
      number: 99,
      title: 'Minimal PR',
      body: null,
      state: 'open',
      html_url: 'https://github.com/o/r/pull/99',
      created_at: '2025-01-15T10:00:00Z',
      updated_at: '2025-01-16T10:00:00Z',
      closed_at: null,
      merged_at: null,
      draft: false,
      mergeable: null,
      comments: 0,
      review_comments: 0,
      additions: 0,
      deletions: 0,
      changed_files: 0,
      commits: 0,
      user: null,
      head: null,
      base: null,
      labels: null,
      requested_reviewers: null,
    };

    vi.mocked(client.get)
      .mockResolvedValueOnce([minimalDto]) // list
      .mockResolvedValueOnce({ ...minimalDto, mergeable: null, mergeable_state: 'unknown', requested_reviewers: null }) // detail
      .mockResolvedValueOnce([]); // reviews

    const result = await getOpenPRs(client, 'o', 'r');

    expect(result).toHaveLength(1);
    const pr = result[0]!;
    expect(pr.authorLogin).toBe('');
    expect(pr.headRef).toBe('');
    expect(pr.baseRef).toBe('');
    expect(pr.labels).toEqual([]);
    expect(pr.requestedReviewers).toEqual([]);
    expect(pr.body).toBe('');
  });

  it('maps mergeable_state clean to mergeable true', async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce([fakePrDto])
      .mockResolvedValueOnce({ ...fakePrDto, mergeable: null, mergeable_state: 'clean' })
      .mockResolvedValueOnce([]);

    const result = await getOpenPRs(client, 'owner', 'repo');
    expect(result[0]!.mergeable).toBe(true);
  });

  it('maps mergeable_state dirty to mergeable false', async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce([fakePrDto])
      .mockResolvedValueOnce({ ...fakePrDto, mergeable: null, mergeable_state: 'dirty' })
      .mockResolvedValueOnce([]);

    const result = await getOpenPRs(client, 'owner', 'repo');
    expect(result[0]!.mergeable).toBe(false);
  });

  it('maps mergeable_state unstable to mergeable true', async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce([fakePrDto])
      .mockResolvedValueOnce({ ...fakePrDto, mergeable: null, mergeable_state: 'unstable' })
      .mockResolvedValueOnce([]);

    const result = await getOpenPRs(client, 'owner', 'repo');
    expect(result[0]!.mergeable).toBe(true);
  });

  it('maps mergeable_state has_hooks to mergeable true', async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce([fakePrDto])
      .mockResolvedValueOnce({ ...fakePrDto, mergeable: null, mergeable_state: 'has_hooks' })
      .mockResolvedValueOnce([]);

    const result = await getOpenPRs(client, 'owner', 'repo');
    expect(result[0]!.mergeable).toBe(true);
  });

  it('maps unknown mergeable_state to undefined', async () => {
    const client = createMockClient();
    vi.mocked(client.get)
      .mockResolvedValueOnce([fakePrDto])
      .mockResolvedValueOnce({ ...fakePrDto, mergeable: null, mergeable_state: 'unknown' })
      .mockResolvedValueOnce([]);

    const result = await getOpenPRs(client, 'owner', 'repo');
    expect(result[0]!.mergeable).toBeUndefined();
  });

  it('filters out empty label names', async () => {
    const client = createMockClient();
    const dtoWithEmptyLabels = {
      ...fakePrDto,
      labels: [{ name: 'bug' }, { name: '' }, { name: 'urgent' }],
    };
    vi.mocked(client.get)
      .mockResolvedValueOnce([dtoWithEmptyLabels])
      .mockResolvedValueOnce({ ...dtoWithEmptyLabels, requested_reviewers: [] })
      .mockResolvedValueOnce([]);

    const result = await getOpenPRs(client, 'owner', 'repo');

    expect(result[0]!.labels).toEqual(['bug', 'urgent']);
  });

  it('maps closedAt and mergedAt correctly', async () => {
    const client = createMockClient();
    const closedDto = {
      ...fakePrDto,
      closed_at: '2025-02-01T00:00:00Z',
      merged_at: '2025-02-01T00:00:00Z',
    };
    vi.mocked(client.get).mockResolvedValueOnce([closedDto]);

    const result = await getClosedPRs(client, 'owner', 'repo');

    expect(result[0]!.closedAt).toBe('2025-02-01T00:00:00Z');
    expect(result[0]!.mergedAt).toBe('2025-02-01T00:00:00Z');
  });

  it('handles null comments and review_comments', async () => {
    const client = createMockClient();
    const dto = {
      ...fakePrDto,
      comments: undefined,
      review_comments: undefined,
    };
    vi.mocked(client.get)
      .mockResolvedValueOnce([dto])
      .mockResolvedValueOnce({ ...dto, requested_reviewers: [] })
      .mockResolvedValueOnce([]);

    const result = await getOpenPRs(client, 'owner', 'repo');
    expect(result[0]!.commentCount).toBe(0);
  });

  it('maps DTO with all nullable fields to default values via getClosedPRs', async () => {
    const client = createMockClient();
    const nullishDto = {
      number: 1,
      title: undefined,
      body: null,
      state: undefined,
      html_url: undefined,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      closed_at: null,
      merged_at: null,
      draft: false,
      mergeable: null,
      comments: undefined,
      review_comments: undefined,
      additions: 0,
      deletions: 0,
      changed_files: 0,
      commits: 0,
      user: null,
      head: null,
      base: null,
      labels: null,
      requested_reviewers: null,
    };
    vi.mocked(client.get).mockResolvedValueOnce([nullishDto]);

    const result = await getClosedPRs(client, 'o', 'r');

    expect(result).toHaveLength(1);
    const pr = result[0]!;
    expect(pr.title).toBe('');
    expect(pr.authorLogin).toBe('');
    expect(pr.authorAvatarUrl).toBe('');
    expect(pr.headRef).toBe('');
    expect(pr.baseRef).toBe('');
    expect(pr.state).toBe('open'); // dto.state undefined falls back to 'open'
    expect(pr.htmlUrl).toBe('');
    expect(pr.body).toBe('');
    expect(pr.mergeable).toBeUndefined();
    expect(pr.commentCount).toBe(0);
    expect(pr.labels).toEqual([]);
    expect(pr.requestedReviewers).toEqual([]);
    expect(pr.mergedAt).toBeUndefined();
    expect(pr.closedAt).toBeUndefined();
  });
});
