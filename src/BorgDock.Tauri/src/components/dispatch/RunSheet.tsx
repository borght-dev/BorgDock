import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import {
  configuredPrompts,
  currentIteration,
  startRun,
  suggestPrompt,
  syncPrompt,
} from '@/services/dispatch/launch';
import type { ItemOverview, Overview, SyncScope } from '@/services/dispatch/types';
import {
  ownAgent,
  preselected,
  syncCandidates,
  syncLabel,
  syncTarget,
} from '@/services/dispatch/walk';
import { type RunIntent, useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast, toastError } from '@/stores/toast-store';
import type { DispatchSyncSchedule } from '@/types';
import { LaunchChoiceFields, useLaunchChoice } from './LaunchChoice';

const WEEKDAYS: readonly { day: number; label: string }[] = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

export const DEFAULT_SCHEDULE: DispatchSyncSchedule = {
  enabled: false,
  time: '08:30',
  weekdays: [1, 2, 3, 4],
};

/** ScheduleFields — when Sync all runs by itself: a time of day and weekdays. */
function ScheduleFields() {
  const agents = useSettingsStore((s) => s.settings.agents);
  const schedule = agents?.dispatchSyncSchedule ?? DEFAULT_SCHEDULE;
  const save = (next: DispatchSyncSchedule) => {
    if (!agents) return;
    useSettingsStore.getState().updateSettings({
      agents: { ...agents, dispatchSyncSchedule: next },
    });
  };
  return (
    <section
      aria-label="Repeat"
      className="bd-dp-sheet__repeat"
      data-off={schedule.enabled ? undefined : 'true'}
    >
      <label className="bd-dp-sheet__check">
        <input
          type="checkbox"
          checked={schedule.enabled}
          onChange={(e) => save({ ...schedule, enabled: e.target.checked })}
        />
        Also run Sync all by itself at
        <input
          type="time"
          className="bd-dp-sheet__time"
          aria-label="Time of day"
          value={schedule.time}
          onChange={(e) => save({ ...schedule, time: e.target.value || DEFAULT_SCHEDULE.time })}
        />
      </label>
      <div className="bd-dp-sheet__days" role="group" aria-label="Weekdays">
        {WEEKDAYS.map(({ day, label }) => {
          const on = schedule.weekdays.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              className={clsx('bd-dp-sheet__day', on && 'bd-dp-sheet__day--on')}
              onClick={() =>
                save({
                  ...schedule,
                  weekdays: on
                    ? schedule.weekdays.filter((d) => d !== day)
                    : [...schedule.weekdays, day],
                })
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="bd-dp-sheet__hint">
        Runs while BorgDock is open, in the slot and model you start this one with. Settings →
        Agents holds the message it sends.
      </p>
    </section>
  );
}

/** What the sheet says the run will do. */
function lede(scope: SyncScope): string {
  if (scope.kind === 'item') {
    return 'One thread checks this item against its pull requests and moves it, filling in what the move needs the way the repository’s own ADO skills say.';
  }
  return 'One thread works through these items one by one, writes the notes and moves the ones the evidence supports.';
}

/** What a candidate shows next to its title: the move it gets, its own agent, or its verdict. */
function candidateNote(overview: ItemOverview, scope: SyncScope): { label: string; tone: string } {
  const target = syncTarget(overview, scope);
  if (target) return { label: `→ ${target}`, tone: 'warn' };
  const agent = ownAgent(overview);
  if (agent) return { label: `its agent in ${agent.slot}`, tone: 'run' };
  return { label: overview.verdict.label, tone: overview.verdict.tone };
}

interface RunSheetProps {
  intent: RunIntent;
  overview: Overview;
}

/**
 * RunSheet — starts one agent that works through several items (a sync) or
 * recommends what to pick up next (a suggestion). Pick the items, a slot and
 * a model; the first message is prefilled and can be edited.
 */
export function RunSheet({ intent, overview }: RunSheetProps) {
  const close = useDispatchStore((s) => s.closeRunSheet);
  const runChoice = useDispatchStore((s) => s.runChoice);
  const customPrompts = useSettingsStore((s) => s.settings.agents?.dispatchPrompts);
  const prompts = configuredPrompts(customPrompts);
  const scope = intent.kind === 'sync' ? intent.scope : null;
  const sync = scope !== null;
  const candidates = scope ? syncCandidates(overview.items, scope) : [];
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(scope ? preselected(candidates, scope) : []),
  );
  const choice = useLaunchChoice(overview.slots, runChoice.slotId, runChoice.model);
  const [editedPrompt, setEditedPrompt] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

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

  const chosen = candidates.filter((o) => picked.has(o.item.id));
  const items = overview.items.map((o) => o.item);
  const prompt =
    editedPrompt ?? (scope ? syncPrompt(chosen, prompts, scope) : suggestPrompt(items, prompts));
  const label = scope ? syncLabel(scope, chosen.length) : 'Suggest my next item';
  const { slot, model, effort } = choice;
  const ready = slot && model && (!sync || chosen.length > 0);

  const toggle = (id: number) => {
    setEditedPrompt(null);
    setPicked((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const start = async (openInT3: boolean) => {
    if (!slot || !model) return;
    setStarting(true);
    try {
      await startRun({
        kind: intent.kind,
        label,
        scope: scope?.kind,
        states: [...new Set(chosen.map((o) => o.item.state))],
        itemIds: chosen.map((o) => o.item.id),
        slot,
        model,
        effort,
        prompt,
        openInT3,
      });
      showToast({ tone: 'success', message: `${label} started in ${slot.name}.` });
      close();
    } catch (error) {
      toastError(`${label} not started`, error);
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
        aria-labelledby="bd-dp-run-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bd-dp-sheet__head">
          <h2 id="bd-dp-run-title">{label}</h2>
          <p className="bd-dp-sheet__lede">
            {scope
              ? lede(scope)
              : `One thread reads the unassigned New items in ${currentIteration(items) ?? 'the current sprint'} and recommends one. It changes nothing.`}
          </p>
        </header>

        <div className="bd-dp-sheet__body">
          {scope && (
            <section aria-label="Items">
              <h3 className="bd-dp-sheet__label">
                Items, {chosen.length} of {candidates.length}
              </h3>
              <div className="bd-dp-sheet__items">
                {candidates.map((o) => {
                  const note = candidateNote(o, scope);
                  return (
                    <label key={o.item.id} className="bd-dp-sheet__check bd-dp-sheet__item">
                      <input
                        type="checkbox"
                        checked={picked.has(o.item.id)}
                        onChange={() => toggle(o.item.id)}
                      />
                      <em>{o.item.id}</em>
                      <span className="bd-dp-sheet__item-title">{o.item.title}</span>
                      <span className="bd-dp-verdict" data-tone={note.tone}>
                        {note.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          <LaunchChoiceFields choice={choice} />

          <section aria-label="First message">
            <h3 className="bd-dp-sheet__label">First message</h3>
            <textarea
              className="bd-dp-sheet__prompt"
              aria-label="First message"
              value={prompt}
              rows={8}
              onChange={(e) => setEditedPrompt(e.target.value)}
            />
          </section>

          {scope?.kind === 'all' && <ScheduleFields />}
        </div>

        <footer className="bd-dp-sheet__foot">
          <Button variant="ghost" size="md" onClick={close}>
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
        </footer>
      </div>
    </div>
  );
}
