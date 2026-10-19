import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/shared/primitives';
import { WorkItemTypePill } from '@/components/work-items/WorkItemTypePill';
import { dispatchActions } from '@/services/dispatch/actions';
import {
  configuredPrompts,
  currentIteration,
  startRun,
  suggestPrompt,
  syncPrompt,
} from '@/services/dispatch/launch';
import type { ItemOverview, Overview, SyncScope } from '@/services/dispatch/types';
import {
  groupByTarget,
  ownAgent,
  preselected,
  syncCandidates,
  syncLabel,
  syncTarget,
  type TargetGroup,
} from '@/services/dispatch/walk';
import { type RunIntent, useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast, toastError } from '@/stores/toast-store';
import type { DispatchSyncSchedule } from '@/types';
import { LaunchChoiceFields, useLaunchChoice } from './LaunchChoice';
import { revealRun } from './WalkRuns';

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

/** What the folded first message says it will ask. */
function instructionsSummary(scope: SyncScope | null): string {
  if (!scope) {
    return 'The default pickup message: read the sprint and your open items, then recommend one.';
  }
  if (scope.kind === 'item') {
    return 'The default move message: check the item against its pull requests and move it the way the repository’s ADO skills say.';
  }
  return 'The default sync message: read each item with its comments and Developer Notes, check its pull requests, move it through the repository’s ADO skills, and end with one line per item.';
}

/** Why a candidate is in the run: the evidence for its move, its own agent, or its verdict. */
function candidateWhy(overview: ItemOverview, scope: SyncScope): { label: string; tone?: string } {
  const { suggestion } = overview;
  if (suggestion && syncTarget(overview, scope) === suggestion.to)
    return { label: suggestion.reason };
  const agent = ownAgent(overview);
  if (agent) return { label: `Its own agent works on it in ${agent.slot}.`, tone: 'run' };
  return { label: overview.verdict.label, tone: overview.verdict.tone };
}

/** How many evidence chips a candidate shows beside its title. */
const CANDIDATE_FACTS = 2;

function CandidateRow({
  overview,
  scope,
  picked,
  onToggle,
}: {
  overview: ItemOverview;
  scope: SyncScope;
  picked: boolean;
  onToggle: () => void;
}) {
  const { item } = overview;
  const why = candidateWhy(overview, scope);
  return (
    <label className="bd-dp-sheet__item" data-off={picked ? undefined : 'true'}>
      <input type="checkbox" checked={picked} onChange={onToggle} />
      <WorkItemTypePill type={item.typeName} />
      <em>{item.id}</em>
      <span className="bd-dp-sheet__item-main">
        <span className="bd-dp-sheet__item-title" title={item.title}>
          {item.title}
        </span>
        <span className="bd-dp-sheet__item-why" data-tone={why.tone}>
          {why.label}
        </span>
      </span>
      <span className="bd-dp-sheet__item-now">
        <i>now</i> {item.state}
      </span>
      <span className="bd-dp-sheet__item-facts">
        {overview.evidence.slice(0, CANDIDATE_FACTS).map((fact) => (
          <span key={fact.label} className="bd-dp-sheet__fact" data-tone={fact.tone ?? undefined}>
            {fact.label}
          </span>
        ))}
      </span>
    </label>
  );
}

/** A checkbox that also shows "some", for a group partly picked. */
function GroupCheck({
  checked,
  mixed,
  label,
  onChange,
}: {
  checked: boolean;
  mixed: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={onChange} />
  );
}

