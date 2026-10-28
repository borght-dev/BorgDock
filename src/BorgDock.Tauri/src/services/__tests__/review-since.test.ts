import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '@/services/github/client';
import { getReviews } from '@/services/github/reviews';
import type { PullRequest } from '@/types';
import { lastReviewBy, loadReviewSince } from '../review-since';

vi.mock('@/services/github/reviews', () => ({ getReviews: vi.fn() }));

const review = (
  overrides: Partial<{
    state: string;
    body: string | null;
    submitted_at: string;
    login: string;
    commit_id: string;
  }>,
) => ({
  id: 1,
  state: overrides.state ?? 'APPROVED',
  body: overrides.body ?? null,
  submitted_at: overrides.submitted_at ?? '2026-10-01T00:00:00Z',
  user: { login: overrides.login ?? 'koen' },
  commit_id: overrides.commit_id ?? 'aaa1111',
});

describe('lastReviewBy', () => {
  it("takes the viewer's newest whole-PR review, ignoring case", () => {
    const last = lastReviewBy(
      [
        review({ state: 'APPROVED', submitted_at: '2026-10-01T00:00:00Z', commit_id: 'aaa1111' }),
        review({
          state: 'CHANGES_REQUESTED',
          body: 'Fix it',
          submitted_at: '2026-10-03T00:00:00Z',
          commit_id: 'bbb2222',
          login: 'Koen',
        }),
        review({ login: 'someone-else', submitted_at: '2026-10-05T00:00:00Z' }),
      ],
      'koen',
    );
    expect(last).toEqual({
      state: 'CHANGES_REQUESTED',
      commitId: 'bbb2222',
      submittedAt: '2026-10-03T00:00:00Z',
      body: 'Fix it',
    });
  });

  it('skips thread replies: comment reviews without an overall comment', () => {
    const last = lastReviewBy(
      [
        review({ state: 'APPROVED', commit_id: 'aaa1111' }),
        review({ state: 'COMMENTED', body: '', submitted_at: '2026-10-09T00:00:00Z' }),
        review({ state: 'DISMISSED', submitted_at: '2026-10-10T00:00:00Z' }),
      ],
      'koen',
    );
    expect(last?.commitId).toBe('aaa1111');
  });
});

describe('loadReviewSince', () => {
  const pr = {
    repoOwner: 'o',
    repoName: 'r',
    number: 7,
    headSha: 'head999',
  } as PullRequest;

  function client(compare: unknown) {
    return { get: vi.fn().mockResolvedValue(compare) } as unknown as GitHubClient;
  }

  it('compares the reviewed commit with the head and keeps the PR files it touched', async () => {
    vi.mocked(getReviews).mockResolvedValue([review({ commit_id: 'old1234' })]);
    const github = client({
      status: 'ahead',
      ahead_by: 2,
      commits: [{ commit: { message: 'First' } }, { commit: { message: 'Second\n\nbody' } }],
      files: [
        {
          filename: 'a.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: '@@ -1 +1,2 @@',
        },
        { filename: 'merged-from-base.ts', status: 'modified', additions: 1, deletions: 0 },
      ],
    });
    const since = await loadReviewSince(github, pr, 'koen', ['a.ts', 'b.ts']);
    expect(github.get).toHaveBeenCalledWith('repos/o/r/compare/old1234...head999');
    expect(since?.commits).toBe(2);
    expect(since?.latestMessage).toBe('Second');
    expect(since?.files?.map((f) => f.filename)).toEqual(['a.ts']);
  });

  it('has no files when the branch was rewritten since the review', async () => {
    vi.mocked(getReviews).mockResolvedValue([review({ commit_id: 'old1234' })]);
    const since = await loadReviewSince(
      client({ status: 'diverged', ahead_by: 3, commits: [] }),
      pr,
      'koen',
      ['a.ts'],
    );
    expect(since?.files).toBeNull();
  });

  it('is null on a first review or when the review was on the head', async () => {
    vi.mocked(getReviews).mockResolvedValue([]);
    expect(await loadReviewSince(client({}), pr, 'koen', [])).toBeNull();
    vi.mocked(getReviews).mockResolvedValue([review({ commit_id: 'head999' })]);
    expect(await loadReviewSince(client({}), pr, 'koen', [])).toBeNull();
  });
});
