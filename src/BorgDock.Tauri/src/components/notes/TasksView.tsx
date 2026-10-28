import { useState } from 'react';
import { Checkbox } from '@/components/shared/primitives';
import { titleOf } from '@/services/notes/parse';
import { isTemplatePath } from '@/services/notes/paths';
import { setTask } from '@/services/notes/text-edits';
import { useNotesStore } from '@/stores/notes-store';

/** Open tasks across the vault, templates left out. */
export function openTaskCount(tasks: readonly { path: string; done: boolean }[]): number {
  return tasks.filter((t) => !t.done && !isTemplatePath(t.path)).length;
}

/**
 * TasksView — every `- [ ]` line in the vault, grouped by note. Ticking one
 * here edits its line in the note's file.
 */
export function TasksView() {
  const tasks = useNotesStore((s) => s.index.tasks);
  const [showDone, setShowDone] = useState(false);
  const shown = tasks.filter((t) => !isTemplatePath(t.path) && (showDone || !t.done));
  const byNote = new Map<string, typeof shown>();
  for (const task of shown) byNote.set(task.path, [...(byNote.get(task.path) ?? []), task]);
  const groups = [...byNote.entries()].sort(([a], [b]) => b.localeCompare(a));

  return (
    <section className="bd-notes-tasks" aria-label="Tasks across notes">
      <header className="bd-notes-tasks__head">
        <h2>
          Open tasks <span>{openTaskCount(tasks)}</span>
        </h2>
        <Checkbox checked={showDone} label="Show done" onChange={setShowDone} />
      </header>
      {groups.length === 0 ? (
        <p className="bd-notes-side__empty">
          No open tasks. A line like <code>- [ ] Ship it</code> in any note shows up here.
        </p>
      ) : (
        groups.map(([path, list]) => (
          <div key={path} className="bd-notes-tasks__group">
            <button
              type="button"
              className="bd-notes-tasks__note"
              onClick={() => useNotesStore.getState().open(path)}
            >
              {titleOf(path)}
            </button>
            <ul>
              {list.map((task) => (
                <li key={task.line} data-done={task.done || undefined}>
                  <label className="bd-notes-task">
                    <input
                      type="checkbox"
                      className="bd-notes-task__box"
                      checked={task.done}
                      onChange={(e) => {
                        const done = e.target.checked;
                        void useNotesStore
                          .getState()
                          .update(path, (text) =>
                            text === null ? null : setTask(text, task.line, task.text, done),
                          );
                      }}
                    />
                    <span>{task.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
