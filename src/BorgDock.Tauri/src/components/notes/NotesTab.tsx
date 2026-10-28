import { FilePlus2 } from 'lucide-react';
import { Button } from '@/components/shared/primitives';
import { useNotesVault } from '@/hooks/useNotesVault';
import { showNote } from '@/services/navigation';
import { titleOf } from '@/services/notes/parse';
import { keyOfToken } from '@/services/notes/vault-index';
import { useNotesStore } from '@/stores/notes-store';
import { toastError } from '@/stores/toast-store';
import { excerpt } from './MentionsPane';

export interface NotesTabProps {
  /** The `RefKey` (or `ws:<id>`) notes mention this thing by. */
  refKey: string;
  /** How a new note about it is titled. */
  newTitle: string;
  /** The first line of a new note: the reference, so the note mentions it. */
  newFirstLine: string;
}

/** How many notes mention `refKey`: the tab's count. */
export function useNoteCount(refKey: string): number {
  useNotesVault();
  return useNotesStore((s) => s.index.mentions.get(refKey)?.length ?? 0);
}

/**
 * NotesTab — the notes that mention a pull request, work item or workstream,
 * with the lines that mention it, and "New note about this". Opening a note
 * shows it in the main window's Notes section.
 */
export function NotesTab({ refKey, newTitle, newFirstLine }: NotesTabProps) {
  useNotesVault();
  const status = useNotesStore((s) => s.status);
  const index = useNotesStore((s) => s.index);
  const texts = useNotesStore((s) => s.texts);
  const context = useNotesStore((s) => s.context);
  const mentions = index.mentions.get(refKey) ?? [];

  const create = async () => {
    try {
      const path = await useNotesStore.getState().createNote(newTitle, '', `${newFirstLine}\n\n`);
      await showNote(path);
    } catch (error) {
      toastError('Note not created', error);
    }
  };

  return (
    <section className="bd-notes-tab" aria-label="Notes">
      <header className="bd-notes-tab__head">
        <p>
          {mentions.length === 0
            ? status === 'loading' || status === 'idle'
              ? 'Reading your notes…'
              : 'No note mentions this yet.'
            : `${mentions.length} ${mentions.length === 1 ? 'note mentions' : 'notes mention'} this.`}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void create()}>
          <FilePlus2 size={13} aria-hidden="true" /> New note about this
        </Button>
      </header>
      <ul className="bd-notes-tab__list">
        {mentions.map((mention) => {
          const note = index.notes.get(mention.path);
          const lines = (note?.tokens ?? [])
            .filter((t) => keyOfToken(t, context) === refKey)
            .map((t) => t.line)
            .filter((line, i, all) => all.indexOf(line) === i)
            .slice(0, 3);
          return (
            <li key={mention.path}>
              <button
                type="button"
                className="bd-notes-mention bd-notes-tab__note"
                onClick={() => void showNote(mention.path)}
              >
                <span className="bd-notes-mention__title">{titleOf(mention.path)}</span>
                {lines.map((line) => (
                  <span key={line} className="bd-notes-mention__line">
                    {excerpt(texts[mention.path], line)}
                  </span>
                ))}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
