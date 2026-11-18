import { create } from 'zustand';
import { createLogger } from '@/services/logger';
import { type ParsedNote, parseNote, titleOf } from '@/services/notes/parse';
import { folderOf, pathFor, uniquePath } from '@/services/notes/paths';
import { type NotesStorage, nativeNotesStorage } from '@/services/notes/storage';
import { renameFolderLinks, renameLinks } from '@/services/notes/text-edits';
import { retargetThreads } from '@/services/notes/thread-tracking';
import {
  buildIndex,
  EMPTY_INDEX,
  type RefContext,
  resolveLink,
  type VaultIndex,
} from '@/services/notes/vault-index';
import { useSettingsStore } from './settings-store';

const log = createLogger('notes');

/** How long the editor waits after the last keystroke before it saves. */
export const AUTOSAVE_MS = 500;
const OPEN_NOTE_KEY = 'borgdock.notes.open';

let storage: NotesStorage = nativeNotesStorage;

/** Tests and Storybook swap the native vault for one in memory. */
export function setNotesStorage(next: NotesStorage) {
  storage = next;
}

export type NotesView = 'note' | 'tasks';

interface NotesState {
  /** The sync folder the vault sits in; `undefined` until loaded. */
  folder: string | null | undefined;
  vaultPath: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  files: Record<string, { modifiedMs: number; size: number }>;
  folders: string[];
  /** What each note held on disk when it was last read: the base of every write. */
  texts: Record<string, string>;
  parsed: Record<string, ParsedNote>;
  index: VaultIndex;
  context: RefContext;
  /** Unsaved edits, by path. */
  buffers: Record<string, string>;
  /** Notes whose file changed under an unsaved edit: what the file holds now (`null`: gone). */
  conflicts: Record<string, string | null>;
  openPath: string | null;
  view: NotesView;

