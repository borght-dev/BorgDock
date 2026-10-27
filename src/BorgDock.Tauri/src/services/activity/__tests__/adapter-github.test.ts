import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeJournal } from './fake-journal';

const mocks = vi.hoisted(() => ({
  journal: null as unknown as FakeJournal,
  login: 'koen' as string | null,
  lookups: [] as number[][],
  findings: [] as number[],
  failFindings: false,
}));

vi.mock('@/services/activity/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/activity/api')>();
  return {
    ...actual,
    openSource: (request: Parameters<FakeJournal['openSource']>[0]) =>
      mocks.journal.openSource(request),
    commit: (request: Parameters<FakeJournal['commit']>[0]) => mocks.journal.commit(request),
  };
});
vi.mock('@/services/github/login', () => ({
  resolvedLogin: () => Promise.resolve(mocks.login),
}));
vi.mock('@/services/github/pr-lookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/github/pr-lookup')>();
  return {
    ...actual,
    lookUpPullRequests: (targets: { owner: string; repo: string; number: number }[]) => {
      mocks.lookups.push(targets.map((t) => t.number));
      return Promise.resolve(
        new Map(
          targets.map((t) => [
            actual.targetKey(t),
            {
              status: 'found' as const,
              readAt: 0,
              checkedAt: 0,
              failing: null,
              pullRequest: {
                number: t.number,
                url: `https://github.com/${t.owner}/${t.repo}/pull/${t.number}`,
                title: `PR ${t.number}`,
                state: 'merged' as const,
                isDraft: false,
                mergedAt: '2026-10-27T09:00:00Z',
                closedAt: '2026-10-27T09:00:00Z',
                headRefName: null,
                baseRefName: null,
                headSha: null,
                approved: true,
                conflicting: false,
                checks: null,
                repositoryId: 'R',
                nameWithOwner: `${t.owner}/${t.repo}`,
                authorLogin: 'koen',
                mergedBy: 'ann',
                mergeCommitSha: 'm1',
              },
            },
          ]),
        ),
      );
    },
  };
});
vi.mock('@/services/github/reviews', () => ({
  getBotReviewComments: (_c: unknown, _o: string, _r: string, number: number) => {
    mocks.findings.push(number);
    if (mocks.failFindings) {
      mocks.failFindings = false;
      return Promise.reject(new Error('rate limited'));
    }
    return Promise.resolve([]);
  },
}));
vi.mock('@/services/ci-failures/store-api', () => ({
  loadPr: () => Promise.resolve({ occurrences: [], groups: [] }),
}));

import { makePr } from '@/components/focus/__tests__/helpers';
import type { GitHubClient } from '@/services/github/client';
import { usePrStore } from '@/stores/pr-store';
import type { PullRequestWithChecks } from '@/types';
import { type FreshRepository, ingestGitHubPoll } from '../adapters/github';
import { resetActivityIngest } from '../ingest';

const client = { account: '' } as GitHubClient;

function pr(number: number, overrides: Partial<PullRequestWithChecks['pullRequest']> = {}) {
  return makePr({
    number,
    authorLogin: 'koen',
    repoOwner: 'acme',
    repoName: 'app',
    createdAt: '2026-10-01T00:00:00Z',
    htmlUrl: `https://github.com/acme/app/pull/${number}`,
    ...overrides,
  });
}

const app: FreshRepository = { owner: 'acme', name: 'app', account: '', path: 'graphql' };

async function poll(
  results: PullRequestWithChecks[],
  repositories: FreshRepository[] = [app],
  startedAt = Date.now(),
) {
  await ingestGitHubPoll({ repositories, results, startedAt, clientFor: () => client });
}

const gitHubCommits = () => mocks.journal.commits.filter((c) => c.sourceId.startsWith('gh:'));
const gitHubSources = () => [...mocks.journal.sources.keys()].filter((id) => id.startsWith('gh:'));

let clock = Date.parse('2026-10-27T10:00:00Z');
const tick = () => (clock += 60_000);

beforeEach(() => {
  mocks.journal = new FakeJournal();
  mocks.login = 'koen';
  mocks.lookups = [];
  mocks.findings = [];
  resetActivityIngest();
  usePrStore.setState({ closedPullRequests: [] });
});

