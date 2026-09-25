import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getJobLog } = vi.hoisted(() => ({ getJobLog: vi.fn() }));
vi.mock('@/services/github/checks', () => ({ getJobLog }));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => ({}) }));

import type { CheckRun } from '@/types';
import { excerptFromLog, loadFirstFailure } from '../first-failure';
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

const TS_LOG = [
  '2026-09-25T10:00:00.0000000Z ##[group]Run bunx tsc -b',
  'src/app.ts(12,5): error TS2322: Type string is not assignable to type number.',
  'src/b.ts(3,1): error TS2304: Cannot find name foo.',
  '##[error]Process completed with exit code 2.',
].join('\n');

describe('first-failure', () => {
  beforeEach(() => {
    getJobLog.mockReset();
  });

  it('recognises GitHub Actions job runs', () => {
    expect(isActionsJob(run(1, 'https://github.com/a/b/actions/runs/9/job/1'))).toBe(true);
    expect(isActionsJob(run(1, 'https://github.com/a/b/runs/1'))).toBe(false);
  });

  it('excerpts the parser’s first errors, location first', () => {
    expect(excerptFromLog(TS_LOG)).toEqual([
      'src/app.ts:12 TS2322',
      'Type string is not assignable to type number.',
      'src/b.ts:3 TS2304',
      'Cannot find name foo.',
    ]);
    expect(excerptFromLog('all good')).toEqual([]);
  });

  it('fetches the first failed Actions job once and caches it', async () => {
    getJobLog.mockResolvedValue(TS_LOG);
    const failed = [
      run(5, 'https://github.com/a/b/runs/5'),
      run(6, 'https://github.com/a/b/actions/runs/9/job/6'),
    ];
    const first = await loadFirstFailure('a', 'b', failed);
    expect(first?.checkName).toBe('job 6');
    expect(first?.lines[0]).toBe('src/app.ts:12 TS2322');
    await loadFirstFailure('a', 'b', failed);
    expect(getJobLog).toHaveBeenCalledTimes(1);
    expect(getJobLog).toHaveBeenCalledWith({}, 'a', 'b', 6);
  });

  it('resolves null without an Actions job or when the fetch fails', async () => {
    expect(await loadFirstFailure('a', 'b', [run(5, 'https://example.com/5')])).toBeNull();
    getJobLog.mockImplementation(async () => {
      throw new Error('404');
    });
    expect(
      await loadFirstFailure('a', 'b', [run(7, 'https://github.com/a/b/actions/runs/9/job/7')]),
    ).toBeNull();
  });
});
