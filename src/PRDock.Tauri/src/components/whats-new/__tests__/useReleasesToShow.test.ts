import { describe, expect, it } from 'vitest';
import type { Release } from '@/types/whats-new';
import { computeReleasesToShow } from '../useReleasesToShow';

const r = (version: string, autoOpenEligible = true): Release => ({
  version,
  date: '2026-04-14',
  summary: '',
  highlights: [],
  alsoFixed: [],
  autoOpenEligible,
});

describe('computeReleasesToShow', () => {
  it('defaults expansion to the newest missed release when no deep link', () => {
    const result = computeReleasesToShow({
      allReleases: [r('1.0.11'), r('1.0.10'), r('1.0.9')],
      currentVersion: '1.0.11',
      lastSeenVersion: '1.0.9',
      targetVersion: null,
    });
    expect(result.expandedVersion).toBe('1.0.11');
    expect(result.countBehind).toBe(2);
  });

  it('expands the deep-link version when provided', () => {
    const result = computeReleasesToShow({
      allReleases: [r('1.0.11'), r('1.0.10'), r('1.0.9')],
      currentVersion: '1.0.11',
      lastSeenVersion: '1.0.9',
      targetVersion: '1.0.10',
    });
    expect(result.expandedVersion).toBe('1.0.10');
  });

  it('counts 0 when no missed releases', () => {
    const result = computeReleasesToShow({
      allReleases: [r('1.0.11')],
      currentVersion: '1.0.11',
      lastSeenVersion: '1.0.11',
      targetVersion: null,
    });
    expect(result.countBehind).toBe(0);
    expect(result.expandedVersion).toBe('1.0.11');
  });

  it('falls back to newest overall when lastSeenVersion is null', () => {
    const result = computeReleasesToShow({
      allReleases: [r('1.0.11'), r('1.0.10')],
      currentVersion: '1.0.11',
      lastSeenVersion: null,
      targetVersion: null,
    });
    expect(result.expandedVersion).toBe('1.0.11');
  });
});
