import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '../client';
import { getReviewReadiness, matchRequiredChecks } from '../review-readiness';

describe('required status checks', () => {
  it('distinguishes passed, skipped, missing, pending and failed checks', () => {
    const statuses = matchRequiredChecks(
      ['passed', 'skipped', 'missing', 'pending', 'failed'].map((name) => ({ name })),
      [
        { name: 'passed', state: 'success' },
        { name: 'skipped', state: 'skipped' },
        { name: 'pending', state: 'pending' },
        { name: 'failed', state: 'failure' },
      ],
    );
    expect(statuses.map((item) => item.state)).toEqual([
      'success',
      'skipped',
      'missing',
      'pending',
      'failure',
    ]);
  });
  it('does not accept a check from the wrong GitHub app', () => {
    expect(
      matchRequiredChecks(
        [{ name: 'build', appId: 2 }],
        [{ name: 'build', appId: 1, state: 'success' }],
      )[0]?.state,
    ).toBe('missing');
    expect(
      matchRequiredChecks(
        [{ name: 'build', appId: -1 }],
        [{ name: 'build', appId: 1, state: 'success' }],
      )[0]?.state,
    ).toBe('success');
  });
  it('combines branch rules and classic protection against the exact head commit', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes('/rules/'))
        return [
          {
            type: 'required_status_checks',
            parameters: { required_status_checks: [{ context: 'build', integration_id: 2 }] },
          },
        ];
      if (path.includes('/protection/'))
        return { contexts: ['build', 'legacy'], checks: [{ context: 'build', app_id: 2 }] };
      if (path.includes('/check-runs'))
        return {
          total_count: 1,
          check_runs: [
            { id: 3, name: 'build', status: 'completed', conclusion: 'skipped', app: { id: 2 } },
          ],
        };
      return [{ context: 'legacy', state: 'success' }];
    });
    const result = await getReviewReadiness(
      { get } as unknown as GitHubClient,
      'owner',
      'repo',
      'fix/parent',
      'exact-head',
    );
    expect(result.complete).toBe(true);
    expect(result.checks.map((check) => [check.name, check.state])).toEqual([
      ['build', 'skipped'],
      ['legacy', 'success'],
    ]);
    expect(
      get.mock.calls
        .map(([path]) => path)
        .filter((path) => path.includes('/commits/'))
        .every((path) => path.includes('/exact-head/')),
    ).toBe(true);
    expect(get.mock.calls[0]?.[0]).toContain('fix%2Fparent');
  });
  it('reports incomplete coverage when protection is inaccessible', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.includes('/protection/')) throw new Error('Forbidden');
      if (path.includes('/check-runs')) return { total_count: 0, check_runs: [] };
      return [];
    });
    const result = await getReviewReadiness(
      { get } as unknown as GitHubClient,
      'owner',
      'repo',
      'main',
      'head',
    );
    expect(result.complete).toBe(false);
    expect(result.warnings).toContain('Classic protection unavailable');
  });
});
