import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { Button, Seg2, Select } from '@/components/shared/primitives';
import {
  branchName,
  configuredPrompts,
  LAUNCH_MODES,
  type LaunchMode,
  type LaunchModel,
  lastSlotOf,
  launchModels,
  launchPrompt,
  preferredModel,
  startThread,
  stateOnStart,
} from '@/services/dispatch/launch';
import { configuredHosts } from '@/services/dispatch/sync';
import type { ItemOverview, Overview, Slot } from '@/services/dispatch/types';
import { type T3Catalogue, t3Catalogue } from '@/services/t3/api';
import { type LaunchIntent, useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast, toastError } from '@/stores/toast-store';
import { groupSlotsByHost, SlotTile } from './SlotStrip';

/** A catalogue is read again after this long; providers rarely change. */
const CATALOGUE_TTL_MS = 60_000;
const catalogues = new Map<string, { at: number; catalogue: T3Catalogue }>();

/** Forget the catalogues read so far, so the next sheet asks T3 again. */
export function clearCatalogueCache(): void {
  catalogues.clear();
}

interface CatalogueState {
  catalogue: T3Catalogue | null;
  error: string | null;
}

/** What `hostId` can start, read from T3 when the sheet opens or the host changes. */
function useCatalogue(hostId: string | null): CatalogueState {
  const [state, setState] = useState<CatalogueState>({ catalogue: null, error: null });
  useEffect(() => {
    if (!hostId) {
      setState({ catalogue: null, error: null });
      return;
    }
    const cached = catalogues.get(hostId);
    if (cached && Date.now() - cached.at < CATALOGUE_TTL_MS) {
      setState({ catalogue: cached.catalogue, error: null });
      return;
    }
    let cancelled = false;
    setState({ catalogue: cached?.catalogue ?? null, error: null });
    const host = configuredHosts(useSettingsStore.getState().settings).find((h) => h.id === hostId);
    t3Catalogue({ id: hostId, baseUrl: host?.baseUrl })
      .then((catalogue) => {
        catalogues.set(hostId, { at: Date.now(), catalogue });
        if (!cancelled) setState({ catalogue, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ catalogue: null, error: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [hostId]);
  return state;
}

/** The branch the item's work already lives on: its pull request's, or a thread's that names it. */
function existingBranch(unit: ItemOverview): string | null {
  if (unit.pullRequest?.branch) return unit.pullRequest.branch;
  const namesItem = new RegExp(`(^|/)(AB#?)?${unit.item.id}(\\b|[-_])`, 'i');
  return unit.threads.map((t) => t.branch).find((b) => b && namesItem.test(b)) ?? null;
}

function freeSlots(slots: readonly Slot[]): Slot[] {
  return slots.filter((slot) => slot.available && slot.state === 'free');
}

/** The effort to preselect for `model`: last picked here, else its own default. */
function effortFor(
  model: LaunchModel | undefined,
  remembered: Record<string, string>,
): string | null {
  if (!model) return null;
  const last = remembered[model.id];
  if (last && model.efforts.some((effort) => effort.id === last)) return last;
  return model.defaultEffort;
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
  const threads = useDispatchStore((s) => s.threads);
  const preferences = useDispatchStore((s) => s.launchPreferences);
  const customPrompts = useSettingsStore((s) => s.settings.agents?.dispatchPrompts);
  const unit = overview.items.find((o) => o.item.id === intent.itemId);

  const [slotId, setSlotId] = useState<string | null>(
    () => intent.slotId ?? freeSlots(overview.slots)[0]?.id ?? null,
  );
  const [mode, setMode] = useState<LaunchMode>(preferences.mode);
  const [pickedModel, setPickedModel] = useState<string | null>(null);
  const [pickedEffort, setPickedEffort] = useState<string | null>(null);
  /** The first message once the user edited it; null follows the template. */
  const [editedPrompt, setEditedPrompt] = useState<string | null>(null);
  const [moveState, setMoveState] = useState(true);
  const [assign, setAssign] = useState(true);
  const [starting, setStarting] = useState(false);

  const slot = overview.slots.find((s) => s.id === slotId && s.available && s.state === 'free');
  const { catalogue, error: catalogueError } = useCatalogue(slot?.hostId ?? null);
  const models = useMemo(
    () =>
      catalogue
        ? launchModels(
            catalogue,
            threads.filter((t) => t.hostId === slot?.hostId),
          )
        : [],
    [catalogue, threads, slot?.hostId],
  );

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

  const modelId = models.some((m) => m.id === pickedModel)
    ? (pickedModel ?? '')
    : preferredModel(models, preferences.model);
  const model = models.find((m) => m.id === modelId);
  const effort =
    pickedEffort && model?.efforts.some((e) => e.id === pickedEffort)
      ? pickedEffort
      : effortFor(model, preferences.efforts);

  const handoff = mode === 'qa' || mode === 'done';
  const branch = handoff ? (existingBranch(unit) ?? branchName(item)) : branchName(item);
  const prompts = configuredPrompts(customPrompts);
  const prompt = editedPrompt ?? launchPrompt(mode, item, branch, prompts);
  const moveTarget = handoff ? null : stateOnStart(item);
  const free = freeSlots(overview.slots);

  const pickMode = (next: LaunchMode) => {
    setMode(next);
    setEditedPrompt(null);
    // A handoff goes back to where the work was done, when that slot is free.
    const home = lastSlotOf(unit.threads, overview.slots);
    if ((next === 'qa' || next === 'done') && home && !intent.slotId) setSlotId(home.id);
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
          <section aria-label="Slot">
            <h3 className="bd-dp-sheet__label">
              Slot, {free.length} free
              {slot ? '' : ' · pick one'}
            </h3>
            {groupSlotsByHost(overview.slots).map((group) => (
              <div key={group.hostLabel} className="bd-dp-sheet__slots">
                <span className="bd-dp-sheet__host">{group.hostLabel}</span>
                {group.slots.map((s) => (
                  <SlotTile
                    key={s.id}
                    slot={s}
                    selected={s.id === slot?.id}
                    onStartIn={(picked) => setSlotId(picked.id)}
                  />
                ))}
              </div>
            ))}
            {free.length === 0 && (
              <p className="bd-dp-sheet__hint">Every slot is busy. Settle a thread to free one.</p>
            )}
          </section>

          <div className="bd-dp-sheet__row">
            <section aria-label="Model" className="bd-dp-sheet__model">
              <h3 className="bd-dp-sheet__label">Model</h3>
              <Select
                ariaLabel="Model"
                value={modelId}
                options={models.map((m) => ({ value: m.id, label: m.label }))}
                onChange={(next) => {
                  setPickedModel(next);
                  setPickedEffort(null);
                }}
                placeholder={
                  catalogueError
                    ? 'T3 did not list its models'
                    : slot
                      ? 'Loading models…'
                      : 'Pick a slot first'
                }
              />
            </section>
            {model && model.efforts.length > 0 && (
              <section aria-label="Reasoning">
                <h3 className="bd-dp-sheet__label">Reasoning</h3>
                {model.efforts.length <= 4 ? (
                  <Seg2
                    ariaLabel="Reasoning effort"
                    size="sm"
                    value={effort ?? ''}
                    options={model.efforts.map((e) => ({ value: e.id, label: e.label }))}
                    onChange={setPickedEffort}
                  />
                ) : (
                  <Select
                    ariaLabel="Reasoning effort"
                    value={effort ?? ''}
                    options={model.efforts.map((e) => ({ value: e.id, label: e.label }))}
                    onChange={setPickedEffort}
                  />
                )}
              </section>
            )}
          </div>
          {catalogueError && <p className="bd-dp-sheet__hint">{catalogueError}</p>}

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
