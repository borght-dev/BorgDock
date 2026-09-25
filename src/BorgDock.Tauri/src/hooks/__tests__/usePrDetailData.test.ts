import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckRun, PullRequest, PullRequestWithChecks } from '@/types';

const { getCheckRunsForRef, getOpenPRs, loadCachedPRs, client } = vi.hoisted(() => ({
  getCheckRunsForRef: vi.fn(),
  getOpenPRs: vi.fn(),
  loadCachedPRs: vi.fn(),
  client: { id: 'client' },
}));

vi.mock('@/services/github/checks', () => ({ getCheckRunsForRef }));
vi.mock('@/services/github/pulls', () => ({ getOpenPRs }));
vi.mock('@/services/cache', () => ({ loadCachedPRs }));
vi.mock('@/services/github/singleton', () => ({
  getClient: () => client,
  getClientForRepo: () => client,
}));

import { PR_REFRESHED_EVENT, type PrRefreshedDetail, usePrStore } from '@/stores/pr-store';
import { usePrDetailData } from '../usePrDetailData';

const TARGET = { owner: 'acme', repo: 'app', number: 7 };

function pull(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 7,
    title: 'Add the thing',
    headRef: 'feat/thing',
    headSha: 'sha1',
    baseRef: 'main',
    authorLogin: 'mira',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2026-09-20T10:00:00Z',
    updatedAt: '2026-09-24T10:00:00Z',
    isDraft: false,
    mergeable: true,
    htmlUrl: 'https://github.com/acme/app/pull/7',
    body: '',
    repoOwner: 'acme',
    repoName: 'app',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    commitCount: 1,
    requestedReviewers: [],
    ...overrides,
  };
}

function withChecks(
  pr: PullRequest,
  over: Partial<PullRequestWithChecks> = {},
): PullRequestWithChecks {
  return {
    pullRequest: pr,
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
    totalCheckCount: 1,
    ...over,
  };
}

function run(id: number, name = `check ${id}`): CheckRun {
  return {
    id,
    name,
    status: 'completed',
    conclusion: 'success',
    htmlUrl: `https://github.com/acme/app/runs/${id}`,
    checkSuiteId: 1,
  };
}

