import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatReviewWaitTime, getReviewSlaTier } from '@/services/review-sla';

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// getReviewSlaTier
// ---------------------------------------------------------------------------

describe('getReviewSlaTier', () => {
  it('returns "fresh" when elapsed time is under 4 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T04:00:00Z'));
    // Requested 1 hour ago
    expect(getReviewSlaTier('2025-06-01T03:00:00Z')).toBe('fresh');
  });

  it('returns "fresh" for a just-created request (0 elapsed)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
    expect(getReviewSlaTier('2025-06-01T12:00:00Z')).toBe('fresh');
  });

  it('returns "fresh" at 3h59m (just under 4h boundary)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T03:59:00Z'));
    expect(getReviewSlaTier('2025-06-01T00:00:00Z')).toBe('fresh');
  });

  it('returns "aging" at exactly 4 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T04:00:00Z'));
    expect(getReviewSlaTier('2025-06-01T00:00:00Z')).toBe('aging');
  });

  it('returns "aging" when elapsed is between 4 and 24 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
    // 12 hours elapsed
    expect(getReviewSlaTier('2025-06-01T00:00:00Z')).toBe('aging');
  });

  it('returns "aging" at 23h59m (just under 24h boundary)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-02T23:59:00Z'));
    // 23h59m elapsed
    expect(getReviewSlaTier('2025-06-02T00:00:00Z')).toBe('aging');
  });

  it('returns "stale" at exactly 24 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-02T00:00:00Z'));
    expect(getReviewSlaTier('2025-06-01T00:00:00Z')).toBe('stale');
  });

  it('returns "stale" well past 24 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-10T00:00:00Z'));
    // 9 days elapsed
    expect(getReviewSlaTier('2025-06-01T00:00:00Z')).toBe('stale');
  });
});

// ---------------------------------------------------------------------------
// formatReviewWaitTime
// ---------------------------------------------------------------------------

describe('formatReviewWaitTime', () => {
  it('returns "<1h" when less than 1 hour elapsed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T00:30:00Z'));
    expect(formatReviewWaitTime('2025-06-01T00:00:00Z')).toBe('<1h');
  });

  it('returns "<1h" for zero elapsed time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T00:00:00Z'));
    expect(formatReviewWaitTime('2025-06-01T00:00:00Z')).toBe('<1h');
  });

  it('returns "1h" at exactly 1 hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T01:00:00Z'));
    expect(formatReviewWaitTime('2025-06-01T00:00:00Z')).toBe('1h');
  });

  it('returns hours for 1-23 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T05:30:00Z'));
    // 5.5 hours -> floor = 5
    expect(formatReviewWaitTime('2025-06-01T00:00:00Z')).toBe('5h');
  });

  it('returns "23h" at 23 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T23:00:00Z'));
    expect(formatReviewWaitTime('2025-06-01T00:00:00Z')).toBe('23h');
  });

  it('returns "1d" at exactly 24 hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-02T00:00:00Z'));
    expect(formatReviewWaitTime('2025-06-01T00:00:00Z')).toBe('1d');
  });

  it('returns days for multi-day waits', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-04T12:00:00Z'));
    // 3.5 days -> floor(84h / 24) = 3
    expect(formatReviewWaitTime('2025-06-01T00:00:00Z')).toBe('3d');
  });
});
