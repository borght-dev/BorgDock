import { describe, expect, it } from 'vitest';
import {
  coveredChecks,
  type E2eReport,
  e2eVerdict,
  e2eVerdictText,
  isE2eCheck,
  parseE2eReport,
} from '../report';

const META = {
  id: 1,
  url: 'https://github.com/acme/shop/pull/7#issuecomment-1',
  createdAt: '2026-11-05T05:00:00Z',
};

const FAILED_BODY = [
  '## E2E Test Results',
  '',
  '**Environment:** https://staging-2.example.com | **Smoke:** Passed | **E2E:** 2 failed | **Flaky:** 1',
  '**Run:** #15271 | 2026-11-05 04:20:41 UTC',
  '',
  '| Total | Passed | Failed | Flaky | Skipped | Pass Rate |',
  '|-------|--------|--------|-------|---------|-----------|',
  '| 313 | 307 | 2 | 1 | 0 | 98.1% |',
  '',
  '### Failed Tests',
  '| File | Test | Error |',
  '|------|------|-------|',
  '| `assets/calendar-dates.spec.ts` | UTC > @AB4242 picking a day keeps it | `Timeout 15000ms exceeded` |',
  '| `orders/order-list.spec.ts` | filters by status | `Error: expect(locator).toBeVisible() \\| failed` |',
  '',
  '<details><summary>Debug context</summary>',
  '',
  '| File | Test |',
  '|------|------|',
  '| `not/this.spec.ts` | nor this |',
  '</details>',
].join('\n');

function report(overrides: Partial<E2eReport> = {}): E2eReport {
  return { ...(parseE2eReport(FAILED_BODY, META) as E2eReport), ...overrides };
}

const none = { changedFiles: [], workItemIds: [], otherReports: new Map<number, E2eReport>() };

describe('parseE2eReport', () => {
  it('reads the failed tests table and the run status', () => {
    const parsed = parseE2eReport(FAILED_BODY, META);
    expect(parsed?.failed).toEqual([
      {
        file: 'assets/calendar-dates.spec.ts',
        test: 'UTC > @AB4242 picking a day keeps it',
        error: 'Timeout 15000ms exceeded',
      },
      {
        file: 'orders/order-list.spec.ts',
        test: 'filters by status',
        error: 'Error: expect(locator).toBeVisible() | failed',
      },
    ]);
    expect(parsed?.complete).toBe(true);
    expect(parsed?.smokeFailed).toBe(false);
    expect(parsed?.url).toBe(META.url);
    expect(parsed?.runNumber).toBe(15271);
    expect(parsed?.runId).toBeNull();
  });

  it('reads the workflow run the report links to', () => {
    const body = `${FAILED_BODY}
[View workflow run](https://github.com/acme/shop/actions/runs/41966891152)`;
    expect(parseE2eReport(body, META)?.runId).toBe(41966891152);
  });

  it('marks a run whose shards did not all report as incomplete', () => {
    const body = FAILED_BODY.replace(
      '**E2E:** 2 failed',
      '**E2E:** Failed (incomplete test results)',
    );
    expect(parseE2eReport(body, META)?.complete).toBe(false);
  });

  it('ignores other comments', () => {
    expect(parseE2eReport('## Deployment Preview\n**Environment:** `staging-7`', META)).toBeNull();
  });
});

describe('isE2eCheck', () => {
  it('matches E2E shard jobs, not unrelated names', () => {
    expect(isE2eCheck('Deploy & Test (staging-7) / E2E Shard 4/4')).toBe(true);
    expect(isE2eCheck('Build & Test API / Test API (shard 6)')).toBe(false);
    expect(isE2eCheck('sharee2econfig')).toBe(false);
  });
});

describe('coveredChecks', () => {
  const SHARD = 'Deploy & Test (staging-2) / E2E Shard 4/4';
  const ADVISORY = 'E2E reproducer advisory';
  const names = [SHARD, ADVISORY];
  const jobs = [
    { name: SHARD, runId: 41966891152, runNumber: 15271 },
    { name: ADVISORY, runId: 41966891100, runNumber: 9120 },
  ];

  it('covers only the jobs of the run the report is about', () => {
    expect(coveredChecks(names, jobs, report())).toEqual(new Set([SHARD]));
    expect(coveredChecks(names, jobs, report({ runNumber: null, runId: 41966891152 }))).toEqual(
      new Set([SHARD]),
    );
  });

  it('covers nothing when the E2E run passed and only the advisory failed', () => {
    expect(coveredChecks([ADVISORY], [jobs[1]!], report())).toEqual(new Set());
  });

  it('falls back to E2E-looking names without a report or run details', () => {
    expect(coveredChecks(names, jobs, null)).toEqual(new Set(names));
    expect(coveredChecks(names, [], report())).toEqual(new Set(names));
    expect(coveredChecks(names, jobs, report({ runNumber: null, runId: null }))).toEqual(
      new Set(names),
    );
  });
});

describe('e2eVerdict', () => {
  it('blames the PR for a failing spec it changes', () => {
    const verdict = e2eVerdict(report(), {
      ...none,
      changedFiles: ['web/e2e/tests/assets/calendar-dates.spec.ts', 'web/src/Calendar.tsx'],
    });
    expect(verdict.kind).toBe('introduced');
    expect(verdict.tests.map((t) => t.cause)).toEqual(['changed', 'untouched']);
  });

  it('blames the PR for a test tagged with one of its work items', () => {
    const verdict = e2eVerdict(report(), { ...none, workItemIds: [4242] });
    expect(verdict.kind).toBe('introduced');
    expect(verdict.tests[0]?.cause).toBe('tagged');
  });

  it('clears failures in specs the PR leaves alone', () => {
    const verdict = e2eVerdict(report(), { ...none, changedFiles: ['web/src/Other.tsx'] });
    expect(verdict).toMatchObject({ kind: 'outside', shared: false });
    expect(e2eVerdictText(verdict)).toBe('2 E2E tests failed, none in specs this PR touches');
  });

  it('names the other PRs a shared failure also breaks', () => {
    const one = report({ failed: report().failed.slice(1) });
    const verdict = e2eVerdict(one, { ...none, otherReports: new Map([[12, one]]) });
    expect(verdict).toMatchObject({ kind: 'outside', shared: true });
    expect(verdict.tests[0]?.alsoFailsOn).toEqual([12]);
  });

  it('cannot clear a PR that changes E2E helpers unless every failure is shared', () => {
    const verdict = e2eVerdict(report(), {
      ...none,
      changedFiles: ['web/e2e/fixtures/api/orderApi.ts'],
    });
    expect(verdict).toMatchObject({ kind: 'unclear', reason: 'helpers-changed' });
  });

  it('cannot clear a partial run, a broken deployment or a missing report', () => {
    expect(e2eVerdict(report({ complete: false }), none)).toMatchObject({ reason: 'incomplete' });
    expect(e2eVerdict(report({ smokeFailed: true }), none)).toMatchObject({
      reason: 'smoke-failed',
    });
    expect(e2eVerdict(report({ failed: [] }), none)).toMatchObject({ reason: 'no-failed-tests' });
    expect(e2eVerdict(null, none)).toMatchObject({ kind: 'unclear', reason: 'no-report' });
  });
});
