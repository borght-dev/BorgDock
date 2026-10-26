import { create } from 'zustand';
import { createLogger } from '@/services/logger';
import type { EditContext, EditResult } from '@/services/workstreams/edits';
import { applyChoice, type FieldConflict, mergeDocuments } from '@/services/workstreams/merge';
import {
  type Device,
  limitProblem,
  newDocument,
  readDocument,
} from '@/services/workstreams/schema';
import {
  nativeStorage,
  type StoredFile,
  type WorkstreamStorage,
} from '@/services/workstreams/storage';
import type { WorkstreamDocument, WorkstreamStatus } from '@/services/workstreams/types';
import { persistToTauriStore, readFromTauriStore } from '@/utils/tauri-persist';

// Workstream titles, goals and notes are the user's own words: logs name
// workstreams by id only.
const log = createLogger('workstreams');

/** Edits not yet on disk, kept so a crash or a failed write loses nothing. */
const PENDING_FILE = 'workstreams-pending.json';
const PENDING_KEY = 'pending';
const DEVICE_FILE = 'workstreams-device.json';
const DEVICE_KEY = 'device';
/** Typing in a text field writes once it pauses. */
const TEXT_DEBOUNCE_MS = 400;
/** A file that fails to parse this often in a row is malformed, not half-written by a sync client. */
const MALFORMED_AFTER = 2;
const UNDO_DEPTH = 10;

export interface Conflict {
  theirs: WorkstreamDocument;
  conflicts: FieldConflict[];
  /** The merge so far: mine where both changed, everything else merged. */
  merged: WorkstreamDocument;
  /** A sync client's copy, when the conflict came from one. */
  copyFileName: string | null;
  theirsDevice: string;
}

export interface Entry {
  document: WorkstreamDocument;
  /** The revision on disk this machine last read or wrote: the base of every write and merge. */
  base: WorkstreamDocument | null;
  readOnly: boolean;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  conflict: Conflict | null;
}

export interface Unreadable {
  id: string;
  fileName: string;
  reason: string;
}

export interface TrashedSummary {
  id: string;
  title: string;
  deletedMs: number;
}

interface WorkstreamsState {
  loaded: boolean;
  loadError: string | null;
  /** The sync folder from settings; `null`: this machine only. */
  folder: string | null;
  device: Device;
  entries: Record<string, Entry>;
  unreadable: Unreadable[];
  trashed: TrashedSummary[];
  filter: WorkstreamStatus;
  search: string;

  load: (folder: string | null) => Promise<void>;
  /** Read what changed in the folder since the last look. */
  refresh: () => Promise<void>;
  create: (title: string) => string;
  /**
   * Change one workstream. `text` edits wait for typing to pause before they
   * are written; others are written at once. Returns the error, if any.
   */
  edit: (
    id: string,
    change: (document: WorkstreamDocument, context: EditContext) => EditResult,
    options?: { text?: boolean; undoable?: boolean },
  ) => string | null;
  undo: (id: string) => boolean;
  canUndo: (id: string) => boolean;
  retrySave: (id: string) => void;
  /** Finish a conflict: `choices` names `theirs` for every field to take from the other side. */
  resolveConflict: (id: string, choices: Record<string, 'mine' | 'theirs'>) => void;
  trash: (id: string) => Promise<void>;
  restoreTrashed: (id: string) => Promise<void>;
  restoreBackup: (id: string) => Promise<void>;
  setFilter: (filter: WorkstreamStatus) => void;
  setSearch: (search: string) => void;
  setDeviceLabel: (label: string | null) => void;
}

let storage: WorkstreamStorage = nativeStorage;

/** Tests and Storybook use an in-memory folder. */
export function setWorkstreamStorage(next: WorkstreamStorage): void {
  storage = next;
}

const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const writing = new Map<string, Promise<void>>();
/** Edits that came in while a write was under way: write again after it. */
const writeAgain = new Set<string>();
const undoStacks = new Map<string, WorkstreamDocument[]>();
/** Workstreams trashed this session: a slow read must not bring one back. */
const trashedThisSession = new Set<string>();
/** What each file looked like at the last look, so unchanged ones aren't read again. */
const seenFiles = new Map<string, string>();
const parseFailures = new Map<string, number>();
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let loadGeneration = 0;
let fallbackDeviceLabel = 'This computer';
let deviceLabelOverride: string | null = null;

