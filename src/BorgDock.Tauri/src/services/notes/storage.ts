import { commands } from '@/generated/commands';
import { commandData } from '@/services/native-command';

export interface StoredNote {
  path: string;
  modifiedMs: number;
  size: number;
}

export type NoteWriteOutcome = { status: 'written' } | { status: 'conflict'; disk: string | null };

/**
 * Where notes live. `folder` is the sync folder from settings, or `null`
 * for this machine's own folder.
 */
export interface NotesStorage {
  folderPath(folder: string | null): Promise<string>;
  list(folder: string | null): Promise<StoredNote[]>;
  /** Each note's text; `null` for a note that is gone. */
  readMany(folder: string | null, paths: string[]): Promise<Map<string, string | null>>;
  /** Write over `base`, the text last read; `null` creates the note. */
  write(
    folder: string | null,
    path: string,
    contents: string,
    base: string | null,
  ): Promise<NoteWriteOutcome>;
  rename(folder: string | null, from: string, to: string): Promise<void>;
  trash(folder: string | null, path: string): Promise<void>;
}

export const nativeNotesStorage: NotesStorage = {
  folderPath: (folder) => commandData(commands.notesFolderPath(folder)),
  list: (folder) =>
    commandData(commands.notesList(folder)).then((files) =>
      files.map((file) => ({
        path: file.path,
        modifiedMs: file.modifiedMs ?? 0,
        size: file.size ?? 0,
      })),
    ),
  readMany: (folder, paths) =>
    commandData(commands.notesReadMany(folder, paths)).then(
      (read) => new Map(read.map((note) => [note.path, note.contents ?? null])),
    ),
  write: async (folder, path, contents, base) => {
    const outcome = await commandData(commands.notesWrite(folder, path, contents, base));
    return outcome.status === 'written'
      ? { status: 'written' }
      : { status: 'conflict', disk: outcome.disk ?? null };
  },
  rename: (folder, from, to) => commandData(commands.notesRename(folder, from, to)).then(() => {}),
  trash: (folder, path) => commandData(commands.notesTrash(folder, path)).then(() => {}),
};

/**
 * The same contract in memory, for tests and Storybook: a write over text the
 * writer didn't read is a conflict, a rename never replaces a note.
 */
export function memoryNotesStorage(
  initial: Record<string, string> = {},
): NotesStorage & { files: Map<string, { text: string; modifiedMs: number }> } {
  let clock = 1;
  const files = new Map(
    Object.entries(initial).map(([path, text]) => [path, { text, modifiedMs: clock++ }]),
  );
  return {
    files,
    folderPath: async (folder) => (folder ? `${folder}/BorgDock Notes` : 'BorgDock Notes'),
    list: async () =>
      [...files.entries()]
        .map(([path, file]) => ({ path, modifiedMs: file.modifiedMs, size: file.text.length }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    readMany: async (_folder, paths) =>
      new Map(paths.map((path) => [path, files.get(path)?.text ?? null])),
    write: async (_folder, path, contents, base) => {
      const disk = files.get(path)?.text ?? null;
      if (disk !== base) return { status: 'conflict', disk };
      files.set(path, { text: contents, modifiedMs: clock++ });
      return { status: 'written' };
    },
    rename: async (_folder, from, to) => {
      const file = files.get(from);
      if (!file) throw `${from} is gone.`;
      if (files.has(to) && to.toLowerCase() !== from.toLowerCase()) throw `${to} already exists.`;
      files.delete(from);
      files.set(to, { ...file, modifiedMs: clock++ });
    },
    trash: async (_folder, path) => {
      files.delete(path);
    },
  };
}