function TargetGroupBlock({
  group,
  scope,
  picked,
  onToggle,
  onToggleAll,
}: {
  group: TargetGroup;
  scope: SyncScope;
  picked: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: readonly number[], on: boolean) => void;
}) {
  const ids = group.rows.map((o) => o.item.id);
  const count = ids.filter((id) => picked.has(id)).length;
  const title = group.to ? `→ ${group.to}` : 'No move suggested';
  return (
    <section className="bd-dp-sheet__group" aria-label={title}>
      <div className="bd-dp-sheet__grouphead" data-move={group.to ? 'true' : undefined}>
        <GroupCheck
          checked={count === ids.length}
          mixed={count > 0 && count < ids.length}
          label={`Pick every item in ${title}`}
          onChange={() => onToggleAll(ids, count < ids.length)}
        />
        <span className="bd-dp-sheet__groupname">{title}</span>
        <em>{count === ids.length ? ids.length : `${count} of ${ids.length}`}</em>
      </div>
      {group.rows.map((o) => (
        <CandidateRow
          key={o.item.id}
          overview={o}
          scope={scope}
          picked={picked.has(o.item.id)}
          onToggle={() => onToggle(o.item.id)}
        />
      ))}
    </section>
  );
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
  const [editing, setEditing] = useState(false);
  const [showingAll, setShowingAll] = useState(false);
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
  const effortLabel = model?.efforts.find((e) => e.id === effort)?.label;
  const groups = scope && scope.kind !== 'item' ? groupByTarget(candidates, scope) : null;

  const pickAll = (all: boolean) => {
    setEditedPrompt(null);
    setPicked(new Set(all ? candidates.map((o) => o.item.id) : []));
  };

  const toggle = (id: number) => {
    setEditedPrompt(null);
    setPicked((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: readonly number[], on: boolean) => {
    setEditedPrompt(null);
    setPicked((was) => {
      const next = new Set(was);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const start = async (openInT3: boolean) => {
    if (!slot || !model) return;
    setStarting(true);
    try {
      const threadId = await startRun({
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
      const what = [
        sync ? `${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}` : null,
        slot.name,
        model.label,
      ]
        .filter(Boolean)
        .join(' · ');
      showToast({
        tone: 'success',
        title: `${label} started`,
        message: openInT3
          ? `${what}. It is open in T3.`
          : `${what}. Its progress shows in Dispatch.`,
        actionLabel: openInT3 ? undefined : 'Open in T3',
        onAction: openInT3
          ? undefined
          : () => dispatchActions.openInT3({ id: threadId, hostId: slot.hostId }),
        secondaryLabel: 'Show me',
        onSecondary: () => revealRun(threadId),
        durationMs: 8000,
      });
      close();
    } catch (error) {
      toastError(`${label} not started`, error);
    } finally {
      setStarting(false);
    }
  };

  const edited = editedPrompt !== null;
  const instructions = (
    <section aria-label="First message" className="bd-dp-sheet__instructions">
      <h3 className="bd-dp-sheet__label">
        <span>Instructions</span>
        <span>{edited ? 'edited' : 'default'}</span>
      </h3>
      {editing || edited ? (
        <textarea
          className="bd-dp-sheet__prompt"
          aria-label="First message"
          value={prompt}
          rows={sync ? 14 : 8}
          onChange={(e) => setEditedPrompt(e.target.value)}
        />
      ) : (
        <div className="bd-dp-sheet__message">
          <p className="bd-dp-sheet__summary">{instructionsSummary(scope)}</p>
          <pre className="bd-dp-sheet__preview" data-all={showingAll ? 'true' : undefined}>
            {prompt}
          </pre>
          <div className="bd-dp-sheet__message-acts">
            <button type="button" className="bd-dp-sheet__edit" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="bd-dp-sheet__edit bd-dp-sheet__edit--quiet"
              onClick={() => setShowingAll((was) => !was)}
            >
              {showingAll ? 'Show less' : 'Show full message'}
            </button>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className="bd-modal-backdrop" role="presentation" onClick={close}>
      <div
        className={clsx(
          'bd-modal bd-dp-sheet bd-dp-sheet--run',
          sync && scope.kind !== 'item' && 'bd-dp-sheet--wide',
        )}
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
            <section aria-label="Items" className="bd-dp-sheet__pick">
              <div className="bd-dp-sheet__pickhead">
                <h3 className="bd-dp-sheet__label">
                  {candidates.length === 1
                    ? '1 item'
                    : `${chosen.length} of ${candidates.length} selected`}
                </h3>
                {candidates.length > 1 && (
                  <button
                    type="button"
                    className="bd-dp-sheet__edit"
                    onClick={() => pickAll(chosen.length < candidates.length)}
                  >
                    {chosen.length < candidates.length ? 'Select all' : 'Select none'}
                  </button>
                )}
              </div>
              <div className="bd-dp-sheet__items">
                {groups
                  ? groups.map((group) => (
                      <TargetGroupBlock
                        key={group.to ?? ''}
                        group={group}
                        scope={scope}
                        picked={picked}
                        onToggle={toggle}
                        onToggleAll={toggleAll}
                      />
                    ))
                  : candidates.map((o) => (
                      <CandidateRow
                        key={o.item.id}
                        overview={o}
                        scope={scope}
                        picked={picked.has(o.item.id)}
                        onToggle={() => toggle(o.item.id)}
                      />
                    ))}
              </div>
            </section>
          )}

          <div className="bd-dp-sheet__side">
            <LaunchChoiceFields choice={choice} />
            {instructions}
            {scope?.kind === 'all' && <ScheduleFields />}
          </div>
        </div>

        <footer className="bd-dp-sheet__foot">
          <Button variant="ghost" size="md" onClick={close}>
            Cancel
          </Button>
          <span className="bd-dp-sheet__spacer" />
          <span
            className="bd-dp-sheet__what"
            title={[slot?.name, model?.label, effortLabel].filter(Boolean).join(' · ')}
          >
            {sync && (
              <strong>
                {chosen.length} {chosen.length === 1 ? 'item' : 'items'}
              </strong>
            )}
            {[slot?.name, model?.label, effortLabel].filter(Boolean).map((part, i) => (
              <span key={part}>
                {sync || i > 0 ? ' · ' : ''}
                {part}
              </span>
            ))}
          </span>
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
