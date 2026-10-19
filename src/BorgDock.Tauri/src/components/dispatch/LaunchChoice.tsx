import { useEffect, useMemo, useState } from 'react';
import { SearchSelect, type SearchSelectSection, Seg2 } from '@/components/shared/primitives';
import { configuredHosts } from '@/services/dispatch/hosts';
import { type LaunchModel, launchModels, preferredModel } from '@/services/dispatch/launch';
import type { Slot } from '@/services/dispatch/types';
import { type T3Catalogue, t3Catalogue } from '@/services/t3/api';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
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

export function freeSlots(slots: readonly Slot[]): Slot[] {
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

/** The slot, model and reasoning effort a sheet starts an agent with. */
export interface LaunchChoice {
  slots: readonly Slot[];
  /** The picked slot while it is still free. */
  slot: Slot | undefined;
  setSlotId: (id: string | null) => void;
  models: LaunchModel[];
  modelId: string;
  model: LaunchModel | undefined;
  setModel: (id: string) => void;
  effort: string | null;
  setEffort: (id: string) => void;
  catalogueError: string | null;
}

/** Slot, model and effort, preselected from what was picked last time. */
export function useLaunchChoice(
  slots: readonly Slot[],
  initialSlotId: string | null | undefined,
  lastModel: string | null = null,
): LaunchChoice {
  const threads = useDispatchStore((s) => s.threads);
  const preferences = useDispatchStore((s) => s.launchPreferences);
  const [slotId, setSlotId] = useState<string | null>(
    () =>
      (initialSlotId && freeSlots(slots).some((s) => s.id === initialSlotId)
        ? initialSlotId
        : null) ??
      freeSlots(slots)[0]?.id ??
      null,
  );
  const [pickedModel, setPickedModel] = useState<string | null>(null);
  const [pickedEffort, setPickedEffort] = useState<string | null>(null);

  const slot = slots.find((s) => s.id === slotId && s.available && s.state === 'free');
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
  const modelId = models.some((m) => m.id === pickedModel)
    ? (pickedModel ?? '')
    : preferredModel(models, lastModel ?? preferences.model);
  const model = models.find((m) => m.id === modelId);
  const effort =
    pickedEffort && model?.efforts.some((e) => e.id === pickedEffort)
      ? pickedEffort
      : effortFor(model, preferences.efforts);

  return {
    slots,
    slot,
    setSlotId,
    models,
    modelId,
    model,
    setModel: (id) => {
      setPickedModel(id);
      setPickedEffort(null);
    },
    effort,
    setEffort: setPickedEffort,
    catalogueError,
  };
}

/** The most reasoning levels a segmented control holds; more become a grid of buttons. */
const MAX_SEGMENTED_EFFORTS = 4;

/** The models in the picker: the recent ones with their account, then one section per account. */
export function modelSections(models: readonly LaunchModel[]): SearchSelectSection[] {
  const recent = models.filter((model) => model.recent);
  const byAccount = new Map<string, LaunchModel[]>();
  for (const model of models) {
    if (model.recent) continue;
    byAccount.set(model.account, [...(byAccount.get(model.account) ?? []), model]);
  }
  const option = (model: LaunchModel) => ({
    value: model.id,
    label: model.name,
    badge: model.account,
  });
  return [
    ...(recent.length > 0 ? [{ label: 'Recent', options: recent.map(option) }] : []),
    ...[...byAccount].map(([account, list]) => ({
      label: account,
      options: list.map(option),
      showBadges: false,
    })),
  ];
}

/** LaunchChoiceFields — the slot tiles, the model and the reasoning effort. */
export function LaunchChoiceFields({ choice }: { choice: LaunchChoice }) {
  const { slots, slot, models, modelId, model, effort, catalogueError } = choice;
  const free = freeSlots(slots);
  return (
    <>
      <section aria-label="Slot">
        <h3 className="bd-dp-sheet__label">
          <span>Slot</span>
          <span>
            {free.length} free
            {slot ? '' : ' · pick one'}
          </span>
        </h3>
        {groupSlotsByHost(slots).map((group) => (
          <div key={group.hostLabel} className="bd-dp-sheet__slots">
            <span className="bd-dp-sheet__host">{group.hostLabel}</span>
            {group.slots.map((s) => (
              <SlotTile
                key={s.id}
                slot={s}
                detailed
                selected={s.id === slot?.id}
                onStartIn={(picked) => choice.setSlotId(picked.id)}
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
          <SearchSelect
            ariaLabel="Model"
            value={modelId}
            sections={modelSections(models)}
            onChange={choice.setModel}
            filterPlaceholder="Filter models"
            disabled={models.length === 0}
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
            {model.efforts.length <= MAX_SEGMENTED_EFFORTS ? (
              <Seg2
                ariaLabel="Reasoning effort"
                size="sm"
                value={effort ?? ''}
                options={model.efforts.map((e) => ({ value: e.id, label: e.label }))}
                onChange={choice.setEffort}
              />
            ) : (
              <div className="bd-dp-sheet__efforts" role="group" aria-label="Reasoning effort">
                {model.efforts.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={e.id === effort}
                    className="bd-dp-sheet__effort"
                    onClick={() => choice.setEffort(e.id)}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      {catalogueError && <p className="bd-dp-sheet__hint">{catalogueError}</p>}
    </>
  );
}
