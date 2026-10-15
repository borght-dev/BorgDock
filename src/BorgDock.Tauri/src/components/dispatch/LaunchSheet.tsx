import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import {
  branchName,
  configuredPrompts,
  LAUNCH_MODES,
  type LaunchMode,
  lastSlotOf,
  launchPrompt,
  startThread,
  stateOnStart,
} from '@/services/dispatch/launch';
import type { ItemOverview, Overview } from '@/services/dispatch/types';
import { type LaunchIntent, useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast, toastError } from '@/stores/toast-store';
import { LaunchChoiceFields, useLaunchChoice } from './LaunchChoice';

export { clearCatalogueCache } from './LaunchChoice';

/** The branch the item's work already lives on: its pull request's, or a thread's that names it. */
function existingBranch(unit: ItemOverview): string | null {
  if (unit.pullRequest?.branch) return unit.pullRequest.branch;
  const namesItem = new RegExp(`(^|/)(AB#?)?${unit.item.id}(\\b|[-_])`, 'i');
  return unit.threads.map((t) => t.branch).find((b) => b && namesItem.test(b)) ?? null;
}

interface LaunchSheetProps {
  intent: LaunchIntent;
  overview: Overview;
}

/**
 * LaunchSheet — starts an agent on a work item. Pick a free slot, the model
 * and its reasoning effort, and how the agent begins; the first message is
 * prefilled for that and can be edited. Starting moves the item in ADO only
 * when its box is ticked.
 */
export function LaunchSheet({ intent, overview }: LaunchSheetProps) {
  const close = useDispatchStore((s) => s.closeLaunch);
  const preferences = useDispatchStore((s) => s.launchPreferences);
  const customPrompts = useSettingsStore((s) => s.settings.agents?.dispatchPrompts);
  const unit = overview.items.find((o) => o.item.id === intent.itemId);

  const choice = useLaunchChoice(overview.slots, intent.slotId);
  const [mode, setMode] = useState<LaunchMode>(preferences.mode);
  /** The first message once the user edited it; null follows the template. */
  const [editedPrompt, setEditedPrompt] = useState<string | null>(null);
  const [moveState, setMoveState] = useState(true);
  const [assign, setAssign] = useState(true);
  const [starting, setStarting] = useState(false);
  const { slot, model, effort } = choice;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [close]);

  // An item started from another section may still be on its way from ADO.
  if (!unit) {
    return (
      <div className="bd-modal-backdrop" role="presentation" onClick={close}>
        <div
          className="bd-modal bd-dp-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={`Start AB#${intent.itemId} in T3`}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="bd-dp-sheet__head">
            <h2>Start AB#{intent.itemId} in T3</h2>
            <p>Loading the work item…</p>
          </header>
          <footer className="bd-dp-sheet__foot">
            <Button variant="ghost" size="md" onClick={close}>
              Cancel
            </Button>
          </footer>
        </div>
      </div>
    );
  }
  const { item } = unit;

  const handoff = mode === 'qa' || mode === 'done';
  const branch = handoff ? (existingBranch(unit) ?? branchName(item)) : branchName(item);
  const prompts = configuredPrompts(customPrompts);
  const prompt = editedPrompt ?? launchPrompt(mode, item, branch, prompts);
  const moveTarget = handoff ? null : stateOnStart(item);

  const pickMode = (next: LaunchMode) => {
    setMode(next);
    setEditedPrompt(null);
    // A handoff goes back to where the work was done, when that slot is free.
    const home = lastSlotOf(unit.threads, overview.slots);
    if ((next === 'qa' || next === 'done') && home && !intent.slotId) choice.setSlotId(home.id);
  };

  const start = async (openInT3: boolean) => {
    if (!slot || !model) return;
    setStarting(true);
    try {
      const { warnings } = await startThread({
        item,
        slot,
        model,
        effort,
        mode,
        prompt,
        moveTo: moveState ? moveTarget : null,
        assignToMe: assign && !item.assignedToMe,
        openInT3,
      });
      useDispatchStore.getState().selectItem(item.id);
      showToast({
        tone: warnings.length > 0 ? 'info' : 'success',
        message: [`Started ${item.id} in ${slot.name}.`, ...warnings].join(' '),
      });
      close();
    } catch (error) {
      toastError(`${item.id} not started`, error);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="bd-modal-backdrop" role="presentation" onClick={close}>
      <div
        className="bd-modal bd-dp-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bd-dp-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bd-dp-sheet__head">
          <h2 id="bd-dp-sheet-title">Start AB#{item.id} in T3</h2>
          <p>{item.title}</p>
        </header>

        <div className="bd-dp-sheet__body">
          <LaunchChoiceFields choice={choice} />

          <section aria-label="Begin with">
            <h3 className="bd-dp-sheet__label">Begin with</h3>
            <div className="bd-dp-sheet__modes" role="radiogroup" aria-label="Begin with">
              {LAUNCH_MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === option.id}
                  className={clsx(
                    'bd-dp-sheet__mode',
                    mode === option.id && 'bd-dp-sheet__mode--on',
                  )}
                  onClick={() => pickMode(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section aria-label="First message">
            <h3 className="bd-dp-sheet__label">First message</h3>
            <textarea
              className="bd-dp-sheet__prompt"
              aria-label="First message"
              value={prompt}
              rows={7}
              onChange={(e) => setEditedPrompt(e.target.value)}
            />
          </section>

          {moveTarget && (
            <label className="bd-dp-sheet__check">
              <input
                type="checkbox"
                checked={moveState}
                onChange={(e) => setMoveState(e.target.checked)}
              />
              Move ADO to {moveTarget}
            </label>
          )}
          {!item.assignedToMe && (
            <label className="bd-dp-sheet__check">
              <input
                type="checkbox"
                checked={assign}
                onChange={(e) => setAssign(e.target.checked)}
              />
              Assign the item to me
            </label>
          )}
        </div>

        <footer className="bd-dp-sheet__foot">
          <Button variant="ghost" size="md" onClick={close}>
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
        </footer>
      </div>
    </div>
  );
}
