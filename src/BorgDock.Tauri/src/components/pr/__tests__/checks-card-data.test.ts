import { describe, expect, it } from 'vitest';
import { makeDetail } from '@/services/ci-failures/__fixtures__/store';
import { failingPr, failingPrFailures, runningPr } from '../__fixtures__/checks-card-data';
import { checksCardData } from '../checks-card-data';

describe('checksCardData', () => {
  it('gives each failing job its step, totals, first failure and the rest by name', () => {
    const data = checksCardData(failingPr(), failingPrFailures(), true);
    const [vitest, build] = data.failing;
    expect(vitest).toMatchObject({
      name: 'test (ubuntu-latest, node 22)',
      workflow: 'CI',
      duration: '4m 12s',
      step: 'Run vitest',
      totals: '3 failed, 412 passed',
      reason: 'ready',
      more: ['Lane › scrolled › keeps offset', 'Lane › last › drop target'],
    });
    expect(vitest?.first).toMatchObject({ expected: '380', actual: '412', line: 88 });
    expect(build).toMatchObject({ name: 'build-api', workflow: 'Backend', groupIds: ['g-iclock'] });
    expect(build?.first?.code).toBe('CS0246');
  });

  it('lists running, passed and skipped checks by name with the poll counts', () => {
    const data = checksCardData(failingPr(), failingPrFailures(), true);
    expect(data.counts).toEqual({ fail: 2, run: 1, ok: 14, skip: 3 });
    expect(data.running).toEqual(['e2e (chromium)']);
    expect(data.passed).toHaveLength(14);
    expect(data.skipped).toEqual(['deploy-preview', 'visual-regression', 'release']);
  });

  it('says the log is being read for a failure the store has not recorded yet', () => {
    const data = checksCardData(failingPr(), { occurrences: [], groups: [] }, true);
    expect(data.failing.map((check) => check.reason)).toEqual(['reading', 'reading']);
  });

  it('says no log was read while related CI failures are off', () => {
    const data = checksCardData(failingPr(), null, false);
    expect(data.failing.every((check) => check.reason === 'off')).toBe(true);
  });

  it('falls back to "unavailable" when the read found nothing but totals', () => {
    const failures = {
      occurrences: [
        makeDetail({ jobId: 501, evidenceState: 'ready' }, [
          { signal: { ...failingPrFailures().occurrences[0]!.signals[0]!.signal } },
        ]),
      ],
      groups: [],
    };
    const [vitest] = checksCardData(failingPr(), failures, true).failing;
    expect(vitest).toMatchObject({
      reason: 'unavailable',
      first: null,
      totals: '3 failed, 412 passed',
    });
  });

  it('carries an unreadable log reason through', () => {
    const failures = {
      occurrences: [
        makeDetail({ jobId: 502, evidenceState: 'unavailable', evidenceReason: 'Log expired' }, []),
      ],
      groups: [],
    };
    const build = checksCardData(failingPr(), failures, true).failing[1];
    expect(build).toMatchObject({ reason: 'unavailable', reasonText: 'Log expired' });
  });

  it('names a failed check the completed jobs do not carry', () => {
    const pr = { ...failingPr(), ciJobs: undefined };
    const data = checksCardData(pr, null, true);
    expect(data.failing.map((check) => check.name)).toEqual([
      'test (ubuntu-latest, node 22)',
      'build-api',
    ]);
    expect(data.passed).toEqual([]);
  });

  it('has no failing section for a PR whose checks are still running', () => {
    const data = checksCardData(runningPr(), null, true);
    expect(data.failing).toEqual([]);
    expect(data.running).toEqual(['e2e (chromium)', 'SonarCloud Code Analysis']);
  });
});
