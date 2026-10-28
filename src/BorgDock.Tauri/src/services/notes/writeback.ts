/**
 * Thread results written back: when a thread started from a note stops and
 * waits, its last message is appended to the note under `## Agent notes`,
 * between BorgDock's markers, once per message. This is the only text
 * BorgDock writes that you did not type, and it never edits outside its
 * markers.
 */
import { configuredHosts, rawId } from '@/services/dispatch/hosts';
import type { AgentThread } from '@/services/dispatch/types';
import { createLogger } from '@/services/logger';
import { t3ThreadLastMessage } from '@/services/t3/api';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useNotesStore } from '@/stores/notes-store';
import { useSettingsStore } from '@/stores/settings-store';
import { appendUnderHeading, hasMarkerBlock, markerBlock } from './text-edits';
import { readTracked, type TrackedThread, writeTracked } from './thread-tracking';

const log = createLogger('notes:writeback');
/** A thread that waits is asked for its last message at most this often. */
const ASK_EVERY_MS = 60_000;
/** Threads tracked longer than this stop being followed. */
const FOLLOW_FOR_MS = 14 * 24 * 60 * 60 * 1000;

/** A short, stable id for one message, so the same text is never written twice. */
export function messageId(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/** The note with `message` appended in BorgDock's block, or `null` when it is already there. */
export function withAgentNote(
  text: string,
  thread: Pick<TrackedThread, 'threadId' | 'label'>,
  message: string,
  at: Date,
): string | null {
  const id = `agent ${thread.threadId} ${messageId(message)}`;
  if (hasMarkerBlock(text, id)) return null;
  const when = at.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return appendUnderHeading(
    text,
    'Agent notes',
    markerBlock(id, [`**${thread.label}** · ${when}`, '', message.trim(), '']),
  );
}

const STOPPED = new Set<AgentThread['status']>([
  'your-turn',
  'settled',
  'failed',
  'question',
  'plan',
  'approval',
]);

export function startThreadWriteback(): () => void {
  const askedAt = new Map<string, number>();
  let running = false;

  const check = async (threads: readonly AgentThread[]) => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const tracked = readTracked().filter((t) => now - t.startedAt < FOLLOW_FOR_MS);
      const settings = useSettingsStore.getState().settings;
      for (const entry of tracked) {
        const thread = threads.find(
          (t) => t.hostId === entry.hostId && rawId(t.hostId, t.id) === entry.threadId,
        );
        if (!thread || !STOPPED.has(thread.status) || thread.available === false) continue;
        if (now - (askedAt.get(entry.threadId) ?? 0) < ASK_EVERY_MS) continue;
        askedAt.set(entry.threadId, now);
        const host = configuredHosts(settings).find((h) => h.id === entry.hostId);
        const message = await t3ThreadLastMessage(
          { id: entry.hostId, baseUrl: host?.baseUrl },
          entry.threadId,
        ).catch((error) => {
          log.warn('last message not read', { thread: entry.threadId, error: String(error) });
          return null;
        });
        if (!message?.trim()) continue;
        // A rename while the message was read moved the thread to the note's new path.
        const path = readTracked().find((t) => t.threadId === entry.threadId)?.path ?? entry.path;
        await useNotesStore
          .getState()
          .update(path, (text) =>
            text === null ? null : withAgentNote(text, entry, message, new Date()),
          );
      }
      // Prune what is stored now, so a rename during this pass is kept.
      writeTracked(readTracked().filter((t) => Date.now() - t.startedAt < FOLLOW_FOR_MS));
    } finally {
      running = false;
    }
  };

  const unsubscribe = useDispatchStore.subscribe((state, previous) => {
    if (state.threads !== previous.threads) void check(state.threads);
  });
  return unsubscribe;
}
