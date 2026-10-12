import type { CheckBarCounts } from '@/components/shared/primitives';
import {
  type CheckSummary,
  type ItemOverview,
  NEEDS_YOU,
  THREAD_STATUS_LABEL,
} from '@/services/dispatch/types';

const MINUTE_MS = 60_000;

/** "just now", "4 min", "3 h", "2 d": how long ago, without the word "ago". */
export function shortAge(iso: string, now: number): string {
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (Number.isNaN(elapsed)) return '';
  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function ago(iso: string, now: number): string {
  const age = shortAge(iso, now);
  return age === 'just now' || age === '' ? age : `${age} ago`;
}

/** "Due 14 Oct", and whether that day has passed. */
export function dueLabel(
  dueDate: string | null,
  now: number,
): { label: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const label = `Due ${due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  return { label, overdue: due.getTime() < now };
}

/** The one line under a row's title: why the item sits where it does. */
export function whyLine(overview: ItemOverview, now: number): string {
  const { item, bay, threads, suggestion, pullRequest } = overview;
  const thread = threads[0];
  switch (bay) {
    case 'waiting': {
      const waiting = threads.find((t) => t.open && NEEDS_YOU.includes(t.status));
      if (!waiting) return overview.waitingFor ?? item.state;
      return `${THREAD_STATUS_LABEL[waiting.status]} in ${waiting.slot}, ${ago(waiting.lastActivityAt, now)}`;
    }
    case 'drift':
      return suggestion?.reason ?? item.state;
    case 'working':
      return thread
        ? `Running in ${thread.slot} for ${shortAge(thread.createdAt, now)}`
        : item.state;
    case 'next':
    case 'idle': {
      const parts = [bay === 'next' ? 'Queued' : null, item.state];
      if (item.priority !== null) parts.push(`P${item.priority}`);
      const due = dueLabel(item.dueDate, now);
      if (due) parts.push(due.overdue ? `${due.label}, overdue` : due.label);
      return parts.filter(Boolean).join(', ');
    }
    case 'paused':
      return thread ? `Last agent worked on it ${ago(thread.lastActivityAt, now)}` : item.state;
    case 'handed':
      return pullRequest
        ? `${item.state}, PR ${pullRequest.number} ${pullRequest.state}`
        : item.state;
  }
}

export function toCheckBarCounts(checks: CheckSummary): CheckBarCounts {
  return { ok: checks.passed, fail: checks.failed, run: checks.pending, total: checks.total };
}
