const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A pull request with no update for this long is stale (plan section 5, phase 5). */
export const STALE_AFTER_DAYS = 7;

/**
 * Now, to the minute: lists pass it to every row so "updated … ago" (and the
 * stale rule) only change once a minute, not on every render.
 */
export function minuteNow(): number {
  return Math.floor(Date.now() / MINUTE) * MINUTE;
}

function timeOf(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * "just now", "5 min ago", "2 h ago", "yesterday", "3 d ago" — the age
 * wording of the Workbench rows. Future timestamps (clock skew) read as
 * "just now"; an unparseable one gives an empty string.
 */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const then = timeOf(iso);
  if (!Number.isFinite(then)) return '';
  const diff = now - then;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'yesterday';
  return `${days} d ago`;
}

/** True when `iso` is at least `days` days before `now`. */
export function isOlderThanDays(
  iso: string,
  days: number = STALE_AFTER_DAYS,
  now: number = Date.now(),
): boolean {
  const then = timeOf(iso);
  if (!Number.isFinite(then)) return false;
  return now - then >= days * DAY;
}

/** "42s", "4m 12s" from start to end; empty when either is missing. */
export function formatDuration(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt || !completedAt) return '';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${String(secs).padStart(2, '0')}s`;
}
