import type { PhoneActivityTarget, PhoneReadsSince } from '@/generated/commands';
import type { ActivityEntry } from '@/services/activity/types';
import { entityKeysOf, type LocalScope, targetsOf } from './targets';

/**
 * Read sync with BorgDock for iPhone. What I read here goes to the server
 * as targets; what I read on the phone marks the matching entries here with
 * reason `phone`, which never goes back. Each direction keeps a cursor; a
 * missing cursor starts at now, so linking never uploads history.
 */

export const SENT_CURSOR = 'borgdock.phoneLink.sentUntil';
export const RECEIVED_CURSOR = 'borgdock.phoneLink.receivedUntil';
export const SHARE_BATCH = 200;

export interface ReadCursor {
  readAt: string;
  id: string;
}

export interface PhoneLinkPort {
  /** Entries read after the cursor, oldest first, without roll-ups and reads from the phone. */
  readSince(cursor: ReadCursor, limit: number): Promise<ActivityEntry[]>;
  sendReads(targets: PhoneActivityTarget[], before: string): Promise<void>;
  readsSince(since: string): Promise<PhoneReadsSince>;
  markRead(entityKeys: string[], before: string): Promise<void>;
}

export interface CursorStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

function sentCursor(cursors: CursorStore): ReadCursor | null {
  try {
    const cursor = JSON.parse(cursors.get(SENT_CURSOR) ?? 'null') as ReadCursor | null;
    return cursor && typeof cursor.readAt === 'string' && typeof cursor.id === 'string'
      ? cursor
      : null;
  } catch {
    return null;
  }
}

/** Sends what I read since the last share; returns how many targets went. */
export async function shareReads(
  port: PhoneLinkPort,
  cursors: CursorStore,
  now: string,
): Promise<number> {
  let cursor = sentCursor(cursors);
  if (!cursor) {
    cursors.set(SENT_CURSOR, JSON.stringify({ readAt: now, id: '' }));
    return 0;
  }
  let sent = 0;
  for (;;) {
    const entries = await port.readSince(cursor, SHARE_BATCH);
    const last = entries.at(-1);
    if (!last?.readAt) break;
    const targets = targetsOf(entries);
    if (targets.length > 0) await port.sendReads(targets, last.readAt);
    sent += targets.length;
    cursor = { readAt: last.readAt, id: last.id };
    cursors.set(SENT_CURSOR, JSON.stringify(cursor));
    if (entries.length < SHARE_BATCH) break;
  }
  return sent;
}

/** Marks here what I read on the phone since the last look; returns how many keys it marked. */
export async function takeReads(
  port: PhoneLinkPort,
  cursors: CursorStore,
  scope: LocalScope,
  now: string,
): Promise<number> {
  const since = cursors.get(RECEIVED_CURSOR);
  if (!since) {
    cursors.set(RECEIVED_CURSOR, now);
    return 0;
  }
  const reads = await port.readsSince(since);
  const keys = [...new Set(reads.targets.flatMap((target) => entityKeysOf(target, scope)))];
  if (keys.length > 0) await port.markRead(keys, reads.until);
  cursors.set(RECEIVED_CURSOR, reads.until);
  return keys.length;
}

/** Sharing off or unlinked: start over at now when it comes back. */
export function forgetCursors(cursors: CursorStore): void {
  cursors.remove(SENT_CURSOR);
  cursors.remove(RECEIVED_CURSOR);
}
