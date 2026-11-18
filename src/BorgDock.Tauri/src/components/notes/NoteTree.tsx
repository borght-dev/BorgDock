import clsx from 'clsx';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  FilePlus2,
  FileText,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '@/components/shared/primitives';
import { titleOf } from '@/services/notes/parse';
import { DAILY_FOLDER, folderOf, OBSIDIAN_DAILY_FOLDER } from '@/services/notes/paths';
import { useNotesStore } from '@/stores/notes-store';
import { toastError } from '@/stores/toast-store';
import { FolderNameDialog } from './FolderNameDialog';
import { NoteTrashDialog } from './NoteTrashDialog';

const folderActionClass =
  'shrink-0 cursor-pointer rounded p-1 opacity-0 hover:bg-[var(--color-surface-hover)] group-hover/folder:opacity-100 focus-visible:opacity-100';

interface Folder {
  path: string;
  name: string;
  folders: Folder[];
  notes: string[];
}

/** The vault's folders and notes; daily notes newest first, everything else by title. */
export function treeOf(paths: readonly string[], folders: readonly string[]): Folder {
  const root: Folder = { path: '', name: '', folders: [], notes: [] };
  const byPath = new Map<string, Folder>([['', root]]);
  const folderFor = (path: string): Folder => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const parent = folderFor(folderOf(path));
    const folder: Folder = {
      path,
      name: path.slice(path.lastIndexOf('/') + 1),
      folders: [],
      notes: [],
    };
    parent.folders.push(folder);
    byPath.set(path, folder);
    return folder;
  };
  for (const path of folders) folderFor(path);
  for (const path of paths) folderFor(folderOf(path)).notes.push(path);
  const sort = (folder: Folder) => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name));
    folder.notes.sort((a, b) =>
      folder.path === DAILY_FOLDER || folder.path === OBSIDIAN_DAILY_FOLDER
        ? b.localeCompare(a)
        : titleOf(a).localeCompare(titleOf(b)),
    );
    folder.folders.forEach(sort);
  };
  sort(root);
  return root;
}

function FolderRows({
  folder,
  depth,
  openPath,
  filter,
  collapsed,
  toggle,
  askTrash,
  editFolder,
  createNote,
}: {
  folder: Folder;
  depth: number;
  openPath: string | null;
  filter: string;
  collapsed: ReadonlySet<string>;
  toggle: (path: string) => void;
  askTrash: (path: string) => void;
  editFolder: (path: string, rename: boolean) => void;
  createNote: (path: string) => void;
}) {
  const conflicts = useNotesStore((s) => s.conflicts);
  const buffers = useNotesStore((s) => s.buffers);
  const notes = filter
    ? folder.notes.filter((p) => titleOf(p).toLowerCase().includes(filter))
    : folder.notes;
  return (
    <>
      {folder.folders.map((child) => {
        const closed = collapsed.has(child.path) && !filter;
        return (
          <div key={child.path} role="group" aria-label={child.name}>
            <div className="group/folder flex items-center">
              <button
                type="button"
                className="bd-notes-tree__folder"
                style={{ paddingLeft: 8 + depth * 12 }}
                aria-expanded={!closed}
                onClick={() => toggle(child.path)}
              >
                {closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span className="truncate">{child.name}</span>
              </button>
              <button
                type="button"
                title="New note here"
                aria-label={`New note in ${child.name}`}
                className={folderActionClass}
                onClick={() => createNote(child.path)}
              >
                <FilePlus2 size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="New subfolder"
                aria-label={`New folder in ${child.name}`}
                className={folderActionClass}
                onClick={() => editFolder(child.path, false)}
              >
                <FolderPlus size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Rename folder"
                aria-label={`Rename ${child.name}`}
                className={folderActionClass}
                onClick={() => editFolder(child.path, true)}
              >
                <Pencil size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Move folder to trash"
                aria-label={`Move ${child.name} to trash`}
                className={folderActionClass}
                onClick={() => askTrash(child.path)}
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
            {!closed && (
              <FolderRows
                folder={child}
                depth={depth + 1}
                openPath={openPath}
                filter={filter}
                collapsed={collapsed}
                toggle={toggle}
                askTrash={askTrash}
                editFolder={editFolder}
                createNote={createNote}
              />
            )}
          </div>
        );
      })}
      {notes.map((path) => (
        <button
          key={path}
          type="button"
          className={clsx('bd-notes-tree__note', path === openPath && 'bd-notes-tree__note--open')}
          style={{ paddingLeft: 20 + depth * 12 }}
          aria-current={path === openPath ? 'page' : undefined}
          title={path}
          onClick={() => useNotesStore.getState().open(path)}
        >
          <FileText size={12} aria-hidden="true" />
          <span className="bd-notes-tree__title">{titleOf(path)}</span>
          {path in conflicts ? (
            <span className="bd-notes-tree__badge bd-notes-tree__badge--warn">Changed</span>
          ) : path in buffers ? (
            <span className="bd-notes-tree__badge" aria-label="Unsaved">
              •
            </span>
          ) : null}
        </button>
      ))}
    </>
  );
}

/**
 * NoteTree — the Notes section's left column: a title filter over the
 * vault's folders and notes. Folders fold; a filter shows every match.
 */
export function NoteTree() {
  const vaultPath = useNotesStore((s) => s.vaultPath);
  return <VaultNoteTree key={vaultPath ?? ''} vaultPath={vaultPath} />;
}

function folderPaths(folder: Folder): string[] {
  return folder.folders.flatMap((child) => [child.path, ...folderPaths(child)]);
}

function readCollapsed(key: string | null): ReadonlySet<string> {
  try {
    const raw = key && window.localStorage.getItem(key);
    const paths: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(paths) && paths.every((path) => typeof path === 'string')) {
      return new Set(paths);
    }
  } catch {
    // An unavailable or corrupt preference should never prevent opening Notes.
  }
  return new Set(['Templates']);
}

