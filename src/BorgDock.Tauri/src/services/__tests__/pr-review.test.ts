import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_ME, listPr } from '@/components/pr/__fixtures__/pr-list-data';
import type { GitHubClient } from '@/services/github/client';
import { enableAutoMerge, submitReview } from '@/services/github/mutations';
import { workbenchPrimaryAction } from '@/services/pr-action-resolver';
import { usePrStore } from '@/stores/pr-store';
import { submitPrReview } from '../pr-review';

vi.mock('@/services/github/mutations', () => ({ submitReview: vi.fn(), enableAutoMerge: vi.fn() }));
const client = { account: 'another-account' } as GitHubClient;
const pr = () => usePrStore.getState().pullRequests[0]!;
const args: Parameters<typeof submitReview> = [
  client,
  'acme',
  'app',
  41,
  'APPROVE',
  '',
  { commit_id: 'reviewed-head', comments: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  const candidate = listPr({
    number: 41,
    title: 'Ready after my review',
    repo: 'acme/app',
    author: 'mira',
    requestedReviewers: [FIXTURE_ME],
    reviewStatus: 'pending',
  });
  candidate.pullRequest.headSha = 'reviewed-head';
  candidate.pullRequest.requestedTeams = ['platform'];
  usePrStore.setState({
    pullRequests: [candidate],
    closedPullRequests: [],
    username: FIXTURE_ME,
    teams: ['platform'],
  });
  vi.spyOn(usePrStore.getState(), 'refreshPr').mockResolvedValue(null);
  vi.mocked(submitReview).mockResolvedValue({ authorLogin: FIXTURE_ME, state: 'approved' });
  vi.mocked(enableAutoMerge).mockResolvedValue('enabled');
});

describe('submitted approval updates', () => {
  it('changes Review to Merge immediately using the submitting account, including team requests', async () => {
    expect(workbenchPrimaryAction(pr(), FIXTURE_ME, ['platform'])).toBe('review');
    await submitPrReview(...args);
    expect(workbenchPrimaryAction(pr(), FIXTURE_ME, ['platform'])).toBe('merge');
    expect(usePrStore.getState().needsMyReview()).toEqual([]);
    expect(pr().pullRequest.requestedTeams).toEqual(['platform']);
    expect(enableAutoMerge).not.toHaveBeenCalled();
  });

  it('approves before enabling auto merge, and remembers that it is enabled', async () => {
    await submitPrReview(...args, true);
    expect(enableAutoMerge).toHaveBeenCalledWith(client, 'acme', 'app', 41, 'reviewed-head');
    expect(vi.mocked(submitReview).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(enableAutoMerge).mock.invocationCallOrder[0]!,
    );
    expect(pr().pullRequest.autoMergeEnabled).toBe(true);
  });

  it('keeps the approval when auto merge fails, without inviting a duplicate review', async () => {
    vi.mocked(enableAutoMerge).mockRejectedValue(
      new Error('Auto merge is disabled for this repository'),
    );
    const result = await submitPrReview(...args, true);
    expect(result.autoMergeError).toBeInstanceOf(Error);
    expect(workbenchPrimaryAction(pr(), FIXTURE_ME)).toBe('merge');
    expect(submitReview).toHaveBeenCalledTimes(1);
  });

  it('does not enable auto merge or change review state when approval fails', async () => {
    vi.mocked(submitReview).mockRejectedValue(new Error('Forbidden'));
    await expect(submitPrReview(...args, true)).rejects.toThrow('Forbidden');
    expect(workbenchPrimaryAction(pr(), FIXTURE_ME)).toBe('review');
    expect(enableAutoMerge).not.toHaveBeenCalled();
  });

  it('does not approve a newer head that arrived while submission was in flight', async () => {
    const current = pr();
    usePrStore.setState({
      pullRequests: [{ ...current, pullRequest: { ...current.pullRequest, headSha: 'new-head' } }],
    });
    await submitPrReview(...args);
    expect(workbenchPrimaryAction(pr(), FIXTURE_ME)).toBe('review');
  });

  it('moves a PR that merged immediately into the closed list', async () => {
    vi.mocked(enableAutoMerge).mockResolvedValue('merged');
    await submitPrReview(...args, true);
    expect(usePrStore.getState().pullRequests).toEqual([]);
    expect(usePrStore.getState().closedPullRequests[0]?.pullRequest.mergedAt).toBeTruthy();
  });
});
