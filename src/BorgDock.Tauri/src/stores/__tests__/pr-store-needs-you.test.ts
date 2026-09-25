import { beforeEach, describe, expect, it } from 'vitest';
import { FIXTURE_ME, workbenchPrs } from '@/components/pr/__fixtures__/pr-list-data';
import { matchesPrFilter, usePrStore } from '../pr-store';

const NOW = Date.parse('2026-09-25T12:00:00Z');

describe('pr-store: the Workbench "Needs you" filter', () => {
  beforeEach(() => {
    usePrStore.setState({
      pullRequests: workbenchPrs(NOW),
      closedPullRequests: [],
      filter: 'all',
      searchQuery: '',
      sortBy: 'updated',
      username: FIXTURE_ME,
      teams: [],
    });
  });

  it('counts needsYou next to the existing filters', () => {
    const counts = usePrStore.getState().counts();
    expect(counts.all).toBe(18);
    expect(counts.needsYou).toBe(6);
    expect(counts.mine).toBe(6);
    expect(counts.failing).toBe(2);
    // "Needs review" is only the review requests.
    expect(counts.needsReview).toBe(4);
  });

  it('filters the list to the PRs that need me', () => {
    usePrStore.getState().setFilter('needsYou');
    const numbers = usePrStore
      .getState()
      .filteredPrs()
      .map((p) => p.pullRequest.number)
      .sort((a, b) => a - b);
    expect(numbers).toEqual([86, 88, 458, 471, 479, 3668]);
  });

  it('matchesPrFilter agrees with the filtered list for every Workbench filter', () => {
    const state = usePrStore.getState();
    for (const filter of ['all', 'needsYou', 'mine', 'failing'] as const) {
      usePrStore.getState().setFilter(filter);
      const expected = usePrStore
        .getState()
        .filteredPrs()
        .map((p) => p.pullRequest.number)
        .sort((a, b) => a - b);
      const actual = state.pullRequests
        .filter((pr) => matchesPrFilter(pr, filter, FIXTURE_ME, []))
        .map((p) => p.pullRequest.number)
        .sort((a, b) => a - b);
      expect(actual).toEqual(expected);
    }
  });

  it('never matches an open PR against the closed filter', () => {
    const pr = usePrStore.getState().pullRequests[0]!;
    expect(matchesPrFilter(pr, 'closed', FIXTURE_ME)).toBe(false);
  });
});
