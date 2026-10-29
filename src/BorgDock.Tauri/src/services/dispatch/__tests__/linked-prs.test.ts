import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOverview } from '../engine';
import {
  candidateRepositories,
  type FetchedPullRequest,
  lookUpLinkedPullRequests,
  resetLinkedPullRequests,
} from '../linked-prs';
import { mergePullRequests } from '../sync';
import { makeItem, makeKnownPr, makeThread, makeThreadPr } from './fixtures';

vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => null }));

const HORIZON_ID = '5198258a-0e41-4ead-bfba-fe91fe35ceeb';
const NOW = Date.parse('2026-10-15T10:00:00Z');

function fetched(
  overrides: Partial<FetchedPullRequest> & { number: number; repo?: string },
): FetchedPullRequest {
  const { repo = 'gomocha-fsp/fsp-horizon', ...rest } = overrides;
  return {
    url: `https://github.com/${repo}/pull/${overrides.number}`,
    title: '',
    body: null,
    state: 'OPEN',
    isDraft: false,
    mergedAt: null,
    headRefName: null,
    reviewDecision: null,
    ...rest,
  };
}

/** GitHub as a table: `repo -> pull requests`; records every question. */
function gitHub(table: Record<string, FetchedPullRequest[]>) {
  const asked: { repository: string; numbers: number[]; withBody: boolean }[] = [];
  const fetch = vi.fn(async (repository: string, numbers: readonly number[], withBody: boolean) => {
    asked.push({ repository, numbers: [...numbers], withBody });
    return (table[repository] ?? []).filter((pr) => numbers.includes(pr.number));
  });
  return { fetch, asked };
}

const items = [
  makeItem({
    id: 60107,
    state: 'Code Review',
    linkedPullRequests: [{ repositoryId: HORIZON_ID, number: 4908 }],
  }),
  makeItem({
    id: 58138,
    state: 'Development In Progress',
    linkedPullRequests: [{ repositoryId: HORIZON_ID, number: 5002 }],
  }),
];

const horizon = [
  fetched({
    number: 4908,
    state: 'MERGED',
    mergedAt: '2026-10-13T09:00:00Z',
    title: 'refactor(imaging): replace Magick.NET with FSP.Imaging (AB#60107)',
  }),
  fetched({ number: 5002, headRefName: 'feat/58138-ai-summary', reviewDecision: 'APPROVED' }),
];
// The same numbers in another repository are other pull requests.
const shop = [
  fetched({ number: 4908, repo: 'acme/shop', title: 'chore: bump deps' }),
  fetched({ number: 5002, repo: 'acme/shop', title: 'fix: typo' }),
];

describe('lookUpLinkedPullRequests', () => {
  beforeEach(() => {
    resetLinkedPullRequests();
  });

  it('learns the repository whose pull requests name the items that link them', async () => {
    const { fetch } = gitHub({ 'acme/shop': shop, 'gomocha-fsp/fsp-horizon': horizon });
    const found = await lookUpLinkedPullRequests(
      items,
      ['acme/shop', 'gomocha-fsp/fsp-horizon'],
      {},
      fetch,
      NOW,
    );
    expect(found.repositories).toEqual({ [HORIZON_ID]: 'gomocha-fsp/fsp-horizon' });
    expect(found.pullRequests.map((pr) => [pr.number, pr.state, pr.workItemIds])).toEqual([
      [4908, 'merged', [60107]],
      [5002, 'open', [58138]],
    ]);
    expect(found.pullRequests[1]?.approved).toBe(true);
  });

  it('reads a merged pull request once and an open one again after a few minutes', async () => {
    const { fetch, asked } = gitHub({ 'gomocha-fsp/fsp-horizon': horizon });
    const known = { [HORIZON_ID]: 'gomocha-fsp/fsp-horizon' };
    await lookUpLinkedPullRequests(items, [], known, fetch, NOW);
    await lookUpLinkedPullRequests(items, [], known, fetch, NOW + 60_000);
    await lookUpLinkedPullRequests(items, [], known, fetch, NOW + 6 * 60_000);
    expect(asked.map((q) => q.numbers)).toEqual([[4908, 5002], [5002]]);
  });

  it('leaves out a repository no configured one matches, and does not ask again soon', async () => {
    const { fetch, asked } = gitHub({ 'acme/shop': shop });
    const first = await lookUpLinkedPullRequests(items, ['acme/shop'], {}, fetch, NOW);
    await lookUpLinkedPullRequests(items, ['acme/shop'], {}, fetch, NOW + 60_000);
    expect(first).toEqual({ pullRequests: [], repositories: {} });
    expect(asked).toHaveLength(1);
  });
});

describe('candidateRepositories', () => {
  it('resolves a merged PR outside the polled repositories instead of retaining a stale thread state', async () => {
    resetLinkedPullRequests();
    const url = 'https://github.com/Gomocha-FSP/FSP/pull/1183';
    const item = makeItem({
      id: 53748,
      state: 'Code Review',
      linkedPullRequests: [{ repositoryId: 'fsp-id', number: 1183 }],
    });
    const threadPr = makeThreadPr({ number: 1183, url, title: 'AB#53748 Display users' });
    const candidates = candidateRepositories([], [url]);
    const { fetch } = gitHub({
      'Gomocha-FSP/FSP': [
        fetched({
          number: 1183,
          url,
          title: threadPr.title,
          state: 'MERGED',
          mergedAt: '2026-10-20T13:38:06Z',
        }),
      ],
    });
    await lookUpLinkedPullRequests([item], [], {}, fetch, NOW);
    const found = await lookUpLinkedPullRequests([item], candidates, {}, fetch, NOW + 60_000);
    const { overview } = buildOverview({
      items: [item],
      threads: [
        makeThread({ id: 'old', title: 'AB#53748', open: false, pullRequests: [threadPr] }),
      ],
      pullRequests: found.pullRequests,
      queued: new Set(),
      hiddenSuggestions: new Set(),
      manualLinks: new Map(),
    });
    expect(found.pullRequests[0]?.state).toBe('merged');
    expect(overview.items[0]?.pullRequests[0]?.state).toBe('merged');
  });
  it('takes the enabled repositories with a plain owner and name', () => {
    const repo = { worktreeBasePath: '', worktreeSubfolder: '' };
    expect(
      candidateRepositories([
        { ...repo, owner: 'Gomocha-FSP', name: 'fsp-horizon', enabled: true },
        { ...repo, owner: 'git@github-borghtdev:borght-dev', name: 'BorgDock', enabled: true },
        { ...repo, owner: 'acme', name: 'shop', enabled: false },
      ]),
    ).toEqual(['Gomocha-FSP/fsp-horizon']);
  });
});

describe('mergePullRequests', () => {
  it('keeps the polled pull request and adds the items that link it', () => {
    const polled = makeKnownPr({ number: 5002, workItemIds: [], checks: GREEN });
    const linked = makeKnownPr({ number: 5002, workItemIds: [58138] });
    const other = makeKnownPr({ number: 4908, state: 'merged', workItemIds: [60107] });
    expect(mergePullRequests([polled], [linked, other])).toEqual([
      { ...polled, workItemIds: [58138] },
      other,
    ]);
  });
});

const GREEN = { passed: 3, failed: 0, pending: 0, total: 3 };
