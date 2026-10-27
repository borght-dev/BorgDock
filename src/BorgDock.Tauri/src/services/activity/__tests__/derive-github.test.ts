import { describe, expect, it } from 'vitest';
import {
  deriveGitHub,
  type GitHubBaseline,
  type GitHubObservation,
  type PrFacts,
  prsNeedingFindings,
  prsToVerify,
} from '../derive/github';
import { context, seedContext } from './context';

const SOURCE = 'gh:github.com|koen|acme/app';

function pr(overrides: Partial<PrFacts> = {}): PrFacts {
  return {
    number: 412,
    title: 'Faster login',
    url: 'https://github.com/acme/app/pull/412',
    author: 'koen',
    createdAt: '2026-10-20T09:00:00.000Z',
    headSha: 'aaa',
    isDraft: false,
    mergeable: true,
    ready: false,
    reviews: [],
    requestedMe: false,
    requestedAt: null,
    claudeKey: null,
    checks: { known: true, overall: 'yellow', failing: [] },
    ...overrides,
  };
}

function observe(prs: PrFacts[], overrides: Partial<GitHubObservation> = {}): GitHubObservation {
  return {
    owner: 'acme',
    repo: 'app',
    login: 'koen',
    path: 'graphql',
    prs,
    verified: [],
    findings: [],
    ...overrides,
  };
}

const ctx = (overrides = {}) => context({ sourceId: SOURCE, ...overrides });

function seeded(prs: PrFacts[] = [pr()]): GitHubBaseline {
  return deriveGitHub(seedContext({ sourceId: SOURCE }), null, observe(prs)).baseline;
}

const failing = (headSha = 'aaa') =>
  pr({
    headSha,
    checks: {
      known: true,
      overall: 'red',
      failing: [
        {
          id: 7,
          name: 'build',
          completedAt: '2026-10-27T09:00:00Z',
          signal: 'TS2322 in a.ts',
          group: null,
        },
      ],
    },
  });