describe('the GitHub adapter', () => {
  it('adds nothing for a repository the poll did not read fresh', async () => {
    await poll([pr(1)], [app], tick());
    await poll([pr(1, { mergeable: false })], [], tick());
    expect(gitHubCommits()).toHaveLength(1);
    expect(mocks.journal.entries.size).toBe(0);
  });

  it('keys the source by the login the client reads with, so a switch seeds quietly', async () => {
    await poll([pr(1)], [app], tick());
    expect(gitHubSources()).toEqual(['gh:github.com|koen|acme/app']);
    mocks.login = 'koen-work';
    await poll([pr(1, { authorLogin: 'koen-work', mergeable: false })], [app], tick());
    expect(gitHubSources()).toContain('gh:github.com|koen-work|acme/app');
    expect(mocks.journal.entries.size).toBe(0);
  });

  it('keeps the same PR number in two repositories on two accounts apart', async () => {
    const api: FreshRepository = { owner: 'acme', name: 'api', account: 'koen', path: 'graphql' };
    const both = [pr(7), pr(7, { repoName: 'api', htmlUrl: 'https://github.com/acme/api/pull/7' })];
    await poll(both, [app, api], tick());
    const conflicted = both.map((p) => ({
      ...p,
      pullRequest: { ...p.pullRequest, mergeable: false },
    }));
    await poll(conflicted, [app, api], tick());
    const keys = [...mocks.journal.entries.values()].map((e) => e.entityKey).sort();
    expect(keys).toEqual(['gh:acme/api#7', 'gh:acme/app#7']);
  });

  it('verifies at most ten vanished PRs per poll and joins merges to the closed list', async () => {
    const many = Array.from({ length: 14 }, (_, i) => pr(i + 1));
    await poll(many, [app], tick());
    await poll([], [app], tick());
    expect(mocks.lookups[0]).toHaveLength(10);
    const merged = [...mocks.journal.entries.values()].filter((e) => e.category === 'pr.merged');
    expect(merged).toHaveLength(10);
    expect(usePrStore.getState().closedPullRequests).toHaveLength(10);
    await poll([], [app], tick());
    expect(mocks.lookups[1]).toHaveLength(4);
  });

  it('reads findings for at most three PRs per poll', async () => {
    const mine = Array.from({ length: 5 }, (_, i) => pr(i + 1));
    await poll(mine, [app], tick());
    const commented = mine.map((p) => ({
      ...p,
      pullRequest: { ...p.pullRequest, commentCount: 2 },
    }));
    await poll(commented, [app], tick());
    expect(mocks.findings).toHaveLength(3);
    await poll(commented, [app], tick());
    expect(mocks.findings).toHaveLength(5);
  });

  it('reads findings again after a read that failed', async () => {
    await poll([pr(1)], [app], tick());
    const commented = pr(1, { commentCount: 2 });
    mocks.failFindings = true;
    await poll([commented], [app], tick());
    await poll([commented], [app], tick());
    expect(mocks.findings).toEqual([1, 1]);
    await poll([commented], [app], tick());
    expect(mocks.findings).toEqual([1, 1]);
  });

  it('seeds the deployments of a repository before it has any, so the first one counts', async () => {
    await poll([pr(1, { createdAt: '2026-10-27T09:00:00Z' })], [app], tick());
    expect(mocks.journal.sources.has('deploy:github.com|koen|acme/app')).toBe(true);
    const deployed = {
      ...pr(1, { createdAt: '2026-10-27T09:00:00Z' }),
      headDeployments: [
        {
          id: 5,
          environment: 'staging-1',
          // After the seed, which the fake journal stamps with the real clock.
          createdAt: new Date(Date.now() + 60_000).toISOString(),
          status: {
            id: 'S1',
            state: 'success',
            createdAt: new Date(Date.now() + 70_000).toISOString(),
            logUrl: 'https://github.com/acme/app/actions/runs/5',
            environmentUrl: null,
          },
        },
      ],
    };
    await poll([deployed], [app], tick());
    expect(mocks.journal.categories()).toContain('deploy.pr');
  });

  it('adds no review entries from a REST read', async () => {
    await poll([pr(1)], [app], tick());
    const reviewed = pr(1, {
      latestReviews: [{ id: 99, authorLogin: 'ann', state: 'changesRequested' }],
    });
    await poll([reviewed], [{ ...app, path: 'rest' }], tick());
    expect(mocks.journal.entries.size).toBe(0);
    await poll([reviewed], [app], tick());
    expect(mocks.journal.categories()).toEqual(['pr.review']);
  });
});
