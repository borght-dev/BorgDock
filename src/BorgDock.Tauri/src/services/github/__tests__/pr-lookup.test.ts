import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../client';
import { isDue, type LookupResult, lookUpPullRequests, targetKey } from '../pr-lookup';

const NOW = 1_000_000;

function graphPr(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    url: `https://github.com/acme/shop/pull/${number}`,
    title: `PR ${number}`,
    state: 'OPEN',
    isDraft: false,
    mergedAt: null,
    closedAt: null,
    headRefName: 'feature',
    baseRefName: 'master',
    headRefOid: 'abc',
    reviewDecision: 'APPROVED',
    mergeable: 'MERGEABLE',
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
    ...overrides,
  };
}

function clientAnswering(answer: (query: string) => unknown) {
  const graphql = vi.fn(async (query: string) => answer(query));
  return { client: { graphql } as unknown as GitHubClient, graphql };
}

const target = (number: number, repo = 'shop') => ({ owner: 'acme', repo, number });

describe('lookUpPullRequests', () => {
  it('reads every pull request of one repository in one query', async () => {
    const { client, graphql } = clientAnswering(() => ({
      repository: {
        id: 'R_1',
        nameWithOwner: 'acme/shop',
        p12: graphPr(12),
        p15: graphPr(15, { state: 'MERGED' }),
      },
    }));
    const results = await lookUpPullRequests(
      [target(12), target(15)],
      () => client,
      new Map(),
      NOW,
    );
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(results.get(targetKey(target(12)))).toMatchObject({
      status: 'found',
      pullRequest: {
        state: 'open',
        checks: 'passed',
        approved: true,
        repositoryId: 'R_1',
        baseRefName: 'master',
      },
    });
    expect(results.get(targetKey(target(15)))).toMatchObject({ pullRequest: { state: 'merged' } });
  });

  it('asks each repository separately, so #12 in two repositories stays apart', async () => {
    const { client, graphql } = clientAnswering((query) => ({
      repository: {
        id: query.includes('p12') ? 'R' : 'R',
        nameWithOwner: 'x',
        p12: graphPr(12, { title: 'same number' }),
      },
    }));
    const results = await lookUpPullRequests(
      [target(12), target(12, 'warehouse')],
      () => client,
      new Map(),
      NOW,
    );
    expect(graphql).toHaveBeenCalledTimes(2);
    expect(results.size).toBe(2);
  });

  it('a repository it can not see is no access, not missing', async () => {
    const { client } = clientAnswering(() => ({ repository: null }));
    const results = await lookUpPullRequests([target(12)], () => client, new Map(), NOW);
    expect(results.get(targetKey(target(12)))?.status).toBe('no-access');
  });

  it('calls a pull request missing only when GitHub leaves it out twice', async () => {
    const { client } = clientAnswering(() => ({
      repository: { id: 'R', nameWithOwner: 'acme/shop', p12: null },
    }));
    const first = await lookUpPullRequests([target(12)], () => client, new Map(), NOW);
    expect(first.get(targetKey(target(12)))).toMatchObject({ status: 'missing', confirmed: false });
    const second = await lookUpPullRequests([target(12)], () => client, first, NOW + 1);
    expect(second.get(targetKey(target(12)))).toMatchObject({ status: 'missing', confirmed: true });
  });

  it('keeps what it read before when GitHub fails, marked as failing', async () => {
    const ok = clientAnswering(() => ({
      repository: { id: 'R', nameWithOwner: 'acme/shop', p12: graphPr(12) },
    }));
    const before = await lookUpPullRequests([target(12)], () => ok.client, new Map(), NOW);
    const failing = clientAnswering(() => {
      throw new Error('network down');
    });
    const after = await lookUpPullRequests([target(12)], () => failing.client, before, NOW + 10);
    expect(after.get(targetKey(target(12)))).toMatchObject({
      status: 'found',
      readAt: NOW,
      checkedAt: NOW + 10,
      failing: 'network down',
    });
  });
});

describe('isDue', () => {
  const found = (state: string, failing: string | null = null): LookupResult => ({
    status: 'found',
    pullRequest: { state } as never,
    readAt: NOW,
    checkedAt: NOW,
    failing,
  });

  it('reads a merged pull request once', () => {
    expect(isDue(found('merged'), NOW + 10 * 86_400_000)).toBe(false);
  });

  it('reads an open one again after five minutes, a closed one after an hour', () => {
    expect(isDue(found('open'), NOW + 4 * 60_000)).toBe(false);
    expect(isDue(found('open'), NOW + 6 * 60_000)).toBe(true);
    expect(isDue(found('closed'), NOW + 30 * 60_000)).toBe(false);
    expect(isDue(found('closed'), NOW + 61 * 60_000)).toBe(true);
  });

  it('tries a failing one again within a minute', () => {
    expect(isDue(found('merged', 'down'), NOW + 61_000)).toBe(true);
  });
});
