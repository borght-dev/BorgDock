import { useState } from 'react';
import { LaunchChoiceFields, useLaunchChoice } from '@/components/dispatch/LaunchChoice';
import { Button } from '@/components/shared/primitives';
import { Sheet } from '@/components/workstreams/Sheet';
import { targetPlace } from '@/services/dispatch/launch-target';
import { NOTE_PROMPT_LIMIT, notePrompt, startThreadFromNote } from '@/services/notes/agents';
import { titleOf } from '@/services/notes/parse';
import { useDispatchStore } from '@/stores/dispatch-store';
import { showToast, toastError } from '@/stores/toast-store';

interface NoteThreadSheetProps {
  path: string;
  /** The note's text, or the selection when one was made. */
  text: string;
  onClose: () => void;
}

/**
 * NoteThreadSheet — start a T3 thread from a note: pick where it runs and the model,
 * check the first message (the note, or the selection), start. The thread's
 * link lands in the note, and its results are written back when it stops.
 */
export function NoteThreadSheet({ path, text, onClose }: NoteThreadSheetProps) {
  const t3Known = useDispatchStore((s) => s.projects.length > 0);
  const choice = useLaunchChoice();
  const [prompt, setPrompt] = useState(() => notePrompt(path, text));
  const [title, setTitle] = useState(() => titleOf(path));
  const [starting, setStarting] = useState(false);
  const { target, model, effort, ready } = choice;

  const start = async (openInT3: boolean) => {
    if (!target || !ready) return;
    setStarting(true);
    try {
      await startThreadFromNote({ path, target, model, effort, title, prompt, openInT3 });
      showToast({
        tone: 'success',
        message: `Started in ${targetPlace(target)}. Its answer lands under "Agent notes" when it stops.`,
      });
      onClose();
    } catch (error) {
      toastError('Thread not started', error);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Sheet
      title="Start a T3 thread from this note"
      subtitle={titleOf(path)}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <Button
            variant="secondary"
            size="md"
            disabled={!ready || starting}
            onClick={() => void start(true)}
          >
            Start and open T3
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!ready}
            loading={starting}
            onClick={() => void start(false)}
          >
            Start in background
          </Button>
        </>
      }
    >
      {!t3Known ? (
        <p className="bd-dp-sheet__hint">
          No T3 projects yet. Pair with T3 in Settings → Agents, then open this again.
        </p>
      ) : (
        <LaunchChoiceFields choice={choice} />
      )}
      <label className="bd-notes-sheet__field">
        <span className="bd-dp-sheet__label">Thread title</span>
        <input
          className="bd-notes-sheet__input"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <section aria-label="First message">
        <h3 className="bd-dp-sheet__label">
          First message{' '}
          <span>
            {prompt.length.toLocaleString()} of {NOTE_PROMPT_LIMIT.toLocaleString()}
          </span>
        </h3>
        <textarea
          className="bd-dp-sheet__prompt"
          aria-label="First message"
          rows={12}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </section>
    </Sheet>
  );
}
