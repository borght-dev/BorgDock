import { commands } from '@/generated/commands';
import { commandData } from '@/services/native-command';

/** A file in the workstreams folder. */
export interface StoredFile {
  id: string;
  fileName: string;
  modifiedMs: number;
  size: number;
  /** A sync client's copy next to the real file. */
  conflictCopy: boolean;
}

export type WriteOutcome = { status: 'written' } | { status: 'conflict'; disk: string };

export interface TrashedFile {
  id: string;
  deletedMs: number;
  contents: string;
}

/**
 * Where workstream files live. `folder` is the sync folder from settings, or
 * `null` for this machine's own folder.
 */
export interface WorkstreamStorage {
  folderPath(folder: string | null): Promise<string>;
  list(folder: string | null): Promise<StoredFile[]>;
  /** The file's text; rejects with `missing` when it is gone. */
  read(folder: string | null, fileName: string): Promise<string>;
  /** Write over `expectedRevision`; `null` creates the file. */
  write(
    folder: string | null,
    id: string,
    contents: string,
    expectedRevision: number | null,
  ): Promise<WriteOutcome>;
  trash(folder: string | null, fileName: string): Promise<void>;
  trashed(folder: string | null): Promise<TrashedFile[]>;
  restore(folder: string | null, id: string): Promise<void>;
  restoreBackup(folder: string | null, id: string): Promise<void>;
  deviceName(): Promise<string>;
}

export const nativeStorage: WorkstreamStorage = {
  folderPath: (folder) => commandData(commands.workstreamsFolderPath(folder)),
  list: (folder) =>
    commandData(commands.workstreamsList(folder)).then((files) =>
      files.map((file) => ({ ...file, modifiedMs: file.modifiedMs ?? 0, size: file.size ?? 0 })),
    ),
  read: (folder, fileName) => commandData(commands.workstreamsRead(folder, fileName)),
  write: (folder, id, contents, expectedRevision) =>
    commandData(commands.workstreamsWrite(folder, id, contents, expectedRevision)),
  trash: (folder, fileName) =>
    commandData(commands.workstreamsTrash(folder, fileName)).then(() => {}),
  trashed: (folder) =>
    commandData(commands.workstreamsTrashed(folder)).then((files) =>
      files.map((file) => ({ ...file, deletedMs: file.deletedMs ?? 0 })),
    ),
  restore: (folder, id) => commandData(commands.workstreamsRestore(folder, id)).then(() => {}),
  restoreBackup: (folder, id) =>
    commandData(commands.workstreamsRestoreBackup(folder, id)).then(() => {}),
  deviceName: () => commandData(commands.workstreamsDeviceName()),
};

function revisionOf(contents: string): number | null {
  try {
    const revision = (JSON.parse(contents) as { revision?: unknown }).revision;
    return typeof revision === 'number' ? revision : null;
  } catch {
    return null;
  }
}

/**
 * The same contract in memory, for tests and Storybook. It keeps the rules
 * that matter: a write over the wrong revision is a conflict, and a malformed
 * file is never written over.
 */
export function memoryStorage(initial: Record<string, string> = {}): WorkstreamStorage & {
  files: Map<string, Map<string, { contents: string; modifiedMs: number }>>;
} {
  const files = new Map<string, Map<string, { contents: string; modifiedMs: number }>>();
  const trash = new Map<string, Map<string, TrashedFile>>();
  let clock = 1;
  const folderOf = (folder: string | null) => {
    const key = folder ?? '';
    let entries = files.get(key);
    if (!entries) {
      entries = new Map();
      files.set(key, entries);
    }
    return entries;
  };
  const trashOf = (folder: string | null) => {
    const key = folder ?? '';
    let entries = trash.get(key);
    if (!entries) {
      entries = new Map();
      trash.set(key, entries);
    }
    return entries;
  };
  for (const [name, contents] of Object.entries(initial)) {
    folderOf(null).set(name, { contents, modifiedMs: clock++ });
  }
  const idOf = (fileName: string) => fileName.slice(0, 36);
  return {
    files,
    folderPath: async (folder) => (folder ? `${folder}/BorgDock Workstreams` : 'memory'),
    list: async (folder) =>
      [...folderOf(folder).entries()]
        .filter(([name]) => name.endsWith('.json'))
        .map(([fileName, file]) => ({
          id: idOf(fileName),
          fileName,
          modifiedMs: file.modifiedMs,
          size: file.contents.length,
          conflictCopy: fileName !== `${idOf(fileName)}.json`,
        })),
    read: async (folder, fileName) => {
      const file = folderOf(folder).get(fileName);
      if (!file) throw 'missing';
      return file.contents;
    },
    write: async (folder, id, contents, expectedRevision) => {
      const entries = folderOf(folder);
      const name = `${id}.json`;
      const disk = entries.get(name);
      if (disk) {
        const revision = revisionOf(disk.contents);
        if (revision === null) throw "The file on disk can't be read, so it was left as it is.";
        if (expectedRevision === null || revision !== expectedRevision) {
          return { status: 'conflict', disk: disk.contents };
        }
        entries.set(`${id}.json.bak`, disk);
      } else if (expectedRevision !== null) {
        throw "The workstream's file is gone. It was deleted on another machine.";
      }
      entries.set(name, { contents, modifiedMs: clock++ });
      return { status: 'written' };
    },
    trash: async (folder, fileName) => {
      const entries = folderOf(folder);
      const file = entries.get(fileName);
      if (!file) throw 'missing';
      entries.delete(fileName);
      if (fileName === `${idOf(fileName)}.json`) {
        trashOf(folder).set(idOf(fileName), {
          id: idOf(fileName),
          deletedMs: clock++,
          contents: file.contents,
        });
      }
    },
    trashed: async (folder) =>
      [...trashOf(folder).values()].sort((a, b) => b.deletedMs - a.deletedMs),
    restore: async (folder, id) => {
      const trashed = trashOf(folder).get(id);
      if (!trashed) throw 'missing';
      if (folderOf(folder).has(`${id}.json`)) throw 'A workstream with this id exists again.';
      folderOf(folder).set(`${id}.json`, { contents: trashed.contents, modifiedMs: clock++ });
      trashOf(folder).delete(id);
    },
    restoreBackup: async (folder, id) => {
      const backup = folderOf(folder).get(`${id}.json.bak`);
      if (!backup) throw 'There is no previous version of this workstream.';
      folderOf(folder).set(`${id}.json`, { contents: backup.contents, modifiedMs: clock++ });
    },
    deviceName: async () => 'Test machine',
  };
}
