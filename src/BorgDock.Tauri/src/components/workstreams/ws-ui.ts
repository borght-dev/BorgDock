import type { DotTone, PillTone } from '@/components/shared/primitives';
import type { Tone } from '@/services/dispatch/types';
import type { AttentionTone } from '@/services/workstreams/attention';
import type { EditContext, EditResult } from '@/services/workstreams/edits';
import type { Freshness } from '@/services/workstreams/resolve';
import type { WorkstreamDocument } from '@/services/workstreams/types';
import { showToast } from '@/stores/toast-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';

/** Apply an edit; a refusal shows as a toast. Returns whether it went through. */
export function wsEdit(
  id: string,
  change: (document: WorkstreamDocument, context: EditContext) => EditResult,
  options: { text?: boolean } = {},
): boolean {
  const error = useWorkstreamsStore.getState().edit(id, change, options);
  if (error) showToast({ tone: 'error', message: error });
  return error === null;
}

/** An edit that takes something away: the toast offers Undo. */
export function wsEditUndoable(
  id: string,
  change: (document: WorkstreamDocument, context: EditContext) => EditResult,
  message: string,
): void {
  const error = useWorkstreamsStore.getState().edit(id, change, { undoable: true });
  if (error) {
    showToast({ tone: 'error', message: error });
    return;
  }
  showToast({
    message,
    actionLabel: 'Undo',
    onAction: () => useWorkstreamsStore.getState().undo(id),
  });
}

export const ATTENTION_DOT: Record<AttentionTone, DotTone> = {
  bad: 'red',
  warn: 'yellow',
  ok: 'green',
};

export const TONE_PILL: Record<Tone, PillTone> = {
  bad: 'error',
  warn: 'warning',
  ok: 'success',
  run: 'neutral',
  mute: 'ghost',
};

export const FRESHNESS_DOT: Record<Freshness, DotTone> = {
  live: 'green',
  stale: 'yellow',
  offline: 'yellow',
  missing: 'red',
  'not-connected': 'red',
  unread: 'gray',
};

/** "4 min ago", "just now", "2 d ago". */
export function ago(iso: string | null, now: number): string {
  if (!iso) return '';
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (Number.isNaN(elapsed)) return '';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** "26 Oct, 10:42". */
export function stamp(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
