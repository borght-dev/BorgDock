import { describe, expect, it } from 'vitest';
import { formatAgo, isOlderThanDays } from '../relative-time';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const msAgo = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatAgo', () => {
  it.each([
    [10 * 1000, 'just now'],
    [5 * MIN, '5 min ago'],
    [2 * HOUR + 10 * MIN, '2 h ago'],
    [30 * HOUR, 'yesterday'],
    [3 * DAY + HOUR, '3 d ago'],
  ])('%i ms ago reads "%s"', (ms, expected) => {
    expect(formatAgo(msAgo(ms), NOW)).toBe(expected);
  });

  it('reads a future time (clock skew) as just now', () => {
    expect(formatAgo(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe('just now');
  });

  it('gives an empty string for an unparseable time', () => {
    expect(formatAgo('not a date', NOW)).toBe('');
  });
});

describe('isOlderThanDays', () => {
  it('is true from exactly the threshold on', () => {
    expect(isOlderThanDays(msAgo(7 * DAY), 7, NOW)).toBe(true);
    expect(isOlderThanDays(msAgo(7 * DAY - MIN), 7, NOW)).toBe(false);
  });

  it('defaults to seven days', () => {
    expect(isOlderThanDays(msAgo(8 * DAY), undefined, NOW)).toBe(true);
    expect(isOlderThanDays(msAgo(6 * DAY), undefined, NOW)).toBe(false);
  });

  it('is false for an unparseable time', () => {
    expect(isOlderThanDays('nope', 7, NOW)).toBe(false);
  });
});
