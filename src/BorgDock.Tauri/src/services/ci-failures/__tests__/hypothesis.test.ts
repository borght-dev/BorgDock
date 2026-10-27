import { describe, expect, it } from 'vitest';
import { type GroupFacts, hypothesesOf, isSetupStep, relatednessOf } from '../hypothesis';
import { jobOccurrenceId, parseMatrix, parseScope, sameAccount, scopeOf } from '../identity';

function facts(overrides: Partial<GroupFacts> = {}): GroupFacts {
  return {
    prNumbers: [],
    defaultBranchRuns: [],
    defaultBranch: 'master',
    occurrenceCount: 1,
    passedOnRetry: 0,
    runCount: 1,
    catalogIds: [],
    failedSteps: [],
    ...overrides,
  };
}

describe('hypothesesOf', () => {
  it('puts a failure that is also on the default branch first', () => {
    const found = hypothesesOf(
      facts({ prNumbers: [1, 2], defaultBranchRuns: [4812, 4790], catalogIds: ['dns'] }),
    );
    expect(found.map((h) => h.kind)).toEqual(['base-branch', 'infrastructure']);
    expect(found[0]?.reason).toBe('Also failing on master in 2 runs, latest #4812');
    expect(found[1]?.reason).toBe('A host name could not be resolved. Not proven.');
  });

  it('never calls something infrastructure because many PRs have it', () => {
    expect(hypothesesOf(facts({ prNumbers: [1, 2, 3, 4, 5, 6] }))).toEqual([]);
  });

  it('suspects infrastructure when only setup steps failed', () => {
    expect(
      hypothesesOf(facts({ failedSteps: ['Set up job', 'Run actions/checkout@v4'] }))[0],
    ).toEqual({
      kind: 'infrastructure',
      reason: 'Failed before repository code ran (Set up job). Not proven.',
    });
    expect(isSetupStep('Run bun run test')).toBe(false);
  });

  it('marks retries that passed as flaky', () => {
    expect(hypothesesOf(facts({ passedOnRetry: 2, runCount: 3 }))).toEqual([
      { kind: 'flaky', reason: 'Passed on retry in 2 of 3 runs' },
    ]);
  });

  it('calls a one-PR failure in its own files branch-specific', () => {
    expect(hypothesesOf(facts({ prNumbers: [7] }), { touchesChangedFiles: true })).toEqual([
      { kind: 'branch-specific', reason: 'Only in this PR, in a file it changes' },
    ]);
    expect(hypothesesOf(facts({ prNumbers: [7, 8] }), { touchesChangedFiles: true })).toEqual([]);
  });
});

describe('relatednessOf', () => {
  it('shows groups across PRs or with the default branch, repeats within one PR, hides the rest', () => {
    expect(relatednessOf(facts({ prNumbers: [1, 2] }))).toBe('shared');
    expect(relatednessOf(facts({ prNumbers: [1], defaultBranchRuns: [9] }))).toBe('shared');
    expect(relatednessOf(facts({ prNumbers: [1], occurrenceCount: 3 }))).toBe('repeated');
    expect(relatednessOf(facts({ prNumbers: [1] }))).toBe('single');
  });
});

describe('identity', () => {
  it('builds and reads scopes', () => {
    const scope = scopeOf({ host: 'github.com', account: 'Koen', owner: 'Gomocha', repo: 'FSP' });
    expect(scope).toBe('github.com|koen|gomocha/fsp');
    expect(parseScope(scope)).toEqual({
      host: 'github.com',
      account: 'koen',
      owner: 'gomocha',
      repo: 'fsp',
    });
    expect(sameAccount(scope, 'github.com|koen|gomocha/other')).toBe(true);
    expect(sameAccount(scope, 'github.com|work|gomocha/other')).toBe(false);
    expect(jobOccurrenceId(scope, 42)).toBe('github.com|koen|gomocha/fsp#job:42');
  });

  it('reads matrix values from default job names only', () => {
    expect(parseMatrix('build (18.x, ubuntu-latest)')).toEqual({
      base: 'build',
      values: ['18.x', 'ubuntu-latest'],
    });
    expect(parseMatrix('e2e')).toEqual({ base: 'e2e', values: [] });
  });
});