function now(): string {
  return new Date().toISOString();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fileSignature(file: StoredFile): string {
  return `${file.modifiedMs}:${file.size}`;
}

function serialize(document: WorkstreamDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function parse(contents: string): ReturnType<typeof readDocument> {
  try {
    return readDocument(JSON.parse(contents));
  } catch {
    return { ok: false, reason: 'The file is not valid JSON.' };
  }
}

function deviceLabel(): string {
  return deviceLabelOverride?.trim() || fallbackDeviceLabel;
}

export const useWorkstreamsStore = create<WorkstreamsState>()((set, get) => {
  const patch = (id: string, change: Partial<Entry>) =>
    set((state) => {
      const entry = state.entries[id];
      if (!entry) return state;
      return { entries: { ...state.entries, [id]: { ...entry, ...change } } };
    });

  const persistPending = () => {
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      const pending: Record<
        string,
        { document: WorkstreamDocument; base: WorkstreamDocument | null }
      > = {};
      for (const [id, entry] of Object.entries(get().entries)) {
        if (entry.dirty) pending[id] = { document: entry.document, base: entry.base };
      }
      persistToTauriStore(PENDING_FILE, PENDING_KEY, pending).catch(() => {});
    }, 250);
  };

  /** Take `theirs` in: replace, or merge with what is not written yet. */
  const takeTheirs = (
    id: string,
    theirs: WorkstreamDocument,
    readOnly: boolean,
    copyFileName: string | null,
  ) => {
    const entry = get().entries[id];
    if (!entry) {
      // A sync client's copy of a workstream this machine doesn't hold: the real file decides.
      if (copyFileName) return;
      set((state) => ({
        entries: {
          ...state.entries,
          [id]: {
            document: theirs,
            base: theirs,
            readOnly,
            dirty: false,
            saving: false,
            saveError: null,
            conflict: null,
          },
        },
      }));
      return;
    }
    if (!copyFileName && entry.base && theirs.revision <= entry.base.revision) return;
    if (!entry.dirty && !copyFileName) {
      patch(id, { document: theirs, base: theirs, readOnly, conflict: null });
      return;
    }
    // A copy shares no known base with this machine: every difference is a choice.
    const merge = mergeDocuments(copyFileName ? null : entry.base, entry.document, theirs);
    if (merge.conflicts.length === 0) {
      patch(id, {
        document: copyFileName
          ? { ...merge.document, revision: entry.document.revision }
          : merge.document,
        base: copyFileName ? entry.base : theirs,
        readOnly,
        dirty: true,
        conflict: null,
      });
      if (copyFileName) {
        storage.trash(get().folder, copyFileName).catch(() => {});
      }
      persistPending();
      scheduleWrite(id, 0);
      return;
    }
    patch(id, {
      readOnly,
      ...(copyFileName ? {} : { base: theirs }),
      conflict: {
        theirs,
        conflicts: merge.conflicts,
        merged: merge.document,
        copyFileName,
        theirsDevice: theirs.writtenBy.deviceLabel || 'another machine',
      },
    });
  };

  const writeNow = async (id: string): Promise<void> => {
    const entry = get().entries[id];
    if (!entry?.dirty || entry.readOnly || entry.conflict) return;
    const folder = get().folder;
    const baseRevision = entry.base?.revision ?? null;
    const document: WorkstreamDocument = {
      ...entry.document,
      revision: (baseRevision ?? 0) + 1,
      updatedAt: now(),
      writtenBy: get().device,
    };
    const sent = entry.document;
    patch(id, { saving: true });
    try {
      const outcome = await storage.write(
        folder,
        id,
        serialize(document),
        entry.base ? baseRevision : null,
      );
      if (get().folder !== folder) return;
      if (outcome.status === 'written') {
        const current = get().entries[id];
        if (!current) return;
        const changedSince = current.document !== sent;
        patch(id, {
          base: document,
          document: changedSince ? { ...current.document, revision: document.revision } : document,
          dirty: changedSince,
          saving: false,
          saveError: null,
        });
        if (changedSince) writeAgain.add(id);
        else persistPending();
        return;
      }
      patch(id, { saving: false });
      const disk = parse(outcome.disk);
      if (!disk.ok) {
        patch(id, { saveError: disk.reason });
        return;
      }
      takeTheirs(id, disk.document, disk.readOnly, null);
    } catch (error) {
      log.warn('workstream not saved', { id, error: errorText(error) });
      patch(id, { saving: false, saveError: errorText(error) });
    }
  };

  const runWrite = (id: string) => {
    const running = writing.get(id);
    if (running) {
      writeAgain.add(id);
      return running;
    }
    const job = (async () => {
      do {
        writeAgain.delete(id);
        await writeNow(id);
      } while (writeAgain.has(id) && !get().entries[id]?.saveError);
    })().finally(() => {
      if (writing.get(id) === job) writing.delete(id);
    });
    writing.set(id, job);
    return job;
  };

  const scheduleWrite = (id: string, delay: number) => {
    clearTimeout(writeTimers.get(id));
    writeTimers.set(
      id,
      setTimeout(() => {
        writeTimers.delete(id);
        void runWrite(id);
      }, delay),
    );
  };

  const readFile = async (folder: string | null, file: StoredFile, generation: number) => {
    let contents: string;
    try {
      contents = await storage.read(folder, file.fileName);
    } catch (error) {
      if (String(error) === 'missing') return;
      throw error;
    }
    if (generation !== loadGeneration || trashedThisSession.has(file.id)) return;
    const parsed = parse(contents);
    if (!parsed.ok) {
      const failures = (parseFailures.get(file.fileName) ?? 0) + 1;
      parseFailures.set(file.fileName, failures);
      // Seen once: maybe a sync client is still writing it. Look again next time.
      if (failures < MALFORMED_AFTER) seenFiles.delete(file.fileName);
      else if (!file.conflictCopy) {
        set((state) => ({
          unreadable: [
            ...state.unreadable.filter((u) => u.id !== file.id),
            { id: file.id, fileName: file.fileName, reason: parsed.reason },
          ],
        }));
      }
      return;
    }
    parseFailures.delete(file.fileName);
    set((state) => ({ unreadable: state.unreadable.filter((u) => u.fileName !== file.fileName) }));
    if (parsed.document.id !== file.id) return;
    takeTheirs(file.id, parsed.document, parsed.readOnly, file.conflictCopy ? file.fileName : null);
  };

  const scan = async (generation: number) => {
    const folder = get().folder;
    const files = await storage.list(folder);
    if (generation !== loadGeneration) return;
    const present = new Set(files.map((f) => f.fileName));
    for (const name of [...seenFiles.keys()]) if (!present.has(name)) seenFiles.delete(name);
    set((state) => ({
      unreadable: state.unreadable.filter((u) => present.has(u.fileName)),
    }));
    // The real files first, so a sync client's copy merges into a loaded workstream.
    const ordered = [...files].sort((a, b) => Number(a.conflictCopy) - Number(b.conflictCopy));
    for (const file of ordered) {
      const signature = fileSignature(file);
      if (seenFiles.get(file.fileName) === signature) continue;
      seenFiles.set(file.fileName, signature);
      await readFile(folder, file, generation);
      if (generation !== loadGeneration) return;
    }
  };

  const readTrash = async () => {
    try {
      const trashed = await storage.trashed(get().folder);
      set({
        trashed: trashed.flatMap((file) => {
          const parsed = parse(file.contents);
          return parsed.ok
            ? [{ id: file.id, title: parsed.document.title, deletedMs: file.deletedMs }]
            : [];
        }),
      });
    } catch {
      set({ trashed: [] });
    }
  };

  const loadDevice = async (): Promise<Device> => {
    const stored = await readFromTauriStore<Device>(DEVICE_FILE, DEVICE_KEY).catch(() => undefined);
    fallbackDeviceLabel = await storage.deviceName().catch(() => fallbackDeviceLabel);
    const deviceId = stored?.deviceId || crypto.randomUUID();
    if (!stored?.deviceId)
      persistToTauriStore(DEVICE_FILE, DEVICE_KEY, { deviceId }).catch(() => {});
    return { deviceId, deviceLabel: deviceLabel() };
  };

  const restorePending = async () => {
    const pending = await readFromTauriStore<Record<string, { document: unknown; base: unknown }>>(
      PENDING_FILE,
      PENDING_KEY,
    ).catch(() => undefined);
    for (const [id, saved] of Object.entries(pending ?? {})) {
      const mine = readDocument(saved.document);
      if (!mine.ok || mine.readOnly || trashedThisSession.has(id)) continue;
      const base = saved.base ? readDocument(saved.base) : null;
      const entry = get().entries[id];
      const baseDocument = base?.ok ? base.document : null;
      if (!entry) {
        set((state) => ({
          entries: {
            ...state.entries,
            [id]: {
              document: mine.document,
              base: baseDocument,
              readOnly: false,
              dirty: true,
              saving: false,
              saveError: null,
              conflict: null,
            },
          },
        }));
      } else if (entry.base && baseDocument && entry.base.revision !== baseDocument.revision) {
        // The file moved on while this machine was away: merge from the old base.
        patch(id, { document: mine.document, base: baseDocument, dirty: true });
        takeTheirs(id, entry.base, entry.readOnly, null);
        continue;
      } else {
        patch(id, { document: mine.document, dirty: true });
      }
      scheduleWrite(id, 0);
    }
  };

  return {
    loaded: false,
    loadError: null,
    folder: null,
    device: { deviceId: '', deviceLabel: 'This computer' },
    entries: {},
    unreadable: [],
    trashed: [],
    filter: 'active',
    search: '',

    load: async (folder) => {
      const generation = ++loadGeneration;
      for (const timer of writeTimers.values()) clearTimeout(timer);
      writeTimers.clear();
      seenFiles.clear();
      parseFailures.clear();
      set({ folder, entries: {}, unreadable: [], loaded: false, loadError: null });
      try {
        const device = await loadDevice();
        if (generation !== loadGeneration) return;
        set({ device });
        await scan(generation);
        if (generation !== loadGeneration) return;
        await restorePending();
        set({ loaded: true });
        void readTrash();
      } catch (error) {
        if (generation !== loadGeneration) return;
        log.warn('workstreams not loaded', { error: errorText(error) });
        set({ loaded: true, loadError: errorText(error) });
      }
    },

    refresh: async () => {
      if (!get().loaded) return;
      try {
        await scan(loadGeneration);
        if (get().loadError) set({ loadError: null });
      } catch (error) {
        set({ loadError: errorText(error) });
      }
    },

    create: (title) => {
      const document = newDocument(title, now(), get().device);
      const created = {
        ...document,
        log: [
          {
            id: crypto.randomUUID(),
            at: document.createdAt,
            device: deviceLabel(),
            kind: 'created' as const,
            summary: 'Created the workstream',
            refs: [],
          },
        ],
      };
      set((state) => ({
        entries: {
          ...state.entries,
          [document.id]: {
            document: created,
            base: null,
            readOnly: false,
            dirty: true,
            saving: false,
            saveError: null,
            conflict: null,
          },
        },
      }));
      persistPending();
      scheduleWrite(document.id, 0);
      return document.id;
    },

    edit: (id, change, options = {}) => {
      const entry = get().entries[id];
      if (!entry) return 'That workstream is gone.';
      if (entry.readOnly) return 'This workstream was made by a newer BorgDock. Update to edit it.';
      if (entry.conflict) return 'Choose what to keep from the other version first.';
      const result = change(entry.document, { now: now(), device: deviceLabel() });
      if ('error' in result) return result.error;
      if (result.document === entry.document) return null;
      const problem = limitProblem(result.document);
      if (problem) return problem;
      if (options.undoable) {
        const stack = undoStacks.get(id) ?? [];
        undoStacks.set(id, [entry.document, ...stack].slice(0, UNDO_DEPTH));
      }
      patch(id, { document: result.document, dirty: true });
      persistPending();
      scheduleWrite(id, options.text ? TEXT_DEBOUNCE_MS : 0);
      return null;
    },

    undo: (id) => {
      const stack = undoStacks.get(id);
      const previous = stack?.[0];
      const entry = get().entries[id];
      if (!previous || !entry) return false;
      undoStacks.set(id, stack.slice(1));
      patch(id, { document: { ...previous, revision: entry.document.revision }, dirty: true });
      persistPending();
      scheduleWrite(id, 0);
      return true;
    },

    canUndo: (id) => (undoStacks.get(id)?.length ?? 0) > 0,

    retrySave: (id) => {
      patch(id, { saveError: null });
      void runWrite(id);
    },

    resolveConflict: (id, choices) => {
      const entry = get().entries[id];
      const conflict = entry?.conflict;
      if (!entry || !conflict) return;
      let document = conflict.merged;
      for (const field of conflict.conflicts) {
        const value = choices[field.path] === 'theirs' ? field.theirs : field.mine;
        document = applyChoice(document, field, value);
      }
      const resolved: WorkstreamDocument = {
        ...document,
        log: [
          {
            id: crypto.randomUUID(),
            at: now(),
            device: deviceLabel(),
            kind: 'conflict-resolved' as const,
            summary: `Merged with the version from ${conflict.theirsDevice}`,
            refs: [],
          },
          ...document.log,
        ],
      };
      patch(id, { document: resolved, dirty: true, conflict: null, saveError: null });
      persistPending();
      if (conflict.copyFileName) {
        const copy = conflict.copyFileName;
        storage
          .trash(get().folder, copy)
          .catch((error) => log.warn('copy not trashed', { id, error: errorText(error) }));
      }
      scheduleWrite(id, 0);
    },

    trash: async (id) => {
      trashedThisSession.add(id);
      clearTimeout(writeTimers.get(id));
      await writing.get(id);
      const entry = get().entries[id];
      set((state) => {
        const { [id]: _gone, ...entries } = state.entries;
        return { entries };
      });
      if (entry?.base) {
        try {
          await storage.trash(get().folder, `${id}.json`);
        } catch (error) {
          if (String(error) !== 'missing') {
            trashedThisSession.delete(id);
            if (entry) set((state) => ({ entries: { ...state.entries, [id]: entry } }));
            throw error;
          }
        }
      }
      persistPending();
      await readTrash();
    },

    restoreTrashed: async (id) => {
      await storage.restore(get().folder, id);
      trashedThisSession.delete(id);
      seenFiles.delete(`${id}.json`);
      await scan(loadGeneration);
      await readTrash();
    },

    restoreBackup: async (id) => {
      await storage.restoreBackup(get().folder, id);
      seenFiles.delete(`${id}.json`);
      parseFailures.delete(`${id}.json`);
      set((state) => ({ unreadable: state.unreadable.filter((u) => u.id !== id) }));
      await scan(loadGeneration);
    },

    setFilter: (filter) => set({ filter }),
    setSearch: (search) => set({ search }),
    setDeviceLabel: (label) => {
      deviceLabelOverride = label;
      set((state) => ({ device: { ...state.device, deviceLabel: deviceLabel() } }));
    },
  };
});

/** Forget everything kept between calls (tests). */
export function resetWorkstreamsStore(): void {
  for (const timer of writeTimers.values()) clearTimeout(timer);
  writeTimers.clear();
  writing.clear();
  writeAgain.clear();
  undoStacks.clear();
  trashedThisSession.clear();
  seenFiles.clear();
  parseFailures.clear();
  clearTimeout(pendingTimer);
  loadGeneration++;
  deviceLabelOverride = null;
  useWorkstreamsStore.setState({
    loaded: false,
    loadError: null,
    folder: null,
    entries: {},
    unreadable: [],
    trashed: [],
    filter: 'active',
    search: '',
  });
}

/** Wait until every write that is queued or running has finished (tests, switching folders). */
export async function settleWrites(): Promise<void> {
  for (let round = 0; round < 20; round++) {
    const timers = [...writeTimers.keys()];
    for (const id of timers) {
      clearTimeout(writeTimers.get(id));
      writeTimers.delete(id);
      void useWorkstreamsStore.getState().retrySave(id);
    }
    const running = [...writing.values()];
    if (running.length === 0 && timers.length === 0) return;
    await Promise.all(running);
  }
}
