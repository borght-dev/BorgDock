import { newestNote, toItemComment } from '@/services/dispatch/item-text';
import type { AgentThread, LatestMessage } from '@/services/dispatch/types';
import { latestMessage } from '@/services/dispatch/verdict';
import type { WorkItem, WorkItemComment } from '@/types';
import { datedLog, type LogEntry } from './dated-log';
import type { AdoFieldMeta } from './fields';
import { isHtmlField } from './form-model';

/** The field the team keeps its dated updates in, when it has one. */
const NOTES_FIELD = 'Custom.DeveloperNotes';

export interface NotesField {
  key: string;
  label: string;
  html: string;
  entries: LogEntry[];
}

/**
 * The item's log of dated updates: Developer Notes when it has them, else the
 * first long-text field written as one.
 */
export function notesFieldOf(
  item: WorkItem,
  defs?: Map<string, AdoFieldMeta> | null,
): NotesField | null {
  const keys = [
    NOTES_FIELD,
    ...Object.keys(item.fields).filter((k) => k !== NOTES_FIELD && k !== 'System.History'),
  ];
  for (const key of keys) {
    const value = item.fields[key];
    if (typeof value !== 'string' || !isHtmlField(key, value, defs)) continue;
    const entries = datedLog(value);
    if (entries && entries.length > 0) {
      const label = defs?.get(key)?.name ?? (key === NOTES_FIELD ? 'Developer Notes' : key);
      return { key, label, html: value, entries };
    }
  }
  return null;
}

export interface ItemLatest {
  message: LatestMessage;
  /** The newest log entry when the latest thing said is a note. */
  entry: LogEntry | null;
  /** The log's name when the latest thing said is a note. */
  notesLabel: string | null;
}

/**
 * The newest thing said about the item, by Dispatch's rule (`latestMessage`):
 * its newest comment, its newest dated note, or the last message of the agent
 * working on it.
 */
export function itemLatest(input: {
  notes: NotesField | null;
  /** The newest comment, when known. */
  newestComment: WorkItemComment | null;
  threads?: readonly AgentThread[];
}): ItemLatest | null {
  const { notes, newestComment, threads = [] } = input;
  const newestEntry = notes?.entries[0] ?? null;
  const message = latestMessage(
    {
      lastComment: newestComment ? toItemComment(newestComment, null) : null,
      notes: notes ? newestNote(notes.html) : null,
    },
    threads,
  );
  if (!message) return null;
  const isNotes = message.source === 'notes';
  return {
    message,
    entry: isNotes ? newestEntry : null,
    notesLabel: isNotes ? (notes?.label ?? null) : null,
  };
}
