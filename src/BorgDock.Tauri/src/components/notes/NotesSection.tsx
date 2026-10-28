import { CalendarDays, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Kbd, Seg2 } from '@/components/shared/primitives';
import { ensureDailyNote } from '@/services/notes/daily';
import { folderOf } from '@/services/notes/paths';
import { type NotesView, useNotesStore } from '@/stores/notes-store';
import { toastError } from '@/stores/toast-store';
import { MentionsPane } from './MentionsPane';
import { NotePane } from './NotePane';
import { NoteTree } from './NoteTree';
import { QuickSwitcher, type SwitcherMode } from './QuickSwitcher';
import { openTaskCount, TasksView } from './TasksView';

const VIEWS = [
  { value: 'note', label: 'Notes' },
  { value: 'tasks', label: 'Tasks' },
] as const;

/** Open today's daily note, making it (with yesterday's activity) the first time. */
export async function openToday() {
  try {
    const path = await ensureDailyNote();
    useNotesStore.getState().open(path);
  } catch (error) {
    toastError("Today's note not opened", error);
  }
}

async function newNote() {
  const store = useNotesStore.getState();
  const folder = store.openPath ? folderOf(store.openPath) : '';
  try {
    store.open(await store.createNote('Untitled', folder === 'Daily' ? '' : folder));
  } catch (error) {
    toastError('Note not created', error);
  }
}

function EmptyVault({ vaultPath }: { vaultPath: string | null }) {
  return (
    <div className="bd-notes-empty">
      <h2>No notes yet</h2>
      <p>
        Notes are Markdown files in {vaultPath ?? 'your vault'}. Obsidian and VS Code open the same
        files.
      </p>
      <div className="bd-notes-empty__actions">
        <Button variant="primary" size="md" onClick={() => void openToday()}>
          Start today's note
        </Button>
        <Button variant="secondary" size="md" onClick={() => void newNote()}>
          New note
        </Button>
      </div>
    </div>
  );
}

/**
 * NotesSection — Obsidian-style notes in the main window: the vault's
 * folders and notes, the open note in a live-preview editor, and what links
 * to it. Ctrl+O opens a note by title, Ctrl+Shift+F searches every note,
 * Ctrl+N makes a new one.
 */
export function NotesSection() {
  const status = useNotesStore((s) => s.status);
  const error = useNotesStore((s) => s.error);
  const view = useNotesStore((s) => s.view);
  const openPath = useNotesStore((s) => s.openPath);
  const vaultPath = useNotesStore((s) => s.vaultPath);
  const noteCount = useNotesStore((s) => Object.keys(s.texts).length);
  const tasks = useNotesStore((s) => s.index.tasks);
  const [switcher, setSwitcher] = useState<SwitcherMode | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'o' && !e.shiftKey) {
        e.preventDefault();
        setSwitcher('titles');
      } else if (key === 'f' && e.shiftKey) {
        e.preventDefault();
        setSwitcher('text');
      } else if (key === 'n' && !e.shiftKey) {
        e.preventDefault();
        void newNote();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const openTasks = openTaskCount(tasks);
  return (
    <div className="bd-wb-prs bd-notes">
      <header className="bd-wb-head bd-notes-head">
        <h1 className="bd-wb-head__title">Notes</h1>
        <Seg2
          ariaLabel="Show"
          size="sm"
          value={view}
          options={VIEWS.map((v) =>
            v.value === 'tasks' && openTasks ? { ...v, label: `Tasks ${openTasks}` } : v,
          )}
          onChange={(next) => useNotesStore.getState().setView(next as NotesView)}
        />
        <Button variant="ghost" size="sm" onClick={() => void openToday()}>
          <CalendarDays size={13} aria-hidden="true" /> Today
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-keyshortcuts="Control+N"
          onClick={() => void newNote()}
        >
          <Plus size={13} aria-hidden="true" /> New note
        </Button>
        <button
          type="button"
          className="bd-wb-head__search bd-notes-head__search"
          aria-keyshortcuts="Control+O"
          onClick={() => setSwitcher('titles')}
        >
          <Search
            size={13}
            strokeWidth={2}
            aria-hidden="true"
            className="bd-wb-head__search-icon"
          />
          <span>Open or search</span>
          <Kbd>Ctrl O</Kbd>
        </button>
      </header>
      {status === 'error' && (
        <div className="bd-dp-notice" role="alert">
          <span>The notes vault could not be read: {error}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const store = useNotesStore.getState();
              void store.load(store.folder ?? null);
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {status === 'ready' && noteCount === 0 ? (
        <EmptyVault vaultPath={vaultPath} />
      ) : (
        <div className="bd-notes__body">
          <NoteTree />
          <main className="bd-notes__main">
            {view === 'tasks' ? (
              <TasksView />
            ) : openPath ? (
              <NotePane key={openPath} path={openPath} />
            ) : (
              <div className="bd-notes-pane bd-notes-pane--empty">
                <p>Pick a note, or start today's.</p>
                <Button variant="secondary" size="sm" onClick={() => void openToday()}>
                  Open today's note
                </Button>
              </div>
            )}
          </main>
          {view === 'note' && openPath && <MentionsPane path={openPath} />}
        </div>
      )}
      {switcher && <QuickSwitcher initialMode={switcher} onClose={() => setSwitcher(null)} />}
    </div>
  );
}