function VaultNoteTree({ vaultPath }: { vaultPath: string | null }) {
  const texts = useNotesStore((s) => s.texts);
  const folders = useNotesStore((s) => s.folders);
  const openPath = useNotesStore((s) => s.openPath);
  const [filter, setFilter] = useState('');
  const [trashFolder, setTrashFolder] = useState<string | null>(null);
  const [folderEdit, setFolderEdit] = useState<{ path: string; rename: boolean } | null>(null);
  const storageKey = vaultPath ? `borgdock.notes.collapsed:${vaultPath}` : null;
  const [collapsed, setCollapsed] = useState(() => readCollapsed(storageKey));
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...collapsed]));
    } catch {
      // Folder controls remain usable when preferences cannot be saved.
    }
  }, [collapsed, storageKey]);
  const tree = treeOf(Object.keys(texts), folders);
  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return (
    <nav className="bd-notes-tree" aria-label="Notes">
      <div className="bd-notes-tree__toolbar">
        <input
          className="bd-notes-tree__filter"
          type="search"
          placeholder="Filter titles"
          aria-label="Filter notes by title"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <IconButton
          icon={<ChevronsDownUp size={14} aria-hidden="true" />}
          aria-label="Collapse all folders"
          tooltip="Collapse all folders"
          disabled={tree.folders.length === 0}
          onClick={() => {
            setFilter('');
            setCollapsed(new Set(folderPaths(tree)));
          }}
        />
      </div>
      <div className="bd-notes-tree__list">
        <FolderRows
          folder={tree}
          depth={0}
          openPath={openPath}
          filter={filter.trim().toLowerCase()}
          collapsed={collapsed}
          toggle={toggle}
          askTrash={setTrashFolder}
          editFolder={(path, rename) => setFolderEdit({ path, rename })}
          createNote={(path) => {
            const store = useNotesStore.getState();
            void store.createNote('Untitled', path).then(
              (note) => {
                setFilter('');
                setCollapsed(
                  (current) => new Set([...current].filter((key) => !note.startsWith(`${key}/`))),
                );
                useNotesStore.getState().open(note);
              },
              (error) => toastError('Note not created', error),
            );
          }}
        />
      </div>
      {trashFolder && (
        <NoteTrashDialog path={trashFolder} isFolder onClose={() => setTrashFolder(null)} />
      )}
      {folderEdit && (
        <FolderNameDialog
          parent={folderEdit.path}
          from={folderEdit.rename ? folderEdit.path : undefined}
          onSaved={(target) => {
            if (!folderEdit.rename) return;
            const from = folderEdit.path;
            setCollapsed(
              (current) =>
                new Set(
                  [...current].map((key) =>
                    key === from || key.startsWith(`${from}/`)
                      ? target + key.slice(from.length)
                      : key,
                  ),
                ),
            );
          }}
          onClose={() => setFolderEdit(null)}
        />
      )}
    </nav>
  );
}
