import { Bot, FolderOpen, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/shared/primitives';
import { commands } from '@/generated/commands';
import { titleOf } from '@/services/notes/parse';
import { folderOf, safeTitle } from '@/services/notes/paths';
import { resolveLink } from '@/services/notes/vault-index';
import { useNotesStore } from '@/stores/notes-store';
import { toastError } from '@/stores/toast-store';
import { ConflictBanner } from './ConflictBanner';
import { NoteEditor } from './editor/NoteEditor';
import { completionSources, openNoteUrl, renderChip } from './editor-support';
import { NoteThreadSheet } from './NoteThreadSheet';

/** Open the note a `[[link]]` names, making it first when it doesn't exist. */
async function followLink(target: string) {
  const store = useNotesStore.getState();
  const found = resolveLink(store.index, target);
  if (found) {
    store.open(found);
    return;
  }
  try {
    const folder = target.includes('/') ? folderOf(`${target}.md`) : '';
    const title = target.includes('/') ? target.slice(target.lastIndexOf('/') + 1) : target;
    store.open(await store.createNote(title, folder));
  } catch (error) {
    toastError('Note not created', error);
  }
}

function TitleField({ path }: { path: string }) {
  const [draft, setDraft] = useState(titleOf(path));
  const commit = async () => {
    const next = safeTitle(draft);
    if (next === titleOf(path)) {
      setDraft(titleOf(path));
      return;
    }
    try {
      await useNotesStore.getState().rename(path, next);
    } catch (error) {
      toastError('Note not renamed', error);
      setDraft(titleOf(path));
    }
  };
  return (
    <input
      className="bd-notes-pane__title"
      aria-label="Note title"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(titleOf(path));
      }}
    />
  );
}

/**
 * NotePane — the open note: its title (renaming moves the file and the
 * links to it), its actions, and the live-preview editor. Edits save half a
 * second after the last keystroke. Keyed by path, so each note starts with
 * its own title draft and undo history.
 */
export function NotePane({ path }: { path: string }) {
  const text = useNotesStore((s) => s.buffers[path] ?? s.texts[path]);
  const vaultPath = useNotesStore((s) => s.vaultPath);
  const [threadText, setThreadText] = useState<string | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);

  if (text === undefined) {
    return (
      <div className="bd-notes-pane bd-notes-pane--empty" role="status">
        Opening {titleOf(path)}…
      </div>
    );
  }
  const folder = folderOf(path);
  const fullPath = vaultPath ? `${vaultPath}/${path}` : path;

  return (
    <article className="bd-notes-pane" aria-label={titleOf(path)}>
      <header className="bd-notes-pane__head">
        <div className="bd-notes-pane__heading">
          {folder && <span className="bd-notes-pane__folder">{folder}</span>}
          <TitleField path={path} />
        </div>
        <IconButton
          icon={<Bot size={14} />}
          tooltip="Start a T3 thread from this note"
          aria-label="Start a T3 thread from this note"
          onClick={() => {
            const selection = window.getSelection()?.toString().trim();
            setThreadText(selection || text);
          }}
        />
        <IconButton
          icon={<FolderOpen size={14} />}
          tooltip="Show in folder"
          aria-label="Show in folder"
          onClick={() =>
            void commands
              .revealInFileManager(fullPath)
              .then((r) => r.status === 'error' && toastError('Folder not opened', r.error))
          }
        />
        <IconButton
          icon={<Trash2 size={14} />}
          tooltip={confirmTrash ? 'Click again to move it to the trash' : 'Move to trash'}
          aria-label={confirmTrash ? 'Confirm: move this note to the trash' : 'Move to trash'}
          active={confirmTrash}
          onClick={() => {
            if (!confirmTrash) {
              setConfirmTrash(true);
              return;
            }
            void useNotesStore
              .getState()
              .trash(path)
              .catch((error) => toastError('Note not moved to the trash', error));
          }}
        />
      </header>
      <ConflictBanner path={path} />
      <NoteEditor
        className="bd-notes-pane__editor"
        path={path}
        text={text}
        ariaLabel={`${titleOf(path)}, note text`}
        onChange={(next) => useNotesStore.getState().edit(path, next)}
        renderChip={renderChip}
        onOpenLink={(target) => void followLink(target)}
        onOpenUrl={openNoteUrl}
        completions={completionSources(() => titleOf(path))}
      />
      {threadText !== null && (
        <NoteThreadSheet path={path} text={threadText} onClose={() => setThreadText(null)} />
      )}
    </article>
  );
}
