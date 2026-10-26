import { useEffect, useRef, useState } from 'react';
import { setNextAction } from '@/services/workstreams/edits';
import { LIMITS, type NextAction } from '@/services/workstreams/types';
import { wsEdit } from './ws-ui';

interface NextActionInlineProps {
  workstreamId: string;
  nextAction: NextAction | null;
  editing: boolean;
  readOnly: boolean;
  onEditing: (editing: boolean) => void;
}

/**
 * The next action in one line, typed in place. Enter saves, Esc puts the
 * old text back; the field keeps its own Enter and Esc while it has focus.
 */
export function NextActionInline({
  workstreamId,
  nextAction,
  editing,
  readOnly,
  onEditing,
}: NextActionInlineProps) {
  const [draft, setDraft] = useState(nextAction?.text ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  /** Esc closes the field without saving; the blur that follows must not save either. */
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) return;
    setDraft(nextAction?.text ?? '');
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing, nextAction?.text]);

  const save = () => {
    if (draft.trim() !== (nextAction?.text ?? '')) {
      wsEdit(workstreamId, (d, c) =>
        setNextAction(d, draft, d.nextAction?.target ?? null, 'you', c),
      );
    }
    onEditing(false);
  };

  if (editing && !readOnly) {
    return (
      <input
        ref={inputRef}
        className="bd-ws-next__input"
        aria-label="Next action"
        value={draft}
        maxLength={LIMITS.nextAction}
        placeholder="What moves the goal forward next?"
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            cancelled.current = true;
            save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelled.current = true;
            onEditing(false);
          }
        }}
        onBlur={() => {
          if (cancelled.current) cancelled.current = false;
          else save();
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="bd-ws-next__text"
      data-empty={!nextAction || undefined}
      disabled={readOnly}
      aria-label={nextAction ? `Next action: ${nextAction.text}. Edit` : 'Set a next action'}
      onClick={(e) => {
        e.stopPropagation();
        onEditing(true);
      }}
    >
      {nextAction?.text ?? 'Set a next action'}
    </button>
  );
}
