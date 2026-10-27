import { useState } from 'react';
import { LaunchChoiceFields, useLaunchChoice } from '@/components/dispatch/LaunchChoice';
import { Button, Checkbox } from '@/components/shared/primitives';
import type { Assessment } from '@/services/workstreams/attention';
import { buildBrief, DEFAULT_WORKSTREAM_PROMPTS, fillPrompt } from '@/services/workstreams/brief';
import { startWorkstreamRun } from '@/services/workstreams/runs';
import type { RunKind, WorkstreamDocument } from '@/services/workstreams/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast, toastError } from '@/stores/toast-store';
import { Sheet } from './Sheet';

interface WorkstreamRunSheetProps {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  kind: RunKind;
  onClose: () => void;
}

const TITLE: Record<RunKind, string> = {
  review: 'Review with an agent',
  work: 'Work on the next action',
};

const SUBTITLE: Record<RunKind, string> = {
  review:
    'One T3 thread reads every linked record and proposes. You accept each proposal yourself.',
  work: 'A T3 thread starts on the next action with the workstream as its brief.',
};

/**
 * WorkstreamRunSheet — start an agent from a workstream, in a free T3 slot:
 * a review that ends with proposals, or work on the next action. The first
 * message is the workstream's brief and can be edited before it goes.
 */
export function WorkstreamRunSheet({
  document,
  assessment,
  kind,
  onClose,
}: WorkstreamRunSheetProps) {
  const slots = useDispatchStore((s) => s.overview?.slots ?? []);
  const prompts = useSettingsStore((s) => s.settings.agents?.dispatchPrompts);
  const choice = useLaunchChoice(slots, null);
  const template =
    (kind === 'review' ? prompts?.workstreamReview : prompts?.workstreamWork)?.trim() ||
    DEFAULT_WORKSTREAM_PROMPTS[kind];
  // The brief is taken once, when the sheet opens; edits are the user's.
  const [prompt, setPrompt] = useState(() =>
    fillPrompt(template, document, buildBrief(document, assessment)),
  );
  const [planFirst, setPlanFirst] = useState(true);
  const [starting, setStarting] = useState(false);
  const { slot, model, effort } = choice;

  const start = async (openInT3: boolean) => {
    if (!slot || !model) return;
    setStarting(true);
    try {
      await startWorkstreamRun({
        workstreamId: document.id,
        kind,
        slot,
        model,
        effort,
        prompt,
        planFirst,
        openInT3,
      });
      showToast({
        tone: 'success',
        message:
          kind === 'review'
            ? `Review started in ${slot.name}. Its proposals show here when it stops.`
            : `Started in ${slot.name} on the next action.`,
      });
      onClose();
    } catch (error) {
      toastError('Agent not started', error);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Sheet
      title={TITLE[kind]}
      subtitle={SUBTITLE[kind]}
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
            disabled={!slot || !model || starting}
            onClick={() => void start(true)}
          >
            Start and open T3
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!slot || !model}
            loading={starting}
            onClick={() => void start(false)}
          >
            Start in background
          </Button>
        </>
      }
    >
      {slots.length === 0 ? (
        <p className="bd-dp-sheet__hint">
          No T3 slots yet. Pair with T3 in Settings → Agents, then open this again.
        </p>
      ) : (
        <LaunchChoiceFields choice={choice} />
      )}
      {kind === 'work' && (
        <Checkbox
          checked={planFirst}
          label="Ask for a plan first"
          hint="The agent proposes a plan and waits for your go-ahead."
          onChange={setPlanFirst}
        />
      )}
      <section aria-label="First message">
        <h3 className="bd-dp-sheet__label">
          First message <span>{prompt.length.toLocaleString()} of 20,000</span>
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