describe('deriveGitHub', () => {
  it('seeds quietly and repeats nothing', () => {
    const seed = deriveGitHub(seedContext({ sourceId: SOURCE }), null, observe([failing()]));
    expect(seed.entries).toEqual([]);
    const first = deriveGitHub(ctx(), seeded(), observe([failing()]));
    expect(first.entries.map((e) => e.category)).toEqual(['pr.checks-failed']);
    expect(first.entries[0]).toMatchObject({
      id: `${SOURCE}|#412:checks:aaa:failed`,
      needsYou: true,
      sourceAt: '2026-10-27T09:00:00.000Z',
      action: { kind: 'fix-checks', owner: 'acme', repo: 'app', number: 412, headSha: 'aaa' },
    });
    expect(first.entries[0]?.detail).toBe('build: TS2322 in a.ts');
    expect(deriveGitHub(ctx(), first.baseline, observe([failing()])).entries).toEqual([]);
  });

  it('fills in a failure on the same head once its evidence arrives', () => {
    const first = deriveGitHub(ctx(), seeded(), observe([failing()]));
    const later = pr({
      checks: {
        known: true,
        overall: 'red',
        failing: [
          {
            id: 7,
            name: 'build',
            completedAt: '2026-10-27T09:00:00Z',
            signal: 'TS2322 in a.ts',
            group: { scope: 'github.com||acme/app', id: 'g1', title: 'Type errors', owned: false },
          },
        ],
      },
    });
    const enriched = deriveGitHub(ctx(), first.baseline, observe([later]));
    expect(enriched.entries).toEqual([]);
    expect(enriched.enrichments).toEqual([
      expect.objectContaining({
        id: `${SOURCE}|#412:checks:aaa:failed`,
        detail: 'build: TS2322 in a.ts (shared failure: Type errors)',
        action: { kind: 'open-ci-group', scope: 'github.com||acme/app', groupId: 'g1' },
      }),
    ]);
    expect(deriveGitHub(ctx(), enriched.baseline, observe([later])).enrichments).toEqual([]);
  });

  it('reports passing only after a failure entry, and resolves the failure', () => {
    expect(
      deriveGitHub(
        ctx(),
        seeded(),
        observe([pr({ checks: { known: true, overall: 'green', failing: [] } })]),
      ).entries,
    ).toEqual([]);
    const failed = deriveGitHub(ctx(), seeded(), observe([failing()])).baseline;
    const passed = deriveGitHub(
      ctx(),
      failed,
      observe([pr({ headSha: 'bbb', checks: { known: true, overall: 'green', failing: [] } })]),
    );
    expect(passed.entries.map((e) => e.category)).toEqual(['pr.checks-passed']);
    expect(passed.resolutions).toContainEqual(
      expect.objectContaining({ categories: ['pr.checks-failed'], resolvedBy: 'checks passed' }),
    );
  });

  it('points a failure in a group someone owns at the group, and does not need me', () => {
    const grouped = pr({
      checks: {
        known: true,
        overall: 'red',
        failing: [
          {
            id: 7,
            name: 'e2e',
            completedAt: null,
            signal: null,
            group: {
              scope: 'github.com||acme/app',
              id: 'g1',
              title: 'Flaky login spec',
              owned: true,
            },
          },
        ],
      },
    });
    const [entry] = deriveGitHub(ctx(), seeded(), observe([grouped])).entries;
    expect(entry?.needsYou).toBe(false);
    expect(entry?.action).toEqual({
      kind: 'open-ci-group',
      scope: 'github.com||acme/app',
      groupId: 'g1',
    });
    expect(entry?.detail).toContain('shared failure: Flaky login spec');
  });

  it('adds review entries from GraphQL reads only, superseding the same reviewer', () => {
    const reviewed = pr({
      reviews: [
        {
          id: 1,
          author: 'ann',
          state: 'changesRequested',
          submittedAt: '2026-10-27T09:00:00Z',
          bot: false,
        },
        { id: 2, author: 'claude[bot]', state: 'commented', submittedAt: null, bot: true },
        { id: 3, author: 'koen', state: 'commented', submittedAt: null, bot: false },
      ],
    });
    expect(deriveGitHub(ctx(), seeded(), observe([reviewed], { path: 'rest' })).entries).toEqual(
      [],
    );
    const first = deriveGitHub(ctx(), seeded(), observe([reviewed]));
    expect(first.entries.map((e) => e.id)).toEqual([`${SOURCE}|#412:review:1`]);
    expect(first.entries[0]?.needsYou).toBe(true);
    const again = deriveGitHub(
      ctx(),
      first.baseline,
      observe([
        pr({
          reviews: [{ id: 4, author: 'ann', state: 'approved', submittedAt: null, bot: false }],
        }),
      ]),
    );
    expect(again.entries[0]?.needsYou).toBe(false);
    expect(again.resolutions).toContainEqual(
      expect.objectContaining({ ids: [`${SOURCE}|#412:review:1`], status: 'superseded' }),
    );
  });

  it('a REST read does not forget the reviews it cannot see', () => {
    const reviewed = pr({
      reviews: [{ id: 1, author: 'ann', state: 'approved', submittedAt: null, bot: false }],
    });
    const base = deriveGitHub(ctx(), seeded(), observe([reviewed])).baseline;
    const rest = deriveGitHub(ctx(), base, observe([pr({ reviews: null })], { path: 'rest' }));
    const back = deriveGitHub(ctx(), rest.baseline, observe([reviewed]));
    expect(back.entries).toEqual([]);
  });

  it('asks for my review on anyone else’s PR and resolves it when it goes away', () => {
    const theirs = pr({ author: 'ann', requestedMe: true, requestedAt: '2026-10-27T09:00:00Z' });
    const asked = deriveGitHub(ctx(), seeded([pr({ author: 'ann' })]), observe([theirs]));
    expect(asked.entries[0]).toMatchObject({
      category: 'pr.review-request',
      id: `${SOURCE}|review-request:acme/app#412:2026-10-27T09:00:00.000Z`,
      action: { kind: 'review-pr', owner: 'acme', repo: 'app', number: 412 },
    });
    const done = deriveGitHub(ctx(), asked.baseline, observe([pr({ author: 'ann' })]));
    expect(done.resolutions).toContainEqual(
      expect.objectContaining({ categories: ['pr.review-request'] }),
    );
  });

  it('reports ready and conflicts on my PRs', () => {
    const ready = deriveGitHub(ctx(), seeded(), observe([pr({ ready: true })]));
    expect(ready.entries[0]).toMatchObject({
      category: 'pr.ready',
      action: { kind: 'merge', headSha: 'aaa' },
    });
    const conflict = deriveGitHub(ctx(), seeded(), observe([pr({ mergeable: false })]));
    expect(conflict.entries.map((e) => e.category)).toEqual(['pr.conflict']);
    const fixed = deriveGitHub(ctx(), conflict.baseline, observe([pr({ mergeable: true })]));
    expect(fixed.resolutions).toContainEqual(
      expect.objectContaining({ categories: ['pr.conflict'] }),
    );
  });

  it('treats a disappearance as nothing until a verification read says merged', () => {
    const base = seeded();
    const gone = deriveGitHub(ctx(), base, observe([]));
    expect(gone.entries).toEqual([]);
    expect(prsToVerify(gone.baseline, observe([]))).toEqual([412]);
    const merged = deriveGitHub(
      ctx(),
      gone.baseline,
      observe([], {
        verified: [
          {
            number: 412,
            title: 'Faster login',
            url: 'https://github.com/acme/app/pull/412',
            author: 'koen',
            state: 'merged',
            mergedAt: '2026-10-27T09:45:00Z',
            mergedBy: 'ann',
            closedAt: '2026-10-27T09:45:00Z',
          },
        ],
      }),
    );
    expect(merged.entries[0]).toMatchObject({
      category: 'pr.merged',
      id: `${SOURCE}|#412:merged`,
      sourceAt: '2026-10-27T09:45:00.000Z',
      summary: 'ann merged #412 Faster login',
    });
    expect(prsToVerify(merged.baseline, observe([]))).toEqual([]);
  });

  it('reports each close of a PR that was closed, reopened and closed again', () => {
    const closed = (closedAt: string) => ({
      number: 412,
      title: 'Faster login',
      url: 'u',
      author: 'koen',
      state: 'closed' as const,
      mergedAt: null,
      mergedBy: null,
      closedAt,
    });
    const first = deriveGitHub(
      ctx(),
      seeded(),
      observe([], { verified: [closed('2026-10-27T09:00:00Z')] }),
    );
    const reopened = deriveGitHub(ctx(), first.baseline, observe([pr()]));
    expect(reopened.entries).toEqual([]);
    const second = deriveGitHub(
      ctx(),
      reopened.baseline,
      observe([], { verified: [closed('2026-10-27T09:50:00Z')] }),
    );
    expect(first.entries[0]?.id).not.toBe(second.entries[0]?.id);
    expect(second.entries[0]?.category).toBe('pr.closed');
  });

  it('keeps the same PR number in two repositories apart', () => {
    const one = deriveGitHub(ctx(), seeded(), observe([failing()]));
    const other = deriveGitHub(
      ctx({ sourceId: 'gh:github.com|koen|acme/api' }),
      seeded(),
      observe([failing()], { repo: 'api' }),
    );
    expect(one.entries[0]?.id).not.toBe(other.entries[0]?.id);
    expect(one.entries[0]?.entity.key).toBe('gh:acme/app#412');
    expect(other.entries[0]?.entity.key).toBe('gh:acme/api#412');
  });

  it('counts mine by the login that reads the repository', () => {
    const theirsByLogin = deriveGitHub(
      ctx(),
      seeded(),
      observe([failing()], { login: 'someone-else' }),
    );
    expect(theirsByLogin.entries).toEqual([]);
  });

  it('fetches findings only for reviews the baseline has not seen, and reports one per review', () => {
    const base = seeded([pr({ claudeKey: 'r1' })]);
    expect(prsNeedingFindings(base, observe([pr({ claudeKey: 'r1' })]))).toEqual([]);
    expect(prsNeedingFindings(base, observe([pr({ claudeKey: 'r2' })]))).toEqual([
      { number: 412, since: null },
    ]);
    const result = deriveGitHub(
      ctx(),
      base,
      observe([pr({ claudeKey: 'r2' })], {
        findings: [
          {
            number: 412,
            key: 'r2',
            at: '2026-10-27T09:20:00Z',
            items: [
              { severity: 'suggestion', title: 'Name the flag' },
              { severity: 'critical', title: 'SQL injection' },
              { severity: 'praise', title: 'Nice tests' },
              { severity: 'suggestion', title: 'Extract helper' },
            ],
          },
        ],
      }),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ category: 'pr.findings', needsYou: true });
    expect(result.entries[0]?.detail?.split('\n')).toEqual([
      'critical: SQL injection',
      'suggestion: Name the flag',
      'suggestion: Extract helper',
    ]);
    expect(prsNeedingFindings(result.baseline, observe([pr({ claudeKey: 'r2' })]))).toEqual([]);
  });

  it('caps the findings fetch per poll', () => {
    const prs = [1, 2, 3, 4, 5].map((number) => pr({ number, claudeKey: null }));
    const base = seeded(prs);
    const later = prs.map((p) => ({ ...p, claudeKey: `k${p.number}` }));
    expect(prsNeedingFindings(base, observe(later))).toHaveLength(3);
  });

  it('stays quiet about an old PR it sees for the first time', () => {
    const old = failing();
    expect(deriveGitHub(ctx(), { prs: {} }, observe([old])).entries).toEqual([]);
    const fresh = { ...failing(), number: 500, createdAt: '2026-10-27T09:00:00.000Z' };
    expect(deriveGitHub(ctx(), { prs: {} }, observe([fresh])).entries).toHaveLength(1);
  });
});
