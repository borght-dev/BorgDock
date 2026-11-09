import { describe, expect, it } from 'vitest';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import {
  approveBlockOf,
  bumpOf,
  candidateSummary,
  dependencyBotOf,
  dependencyCandidates,
  dependencyUpdateOf,
  isSafe,
} from '../dependency-updates';

const ME = 'koen';

function pr(over: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'Bump lodash from 4.17.20 to 4.17.21',
    headRef: 'dependabot/npm_and_yarn/lodash-4.17.21',
    headSha: 'abc',
    baseRef: 'main',
    authorLogin: 'dependabot',
    authorAvatarUrl: '',
    state: 'open',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    isDraft: false,
    htmlUrl: 'https://github.com/acme/web/pull/1',
    body: '',
    repoOwner: 'acme',
    repoName: 'web',
    reviewStatus: 'none',
    commentCount: 0,
    labels: ['dependencies'],
    additions: 1,
    deletions: 1,
    changedFiles: 2,
    commitCount: 1,
    requestedReviewers: [ME],
    ...over,
  };
}

function withChecks(
  p: PullRequest,
  overallStatus: PullRequestWithChecks['overallStatus'] = 'green',
): PullRequestWithChecks {
  return {
    pullRequest: p,
    overallStatus,
    failedCheckNames: overallStatus === 'red' ? ['build'] : [],
    failedCheckSuiteIds: [],
    pendingCheckNames: overallStatus === 'yellow' ? ['build'] : [],
    passedCount: overallStatus === 'green' ? 3 : 2,
    skippedCount: 0,
    totalCheckCount: 3,
  };
}

describe('dependencyBotOf', () => {
  it.each([
    ['dependabot', 'dependabot'],
    ['dependabot[bot]', 'dependabot'],
    ['app/dependabot', 'dependabot'],
    ['Renovate[bot]', 'renovate'],
    ['renovate', 'renovate'],
    ['koen', null],
    ['dependabot-fan', null],
  ])('%s → %s', (login, bot) => {
    expect(dependencyBotOf(login)).toBe(bot);
  });
});

describe('bumpOf', () => {
  it.each([
    ['4.17.20', '4.17.21', 'patch'],
    ['3.1.1', '3.2.0', 'minor'],
    ['6.30.0', '7.6.1', 'major'],
    ['0.8.3', '0.8.4', 'patch'],
    ['0.8.3', '0.9.0', 'minor'],
    ['v1.2', 'v1.3', 'minor'],
    ['^1.2.3', '^1.2.4', 'patch'],
    ['1.0.0', 'a1b2c3d', 'unknown'],
    [undefined, '1.0.0', 'unknown'],
  ])('%s → %s is %s', (from, to, bump) => {
    expect(bumpOf(from, to)).toBe(bump);
  });
});

