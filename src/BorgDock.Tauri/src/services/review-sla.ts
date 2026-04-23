export type ReviewSlaTier = 'fresh' | 'aging' | 'stale';

const HOUR_MS = 1000 * 60 * 60;

export function getReviewSlaTier(requestedAtIso: string): ReviewSlaTier {
  const elapsed = Date.now() - new Date(requestedAtIso).getTime();
  const hours = elapsed / HOUR_MS;
  if (hours < 4) return 'fresh';
  if (hours < 24) return 'aging';
  return 'stale';
}

export function formatReviewWaitTime(requestedAtIso: string): string {
  const elapsed = Date.now() - new Date(requestedAtIso).getTime();
  const hours = Math.floor(elapsed / HOUR_MS);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
