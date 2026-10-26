import { ArrowRight, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Button, Dot, Select } from '@/components/shared/primitives';
import type { Assessment } from '@/services/workstreams/attention';
import { setNextAction, setStatus } from '@/services/workstreams/edits';
import { LIMITS, type NodeKey, type WorkstreamDocument } from '@/services/workstreams/types';
import { nodeLabel, nodeOptions } from './labels';
import { ATTENTION_DOT, ago, wsEdit } from './ws-ui';

interface NextActionCardProps {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  readOnly: boolean;
  now: number;
}

const SET_BY = { you: 'you', agent: 'the agent', suggestion: 'a suggestion' } as const;
const MAX_SUGGESTIONS = 5;

/**
 * NextActionCard — the one thing to do next, as you typed it, with what it
 * is about. Below it, what the sources suggest instead; "Use" makes one of
 * them the next action.
 */
export function NextActionCard({ document, assessment, readOnly, now }: NextActionCardProps) {
  const next = document.nextAction;
  const [draft, setDraft] = useState<{ text: string; target: NodeKey | null } | null>(null);
  const same = (a: string, b: string | undefined) =>
    a.replace(/\.$/, '').toLowerCase() === (b ?? '').replace(/\.$/, '').toLowerCase();
  // A conflict has its own banner; it is no next action for the goal.
  const suggestions = (assessment?.attention ?? [])
    .filter(
      (entry) =>
        entry.id !== 'conflict' && (entry.id === 'ready' || !same(entry.action, next?.text)),
    )
    .slice(0, MAX_SUGGESTIONS);

  const save = () => {
    if (!draft) return;
    if (wsEdit(document.id, (d, c) => setNextAction(d, draft.text, draft.target, 'you', c)))
      setDraft(null);
  };

  return (
    <section className="bd-ws-panel bd-ws-nextcard" aria-label="Next action">
      <header className="bd-ws-panel__head">
        <h2 className="bd-ws-panel__title">Next action</h2>
        {!readOnly && !draft && (
          <Button
            variant="ghost"
            size="sm"
            leading={<Pencil size={12} />}
            aria-keyshortcuts="E"
            data-next-action-edit
            onClick={() => setDraft({ text: next?.text ?? '', target: next?.target ?? null })}
          >
            {next ? 'Edit' : 'Set'}
          </Button>
        )}
      </header>
      {draft ? (
        <div className="bd-ws-nextcard__form">
          <textarea
            autoFocus
            className="bd-dp-sheet__prompt bd-ws-nextcard__input"
            aria-label="Next action"
            rows={2}
            maxLength={LIMITS.nextAction}
            value={draft.text}
            placeholder="What moves the goal forward next?"
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
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
            <label className="bd-ws-field bd-ws-field--grow">
              <span className="bd-dp-sheet__label">About</span>
              <Select
                ariaLabel="What the next action is about"
                value={draft.target ?? ''}
                options={[
                  { value: '', label: 'Nothing in particular' },
                  ...nodeOptions(document, assessment),
                ]}
                onChange={(value) => setDraft({ ...draft, target: value || null })}
              />
            </label>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : next ? (
        <div className="bd-ws-nextcard__current">
          <p className="bd-ws-nextcard__text">{next.text}</p>
          <p className="bd-ws-muted">
            {next.target && <>About {nodeLabel(document, assessment, next.target)} · </>}
            Set by {SET_BY[next.setBy]} {ago(next.setAt, now)}
          </p>
        </div>
      ) : (
        <p className="bd-ws-muted">No next action yet.</p>
      )}

      {suggestions.length > 0 && (
        <div className="bd-ws-suggest">
          <h3 className="bd-dp-sheet__label">Suggested from the sources</h3>
          <ul>
            {suggestions.map((entry) => (
              <li key={entry.id} data-tone={entry.tone}>
                <Dot tone={ATTENTION_DOT[entry.tone]} size={7} />
                <span className="bd-ws-suggest__text">
                  <span>{entry.action}</span>
                  <span className="bd-ws-muted">{entry.reason}</span>
                </span>
                {!readOnly && entry.id === 'ready' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => wsEdit(document.id, (d, c) => setStatus(d, 'done', c))}
                  >
                    Complete
                  </Button>
                )}
                {!readOnly && entry.id !== 'ready' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    trailing={<ArrowRight size={12} />}
                    onClick={() =>
                      wsEdit(document.id, (d, c) =>
                        setNextAction(d, entry.action, entry.target, 'suggestion', c),
                      )
                    }
                  >
                    Use
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