describe('usePrDetailData', () => {
  beforeEach(() => {
    getCheckRunsForRef.mockReset().mockResolvedValue([run(1)]);
    getOpenPRs.mockReset().mockResolvedValue([]);
    loadCachedPRs.mockReset().mockResolvedValue([]);
    usePrStore.setState({ pullRequests: [], closedPullRequests: [] });
  });

  afterEach(() => {
    usePrStore.setState({ pullRequests: [], closedPullRequests: [] });
  });

  it('seeds from the main window list: no spinner, only the check runs are fetched', async () => {
    const listed = withChecks(pull());
    usePrStore.setState({ pullRequests: [listed] });

    const { result } = renderHook(() => usePrDetailData(TARGET));
    expect(result.current.pr).toBe(listed);
    expect(result.current.isLoading).toBe(false);

    await waitFor(() => expect(result.current.checks).toEqual([run(1)]));
    // By head commit, not branch: a fork PR's branch is not in this repo.
    expect(getCheckRunsForRef).toHaveBeenCalledWith(client, 'acme', 'app', 'sha1');
    expect(getOpenPRs).not.toHaveBeenCalled();
    expect(loadCachedPRs).not.toHaveBeenCalled();
  });

  it('seeds from the recently closed list too', () => {
    const closed = withChecks(pull({ state: 'closed', mergedAt: '2026-09-24T11:00:00Z' }));
    usePrStore.setState({ closedPullRequests: [closed] });
    const { result } = renderHook(() => usePrDetailData(TARGET));
    expect(result.current.pr).toBe(closed);
  });

  it('follows the poll: a replaced PR updates the view and changed checks refetch the runs', async () => {
    usePrStore.setState({ pullRequests: [withChecks(pull())] });
    const { result } = renderHook(() => usePrDetailData(TARGET));
    await waitFor(() => expect(getCheckRunsForRef).toHaveBeenCalledTimes(1));

    // Same checks, new title: the PR updates, no refetch.
    const retitled = withChecks(pull({ title: 'Add the thing, v2' }));
    act(() => usePrStore.setState({ pullRequests: [retitled] }));
    expect(result.current.pr?.pullRequest.title).toBe('Add the thing, v2');
    expect(getCheckRunsForRef).toHaveBeenCalledTimes(1);

    // New head commit and a failing check: the runs are refetched.
    getCheckRunsForRef.mockResolvedValue([run(2, 'build')]);
    const pushed = withChecks(pull({ headSha: 'sha2' }), {
      overallStatus: 'red',
      failedCheckNames: ['build'],
      failedCheckSuiteIds: [1],
      passedCount: 0,
    });
    act(() => usePrStore.setState({ pullRequests: [pushed] }));
    await waitFor(() => expect(result.current.checks).toEqual([run(2, 'build')]));
    expect(getCheckRunsForRef).toHaveBeenCalledTimes(2);
    expect(result.current.pr).toBe(pushed);
  });

  it('takes the PR and runs from a refresh event for this PR only', async () => {
    usePrStore.setState({ pullRequests: [withChecks(pull())] });
    const { result } = renderHook(() => usePrDetailData(TARGET));
    await waitFor(() => expect(result.current.checks).toEqual([run(1)]));

    const other: PrRefreshedDetail = {
      owner: 'acme',
      repo: 'site',
      number: 7,
      pr: withChecks(pull({ title: 'Other repo' })),
      checks: [run(9)],
    };
    act(() => {
      document.dispatchEvent(new CustomEvent(PR_REFRESHED_EVENT, { detail: other }));
    });
    expect(result.current.pr?.pullRequest.title).toBe('Add the thing');

    const fresh = withChecks(pull({ title: 'Refreshed' }));
    act(() => {
      document.dispatchEvent(
        new CustomEvent<PrRefreshedDetail>(PR_REFRESHED_EVENT, {
          detail: { ...TARGET, pr: fresh, checks: [run(3)] },
        }),
      );
    });
    expect(result.current.pr).toBe(fresh);
    expect(result.current.checks).toEqual([run(3)]);

    // An optimistic refresh without checks keeps the runs.
    const merged = withChecks(pull({ title: 'Refreshed', mergedAt: '2026-09-25T09:00:00Z' }));
    act(() => {
      document.dispatchEvent(
        new CustomEvent<PrRefreshedDetail>(PR_REFRESHED_EVENT, {
          detail: { ...TARGET, pr: merged },
        }),
      );
    });
    expect(result.current.pr).toBe(merged);
    expect(result.current.checks).toEqual([run(3)]);
  });

  it('loads a PR that is not in the list from GitHub, with a spinner first', async () => {
    getOpenPRs.mockResolvedValue([pull({ number: 6 }), pull()]);
    const { result } = renderHook(() => usePrDetailData(TARGET));
    expect(result.current.pr).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.pr?.pullRequest.number).toBe(7));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.checks).toEqual([run(1)]);
    expect(getOpenPRs).toHaveBeenCalledWith(client, 'acme', 'app');
    expect(loadCachedPRs).toHaveBeenCalledWith('acme', 'app');
  });

  it('shows the cached PR before GitHub answers', async () => {
    const cached = withChecks(pull({ title: 'From cache' }));
    loadCachedPRs.mockResolvedValue([cached]);
    getOpenPRs.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePrDetailData(TARGET));
    await waitFor(() => expect(result.current.pr).toBe(cached));
    expect(result.current.isLoading).toBe(false);
  });

  it('reports a PR that is nowhere to be found', async () => {
    const { result } = renderHook(() => usePrDetailData(TARGET));
    await waitFor(() => expect(result.current.error).toBe('PR #7 not found in acme/app'));
    expect(result.current.isLoading).toBe(false);
  });

  it('runs `prepare` first and uses the client it returns (the pop-out)', async () => {
    const own = { id: 'pop-out client' };
    const prepare = vi.fn().mockResolvedValue(own);
    getOpenPRs.mockResolvedValue([pull()]);
    const { result } = renderHook(() => usePrDetailData(TARGET, { prepare: prepare as never }));
    await waitFor(() => expect(result.current.pr).not.toBeNull());
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(getOpenPRs).toHaveBeenCalledWith(own, 'acme', 'app');
  });

  it('reports missing parameters', () => {
    const { result } = renderHook(() => usePrDetailData({ owner: '', repo: '', number: 0 }));
    expect(result.current.error).toBe('Missing PR parameters (owner, repo, number)');
  });
});
