import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Markdown } from '@/components/shared/Markdown';
import { Button } from '@/components/shared/primitives';
import { setGoal } from '@/services/workstreams/edits';
import { LIMITS } from '@/services/workstreams/types';
import { wsEdit } from './ws-ui';

interface GoalEditorProps {
  workstreamId: string;
  goal: string;
  readOnly: boolean;
}

/** The goal in Markdown: read it, or edit it in place (Ctrl+Enter saves, Esc cancels). */
export function GoalEditor({ workstreamId, goal, readOnly }: GoalEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null && wsEdit(workstreamId, (d, c) => setGoal(d, draft, c))) setDraft(null);
  };

  if (draft !== null) {
    return (
      <section className="bd-ws-panel bd-ws-goal" aria-label="Goal">
        <h2 className="bd-ws-panel__title">Goal</h2>
        <textarea
          autoFocus
          className="bd-dp-sheet__prompt bd-ws-goal__input"
          aria-label="Goal"
          rows={8}
          value={draft}
          maxLength={LIMITS.goal}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setDraft(null);
            }
          }}
        />
        <div className="bd-ws-panel__actions">
          <span className="bd-dp-sheet__hint">
            Markdown. {draft.length} of {LIMITS.goal.toLocaleString()} characters.
          </span>
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            Save goal
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section className="bd-ws-panel bd-ws-goal" aria-label="Goal">
      <header className="bd-ws-panel__head">
        <h2 className="bd-ws-panel__title">Goal</h2>
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            leading={<Pencil size={12} />}
            onClick={() => setDraft(goal)}
          >
            Edit
          </Button>
        )}
      </header>
      {goal.trim() ? (
        <div className="bd-ws-goal__text">
          <Markdown allowRawHtml={false}>{goal}</Markdown>
        </div>
      ) : (
        <p className="bd-ws-muted">
          Say what is true once this is done. The outcomes below prove it.
        </p>
      )}
    </section>
  );
}
