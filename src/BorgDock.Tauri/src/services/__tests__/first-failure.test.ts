import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readJobEvidence } = vi.hoisted(() => ({ readJobEvidence: vi.fn() }));
vi.mock('@/services/github/checks', () => ({ readJobEvidence }));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => ({}) }));

import {
  makeEvidence as evidence,
  makeSignal as signal,
} from '@/services/ci-failures/__fixtures__/evidence';
import type { CheckRun } from '@/types';
import { excerptFromSignals, loadFirstFailure } from '../first-failure';
import { isActionsJob } from '../github/check-runs';

function run(id: number, htmlUrl: string): CheckRun {
  return {
    id,
    name: `job ${id}`,
    status: 'completed',
    conclusion: 'failure',
    htmlUrl,
    checkSuiteId: 1,
  };
}

const TS_SIGNALS = [
  signal({ kind: 'summary', parser: 'playwright', message: '2 failed' }),
  signal({
    path: 'src/app.ts',
    line: 12,
    code: 'TS2322',
    message: 'Type string is not assignable to type number.',
  }),
  signal({ path: 'src/b.ts', line: 3, code: 'TS2304', message: 'Cannot find name foo.' }),
];

describe('first-failure', () => {
  beforeEach(() => {
    readJobEvidence.mockReset();
  });

  it('recognises GitHub Actions job runs', () => {
    expect(isActionsJob(run(1, 'https://github.com/a/b/actions/runs/9/job/1'))).toBe(true);
    expect(isActionsJob(run(1, 'https://github.com/a/b/runs/1'))).toBe(false);
  });

  it('excerpts the first signals, location first, totals left out', () => {
    expect(excerptFromSignals(TS_SIGNALS)).toEqual([
      'src/app.ts:12 TS2322',
      'Type string is not assignable to type number.',
      'src/b.ts:3 TS2304',
      'Cannot find name foo.',
    ]);
    expect(excerptFromSignals([])).toEqual([]);
  });

  it('heads a test failure with its test id', () => {
    const test = signal({ kind: 'test', testId: 'Checkout.Pays', message: 'Expected 200' });
    expect(excerptFromSignals([test])).toEqual(['Checkout.Pays', 'Expected 200']);
  });

  it('reads the first failed Actions job once and caches it', async () => {
    readJobEvidence.mockResolvedValue(evidence({ signals: TS_SIGNALS }));
    const failed = [
      run(5, 'https://github.com/a/b/runs/5'),
      run(6, 'https://github.com/a/b/actions/runs/9/job/6'),
    ];
    const first = await loadFirstFailure('a', 'b', failed);
    expect(first?.checkName).toBe('job 6');
    expect(first?.lines[0]).toBe('src/app.ts:12 TS2322');
    await loadFirstFailure('a', 'b', failed);
    expect(readJobEvidence).toHaveBeenCalledTimes(1);
    expect(readJobEvidence).toHaveBeenCalledWith({}, 'a', 'b', 6);
  });

  it('reads again after a failed read, not after an unavailable log', async () => {
    readJobEvidence.mockResolvedValueOnce(evidence({ state: 'failed', reason: 'rate limit' }));
    const failed = [run(8, 'https://github.com/a/b/actions/runs/9/job/8')];
    expect(await loadFirstFailure('a', 'b', failed)).toBeNull();
    readJobEvidence.mockResolvedValueOnce(evidence({ signals: TS_SIGNALS }));
    expect((await loadFirstFailure('a', 'b', failed))?.lines[0]).toBe('src/app.ts:12 TS2322');

    readJobEvidence.mockResolvedValueOnce(evidence({ state: 'unavailable', reason: 'expired' }));
    const gone = [run(9, 'https://github.com/a/b/actions/runs/9/job/9')];
    expect(await loadFirstFailure('a', 'b', gone)).toBeNull();
    expect(await loadFirstFailure('a', 'b', gone)).toBeNull();
    expect(readJobEvidence).toHaveBeenCalledTimes(3);
  });

  it('resolves null without an Actions job or when the read throws', async () => {
    expect(await loadFirstFailure('a', 'b', [run(5, 'https://example.com/5')])).toBeNull();
    readJobEvidence.mockRejectedValue(new Error('invalid repository name'));
    expect(
      await loadFirstFailure('a', 'b', [run(7, 'https://github.com/a/b/actions/runs/9/job/7')]),
    ).toBeNull();
  });
});