  load(folder: string | null): Promise<void>;
  refresh(): Promise<void>;
  setContext(context: RefContext): void;
  open(path: string | null): void;
  setView(view: NotesView): void;
  /** The text the editor shows: the unsaved edit, else what the file holds. */
  textOf(path: string): string | undefined;
  edit(path: string, text: string): void;
  flush(path?: string): Promise<void>;
  /** A new note in `folder` titled `title` (numbered when taken); its path. */
  createNote(title: string, folder: string, text?: string): Promise<string>;
  /** Write a new note at `path`; `false` when one exists there. */
  createAt(path: string, text: string): Promise<boolean>;
  rename(path: string, title: string): Promise<string>;
  move(path: string, destination: string): Promise<string>;
  saveFolder(path: string, from?: string): Promise<void>;
  trash(path: string, isFolder?: boolean): Promise<void>;
  resolveConflict(path: string, keep: 'disk' | 'mine'): Promise<void>;
  /**
   * Change a note on disk: `change` gets what the file holds now (`null`
   * when it doesn't exist) and returns the new text, or `null` to leave it.
   * Retries once when the file changes in between.
   */
  update(path: string, change: (text: string | null) => string | null): Promise<boolean>;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** The save in flight for each note: the next one waits, then reads the buffer again. */
const writing = new Map<string, Promise<void>>();
let generation = 0;

function rememberedOpenNote(): string | null {
  try {
    return window.localStorage.getItem(OPEN_NOTE_KEY);
  } catch {
    return null;
  }
}

function rememberOpenNote(path: string | null) {
  try {
    if (path) window.localStorage.setItem(OPEN_NOTE_KEY, path);
    else window.localStorage.removeItem(OPEN_NOTE_KEY);
  } catch {
    // Remembering the open note is a convenience.
  }
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const { [key]: _gone, ...rest } = record;
  return rest;
}

export const useNotesStore = create<NotesState>()((set, get) => {
  const reindex = (parsed: Record<string, ParsedNote>, context = get().context) =>
    buildIndex(Object.values(parsed), context);

  /** A note's text is now `text` on disk. */
  const stored = (path: string, text: string, modifiedMs = Date.now()) => {
    const state = get();
    const parsed = { ...state.parsed, [path]: parseNote(path, text) };
    const buffer = state.buffers[path];
    set({
      texts: { ...state.texts, [path]: text },
      parsed,
      index: reindex(parsed),
      files: { ...state.files, [path]: { modifiedMs, size: text.length } },
      buffers: buffer === text ? without(state.buffers, path) : state.buffers,
    });
  };

  const forget = (path: string) => {
    const state = get();
    const parsed = without(state.parsed, path);
    set({
      texts: without(state.texts, path),
      parsed,
      index: reindex(parsed),
      files: without(state.files, path),
      buffers: without(state.buffers, path),
      conflicts: without(state.conflicts, path),
      openPath: state.openPath === path ? null : state.openPath,
    });
  };

  /** Write a note's unsaved edit over the text last read from its file. */
  const saveBuffer = async (p: string) => {
    const state = get();
    const buffer = state.buffers[p];
    if (buffer === undefined || p in state.conflicts || state.folder === undefined) return;
    const base = state.texts[p] ?? null;
    try {
      const outcome = await storage.write(state.folder, p, buffer, base);
      if (outcome.status === 'written') {
        // A keystroke during the write keeps its own, newer buffer.
        const now = get().buffers[p];
        stored(p, buffer);
        if (now !== undefined && now !== buffer) {
          clearTimeout(timers.get(p));
          timers.set(
            p,
            setTimeout(() => void get().flush(p), AUTOSAVE_MS),
          );
        }
      } else {
        set({ conflicts: { ...get().conflicts, [p]: outcome.disk } });
      }
    } catch (error) {
      log.error(`saving ${p} failed`, error);
    }
  };

  const relocateNote = async (path: string, target: string, moving: boolean) => {
    const state = get();
    const { folder } = state;
    if (folder === undefined || path === target) return path;
    const mine = generation;
    await get().flush(path);
    if (mine !== generation) throw new Error('The vault changed. Try again.');
    if (get().buffers[path] !== undefined || path in get().conflicts) {
      throw new Error('The note has changes that are not saved yet. Resolve them first.');
    }
    const backlinks = new Set((get().index.backlinks.get(path) ?? []).map(({ path }) => path));
    await storage.rename(folder, path, target);
    if (mine !== generation) return target;
    retargetThreads(path, target);
    const { texts, openPath } = get();
    forget(path);
    if (texts[path] !== undefined) stored(target, texts[path]);
    if (openPath === path) get().open(target);
    const oldNames = [path, path.replace(/\.md$/i, '')];
    if (!moving || resolveLink(get().index, titleOf(path)) !== target) {
      oldNames.push(titleOf(path), `${titleOf(path)}.md`);
    }
    const newName = moving ? target.replace(/\.md$/i, '') : titleOf(target);
    for (const note of backlinks) {
      if (mine !== generation) break;
      await get().update(note === path ? target : note, (current) =>
        current === null ? null : renameLinks(current, oldNames, newName),
      );
    }
    return target;
  };

  return {
    folder: undefined,
    vaultPath: null,
    status: 'idle',
    error: null,
    files: {},
    folders: [],
    texts: {},
    parsed: {},
    index: EMPTY_INDEX,
    context: { adoOrganization: null, adoProject: null, repos: [] },
    buffers: {},
    conflicts: {},
    openPath: null,
    view: 'note',

    load: async (folder) => {
      const mine = ++generation;
      set({ folder, status: 'loading', error: null });
      try {
        const [vaultPath, { notes: list, folders }] = await Promise.all([
          storage.folderPath(folder),
          storage.list(folder),
        ]);
        const read = await storage.readMany(
          folder,
          list.map((f) => f.path),
        );
        if (mine !== generation) return;
        const texts: Record<string, string> = {};
        const parsed: Record<string, ParsedNote> = {};
        const files: NotesState['files'] = {};
        for (const file of list) {
          const text = read.get(file.path);
          if (text == null) continue;
          texts[file.path] = text;
          parsed[file.path] = parseNote(file.path, text);
          files[file.path] = { modifiedMs: file.modifiedMs, size: file.size };
        }
        const remembered = get().openPath ?? rememberedOpenNote();
        set({
          vaultPath,
          folders,
          texts,
          parsed,
          files,
          index: reindex(parsed),
          buffers: {},
          conflicts: {},
          status: 'ready',
          openPath: remembered && texts[remembered] !== undefined ? remembered : null,
        });
      } catch (error) {
        if (mine !== generation) return;
        log.error('loading the vault failed', error);
        set({ status: 'error', error: String(error) });
      }
    },

    refresh: async () => {
      const state = get();
      if (state.folder === undefined || state.status === 'loading') return;
      const mine = generation;
      const folder = state.folder;
      try {
        const { notes: list, folders } = await storage.list(folder);
        if (mine !== generation) return;
        const known = get().files;
        const changed = list.filter((file) => {
          const before = known[file.path];
          return !before || before.modifiedMs !== file.modifiedMs || before.size !== file.size;
        });
        const listed = new Set(list.map((f) => f.path));
        const removed = Object.keys(known).filter((path) => !listed.has(path));
        if (!changed.length && !removed.length) {
          const previous = get().folders;
          if (
            previous.length !== folders.length ||
            previous.some((path, i) => path !== folders[i])
          ) {
            set({ folders });
          }
          return;
        }
        const read = changed.length
          ? await storage.readMany(
              folder,
              changed.map((f) => f.path),
            )
          : new Map<string, string | null>();
        if (mine !== generation) return;

        let { texts, parsed, files, buffers, conflicts } = get();
        texts = { ...texts };
        parsed = { ...parsed };
        files = { ...files };
        conflicts = { ...conflicts };
        for (const file of changed) {
          const text = read.get(file.path);
          if (text == null) continue;
          files[file.path] = { modifiedMs: file.modifiedMs, size: file.size };
          if (texts[file.path] === text) continue;
          const buffer = buffers[file.path];
          if (buffer !== undefined && buffer !== text) {
            conflicts[file.path] = text;
            continue;
          }
          texts[file.path] = text;
          parsed[file.path] = parseNote(file.path, text);
        }
        for (const path of removed) {
          if (buffers[path] !== undefined) {
            conflicts[path] = null;
            continue;
          }
          delete texts[path];
          delete parsed[path];
          delete files[path];
        }
        const openPath = get().openPath;
        set({
          texts,
          folders,
          parsed,
          files,
          conflicts,
          index: reindex(parsed),
          openPath:
            openPath && texts[openPath] === undefined && buffers[openPath] === undefined
              ? null
              : openPath,
        });
      } catch (error) {
        log.warn('refreshing the vault failed', { error: String(error) });
      }
    },

    setContext: (context) => {
      set({ context, index: reindex(get().parsed, context) });
    },

    open: (path) => {
      const previous = get().openPath;
      if (previous && previous !== path) void get().flush(previous);
      rememberOpenNote(path);
      set({ openPath: path, view: 'note' });
    },

    setView: (view) => set({ view }),

    textOf: (path) => get().buffers[path] ?? get().texts[path],

    edit: (path, text) => {
      const state = get();
      if (state.buffers[path] === text) return;
      if (text === state.texts[path] && !(path in state.conflicts)) {
        set({ buffers: without(state.buffers, path) });
        clearTimeout(timers.get(path));
        return;
      }
      set({ buffers: { ...state.buffers, [path]: text } });
      clearTimeout(timers.get(path));
      timers.set(
        path,
        setTimeout(() => void get().flush(path), AUTOSAVE_MS),
      );
    },

    flush: async (path) => {
      const paths = path ? [path] : Object.keys(get().buffers);
      for (const p of paths) {
        clearTimeout(timers.get(p));
        timers.delete(p);
        const pending = (writing.get(p) ?? Promise.resolve()).then(() => saveBuffer(p));
        writing.set(p, pending);
        await pending;
        if (writing.get(p) === pending) writing.delete(p);
      }
    },

    createNote: async (title, folder, text = '') => {
      const taken = new Set(Object.keys(get().texts));
      let path = uniquePath(folder, title, taken);
      for (let attempt = 0; attempt < 5; attempt++) {
        if (await get().createAt(path, text)) return path;
        taken.add(path);
        path = uniquePath(folder, title, taken);
      }
      throw new Error(`Could not create a note called ${title}.`);
    },

    createAt: async (path, text) => {
      const folder = get().folder;
      if (folder === undefined) throw new Error('The vault is not loaded yet.');
      const outcome = await storage.write(folder, path, text, null);
      if (outcome.status === 'conflict') {
        if (outcome.disk !== null) stored(path, outcome.disk);
        return false;
      }
      stored(path, text);
      return true;
    },

    rename: (path, title) => relocateNote(path, pathFor(folderOf(path), title), false),

    move: async (path, destination) => {
      if (destination && !get().folders.includes(destination)) {
        throw new Error('The destination folder is no longer available.');
      }
      const name = path.slice(path.lastIndexOf('/') + 1);
      const target = destination ? `${destination}/${name}` : name;
      return relocateNote(path, target, true);
    },

    saveFolder: async (path, from) => {
      const { folder } = get();
      if (folder === undefined) throw new Error('The vault is not loaded yet.');
      if (path === from) return;
      const mine = generation;
      const prefix = from ? `${from}/` : '';
      const inside = (note: string) => !!prefix && note.startsWith(prefix);
      await Promise.all(
        Object.keys(get().buffers)
          .filter(inside)
          .map((note) => get().flush(note)),
      );
      if (mine !== generation) throw new Error('The vault changed. Try again.');
      if (Object.keys(get().buffers).some(inside)) {
        throw new Error('Resolve unsaved changes in the folder before renaming it.');
      }
      const { openPath, texts } = get();
      await storage.saveFolder(folder, path, from ?? null);
      if (mine !== generation) return;
      if (from) {
        for (const note of Object.keys(texts).filter(inside)) {
          retargetThreads(note, path + note.slice(from.length));
        }
        const settings = useSettingsStore.getState();
        const daily = settings.settings.dailyNoteFolder;
        if (daily && (daily === from || inside(daily))) {
          settings.updateSettings({ dailyNoteFolder: path + daily.slice(from.length) });
        }
      }
      await get().refresh();
      if (mine !== generation || !from) return;
      if (openPath && inside(openPath) && !get().openPath) {
        get().open(path + openPath.slice(from.length));
      }
      for (const [note, text] of Object.entries(get().texts)) {
        if (mine !== generation) return;
        if (renameFolderLinks(text, from, path) === text) continue;
        await get().update(note, (current) =>
          current === null ? null : renameFolderLinks(current, from, path),
        );
      }
    },

    trash: async (path, isFolder = false) => {
      const folder = get().folder;
      if (folder === undefined) return;
      const mine = generation;
      const includes = (note: string) => (isFolder ? note.startsWith(`${path}/`) : note === path);
      const dirty = Object.keys(get().buffers).filter(includes);
      await Promise.all(dirty.map((note) => get().flush(note)));
      if (mine !== generation) return;
      if (Object.keys(get().buffers).some(includes)) {
        throw new Error('Resolve unsaved changes before moving to trash.');
      }
      await storage.trash(folder, path, isFolder);
      if (mine !== generation) return;
      const remembered = rememberedOpenNote();
      if (remembered && includes(remembered)) rememberOpenNote(null);
      if (isFolder) await get().refresh();
      else forget(path);
    },

    resolveConflict: async (path, keep) => {
      const state = get();
      if (!(path in state.conflicts)) return;
      const disk = state.conflicts[path] ?? null;
      const conflicts = without(state.conflicts, path);
      if (keep === 'disk') {
        clearTimeout(timers.get(path));
        set({ conflicts, buffers: without(state.buffers, path) });
        if (disk === null) forget(path);
        else stored(path, disk);
        return;
      }
      // Keep mine: what the file holds now becomes the base the edit is written over.
      const texts = disk === null ? without(state.texts, path) : { ...state.texts, [path]: disk };
      set({ conflicts, texts });
      await get().flush(path);
    },

    update: async (path, change) => {
      const folder = get().folder;
      if (folder === undefined) return false;
      for (let attempt = 0; attempt < 2; attempt++) {
        const disk = (await storage.readMany(folder, [path])).get(path) ?? null;
        const next = change(disk);
        if (next === null || next === disk) return false;
        const outcome = await storage.write(folder, path, next, disk);
        if (outcome.status === 'written') {
          const buffer = get().buffers[path];
          if (buffer !== undefined && buffer !== next) {
            // The editor holds an unsaved edit of this note: show both.
            set({ conflicts: { ...get().conflicts, [path]: next } });
          } else {
            stored(path, next);
          }
          return true;
        }
      }
      return false;
    },
  };
});