describe('dependencyUpdateOf', () => {
  it('reads a single Dependabot bump with a conventional prefix and a directory', () => {
    const update = dependencyUpdateOf(
      pr({ title: 'build(deps-dev): bump vitest from 3.1.1 to 3.2.0 in /web' }),
    );
    expect(update).toEqual({
      bot: 'dependabot',
      label: 'vitest',
      packages: [{ name: 'vitest', from: '3.1.1', to: '3.2.0' }],
      bump: 'minor',
    });
  });

  it('reads a Dependabot group from its body, sized by its largest jump', () => {
    const update = dependencyUpdateOf(
      pr({
        title: 'Bump the minor-and-patch group across 1 directory with 3 updates',
        body: [
          'Bumps the minor-and-patch group with 3 updates: [a](x), [b](y) and [c](z).',
          '',
          'Updates `@types/node` from 22.1.0 to 22.2.0',
          '- [Release notes](https://example.com)',
          'Updates `eslint` from 9.1.0 to 9.1.1',
          'Updates `prettier` from 3.3.0 to 3.4.0.',
        ].join('\n'),
      }),
    );
    expect(update?.group).toBe('minor-and-patch');
    expect(update?.label).toBe('3 updates in minor-and-patch');
    expect(update?.packages.map((p) => p.name)).toEqual(['@types/node', 'eslint', 'prettier']);
    expect(update?.packages[2]?.to).toBe('3.4.0');
    expect(update?.bump).toBe('minor');
  });

  it('reads Renovate versions from its table', () => {
    const update = dependencyUpdateOf(
      pr({
        authorLogin: 'renovate[bot]',
        title: 'chore(deps): update dependency serde to v1.0.219',
        body: [
          '| Package | Type | Update | Change |',
          '|---|---|---|---|',
          '| [serde](https://serde.rs) ([source](https://github.com/serde-rs/serde)) | dependencies | patch | `1.0.218` -> `1.0.219` |',
        ].join('\n'),
      }),
    );
    expect(update).toMatchObject({
      bot: 'renovate',
      label: 'serde',
      packages: [{ name: 'serde', from: '1.0.218', to: '1.0.219' }],
      bump: 'patch',
    });
  });

  it('keeps a Renovate title without a table as unknown', () => {
    const update = dependencyUpdateOf(
      pr({ authorLogin: 'renovate', title: 'Update react monorepo to v19 (major)' }),
    );
    expect(update?.packages).toEqual([{ name: 'react', to: 'v19' }]);
    expect(update?.bump).toBe('unknown');
  });

  it("ignores a human's PR that bumps a package", () => {
    expect(dependencyUpdateOf(pr({ authorLogin: 'koen' }))).toBeNull();
  });
});

describe('approveBlockOf', () => {
  it('lets an open bot PR through', () => {
    expect(approveBlockOf(withChecks(pr()), ME)).toBeNull();
  });

  it.each([
    [{ state: 'closed' }, 'closed'],
    [{ isDraft: true }, 'draft'],
    [{ mergeable: false }, 'conflicts'],
    [
      { latestReviews: [{ authorLogin: 'Koen', state: 'approved' as const, commitSha: 'abc' }] },
      'approved',
    ],
  ])('%o → %s', (over, block) => {
    expect(approveBlockOf(withChecks(pr(over as Partial<PullRequest>)), ME)).toBe(block);
  });

  it('allows a new approval after the head moved past mine', () => {
    const moved = pr({
      headSha: 'def',
      latestReviews: [{ authorLogin: ME, state: 'approved', commitSha: 'abc' }],
    });
    expect(approveBlockOf(withChecks(moved), ME)).toBeNull();
  });
});

describe('dependencyCandidates', () => {
  const list = [
    withChecks(pr({ number: 5, title: 'Bump react-router from 6.30.0 to 7.6.1' })),
    withChecks(pr({ number: 2 })),
    withChecks(pr({ number: 3, title: 'Bump vitest from 3.1.1 to 3.2.0' }), 'red'),
    withChecks(pr({ number: 4, mergeable: false })),
    withChecks(pr({ number: 6, authorLogin: 'mira' })),
    withChecks(
      pr({
        number: 7,
        latestReviews: [{ authorLogin: ME, state: 'approved', commitSha: 'abc' }],
      }),
    ),
    withChecks(pr({ number: 1, repoName: 'api', authorLogin: 'renovate', title: 'Update x' })),
  ];

  it('lists the bot PRs left to do, by repository then number', () => {
    const candidates = dependencyCandidates(list, ME);
    expect(candidates.map((c) => c.key)).toEqual([
      'acme/api#1',
      'acme/web#2',
      'acme/web#3',
      'acme/web#4',
      'acme/web#5',
    ]);
    expect(candidates.filter(isSafe).map((c) => c.pr.pullRequest.number)).toEqual([2]);
  });

  it('says what the strip says', () => {
    expect(candidateSummary(dependencyCandidates(list, ME))).toBe(
      '1 ready to approve · 1 failing · 1 major · 1 to check · 1 with conflicts',
    );
  });
});
