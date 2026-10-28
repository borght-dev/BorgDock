import clsx from 'clsx';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { useState } from 'react';
import { titleOf } from '@/services/notes/parse';
import { DAILY_FOLDER, folderOf } from '@/services/notes/paths';
import { useNotesStore } from '@/stores/notes-store';

interface Folder {
  path: string;
  name: string;
  folders: Folder[];
  notes: string[];
}

/** The vault's folders and notes; daily notes newest first, everything else by title. */
export function treeOf(paths: readonly string[]): Folder {
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
  for (const path of paths) folderFor(folderOf(path)).notes.push(path);
  const sort = (folder: Folder) => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name));
    folder.notes.sort((a, b) =>
      folder.path === DAILY_FOLDER ? b.localeCompare(a) : titleOf(a).localeCompare(titleOf(b)),
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
}: {
  folder: Folder;
  depth: number;
  openPath: string | null;
  filter: string;
  collapsed: ReadonlySet<string>;
  toggle: (path: string) => void;
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
            <button
              type="button"
              className="bd-notes-tree__folder"
              style={{ paddingLeft: 8 + depth * 12 }}
              aria-expanded={!closed}
              onClick={() => toggle(child.path)}
            >
              {closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              <span>{child.name}</span>
            </button>
            {!closed && (
              <FolderRows
                folder={child}
                depth={depth + 1}
                openPath={openPath}
                filter={filter}
                collapsed={collapsed}
                toggle={toggle}
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
  const texts = useNotesStore((s) => s.texts);
  const openPath = useNotesStore((s) => s.openPath);
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(['Templates']));
  const tree = treeOf(Object.keys(texts));
  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return (
    <nav className="bd-notes-tree" aria-label="Notes">
      <input
        className="bd-notes-tree__filter"
        type="search"
        placeholder="Filter titles"
        aria-label="Filter notes by title"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="bd-notes-tree__list">
        <FolderRows
          folder={tree}
          depth={0}
          openPath={openPath}
          filter={filter.trim().toLowerCase()}
          collapsed={collapsed}
          toggle={toggle}
        />
      </div>
    </nav>
  );
}
