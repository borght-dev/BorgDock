import { Button } from '@/components/shared/primitives';
import { showNote, showSection } from '@/services/navigation';
import { ensureDailyNote } from '@/services/notes/daily';
import { titleOf } from '@/services/notes/parse';
import { dailyPath, isTemplatePath } from '@/services/notes/paths';
import { useNotesStore } from '@/stores/notes-store';
import { toastError } from '@/stores/toast-store';

const SHOWN = 3;

async function openToday() {
  try {
    await showNote(await ensureDailyNote());
  } catch (error) {
    toastError("Today's note not opened", error);
  }
}

/**
 * NotesFocusCard — on Focus, once the vault holds notes: today's note (made
 * with yesterday's activity the first time it opens) and the open tasks
 * across your notes.
 */
export function NotesFocusCard() {
  const status = useNotesStore((s) => s.status);
  const tasks = useNotesStore((s) => s.index.tasks);
  const hasToday = useNotesStore((s) => s.texts[dailyPath(new Date())] !== undefined);
  const hasNotes = useNotesStore((s) => Object.keys(s.texts).length > 0);
  // Someone who doesn't keep notes never sees the card; the rail has the section.
  if (status !== 'ready' || !hasNotes) return null;
  const open = tasks.filter((t) => !t.done && !isTemplatePath(t.path));

  return (
    <section className="bd-dp-fcard bd-notes-fcard" aria-label="Notes">
      <header className="bd-dp-fcard__head">
        <span className="bd-dp-fcard__summary">
          {open.length > 0
            ? `${open.length} open task${open.length === 1 ? '' : 's'} in your notes`
            : 'Notes'}
        </span>
        <span className="bd-notes-fcard__actions">
          <Button variant="ghost" size="sm" onClick={() => void openToday()}>
            {hasToday ? "Open today's note" : "Start today's note"}
          </Button>
          {open.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                useNotesStore.getState().setView('tasks');
                void showSection('notes');
              }}
            >
              All tasks
            </Button>
          )}
        </span>
      </header>
      {open.length > 0 && (
        <ul className="bd-dp-fcard__items">
          {open.slice(0, SHOWN).map((task) => (
            <li key={`${task.path}:${task.line}`}>
              <button
                type="button"
                className="bd-dp-fcard__item"
                onClick={() => void showNote(task.path)}
              >
                <span className="bd-dp-fcard__line">
                  <span className="bd-notes-fcard__box" aria-hidden="true" />
                  <span className="bd-dp-fcard__title">{task.text}</span>
                </span>
                <span className="bd-dp-fcard__latest">{titleOf(task.path)}</span>
              </button>
            </li>
          ))}
          {open.length > SHOWN && (
            <li className="bd-dp-fcard__more">and {open.length - SHOWN} more</li>
          )}
        </ul>
      )}
    </section>
  );
}
