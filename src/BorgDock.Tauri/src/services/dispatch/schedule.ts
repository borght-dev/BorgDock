import { t3Catalogue } from '@/services/t3/api';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast, toastError } from '@/stores/toast-store';
import type { DispatchSyncSchedule } from '@/types';
import { configuredHosts } from './hosts';
import { configuredPrompts, launchModels, preferredModel, startRun, syncPrompt } from './launch';
import type { Slot, SyncScope } from './types';
import { preselected, syncCandidates, syncLabel } from './walk';

const EVERY_ITEM: SyncScope = { kind: 'all' };

/** `YYYY-MM-DD` of `date` in local time: the day a schedule runs on. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * True when the schedule should run now: a chosen weekday, its time has come,
 * and it has not run today. A BorgDock opened after the time catches up once.
 */
export function scheduleDue(
  schedule: DispatchSyncSchedule | undefined,
  lastRunDay: string | null,
  now: Date,
): boolean {
  if (!schedule?.enabled || !schedule.weekdays.includes(now.getDay())) return false;
  const [hours, minutes] = schedule.time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return false;
  if (now.getHours() * 60 + now.getMinutes() < hours! * 60 + minutes!) return false;
  return lastRunDay !== localDay(now);
}

/** The slot a scheduled run takes: the last run's when it is free, else the first free one. */
export function scheduledSlot(slots: readonly Slot[], lastSlotId: string | null): Slot | null {
  const free = slots.filter((slot) => slot.available && slot.state === 'free');
  return free.find((slot) => slot.id === lastSlotId) ?? free[0] ?? null;
}

/**
 * Start Sync all if the schedule says so. The day is marked first, so a slow
 * start or a failure never runs it twice; a skipped day says why.
 */
export async function runScheduleIfDue(now: Date = new Date()): Promise<void> {
  const store = useDispatchStore.getState();
  const settings = useSettingsStore.getState().settings;
  const schedule = settings.agents?.dispatchSyncSchedule;
  if (!store.overview || !store.ado.ok) return;
  if (!scheduleDue(schedule, store.scheduleLastRun, now)) return;
  store.markScheduleRun(localDay(now));

  const candidates = syncCandidates(store.overview.items, EVERY_ITEM);
  const picked = new Set(preselected(candidates, EVERY_ITEM));
  const units = candidates.filter((o) => picked.has(o.item.id));
  if (units.length === 0) return;
  const slot = scheduledSlot(store.overview.slots, store.runChoice.slotId);
  if (!slot) {
    showToast({ tone: 'info', message: 'Scheduled sync skipped: every slot is busy.' });
    return;
  }
  try {
    const host = configuredHosts(settings).find((h) => h.id === slot.hostId);
    const catalogue = await t3Catalogue({ id: slot.hostId, baseUrl: host?.baseUrl });
    const models = launchModels(
      catalogue,
      store.threads.filter((t) => t.hostId === slot.hostId),
    );
    const model = models.find((m) => m.id === preferredModel(models, store.runChoice.model));
    if (!model) throw new Error(`${slot.hostLabel} lists no models.`);
    const label = syncLabel(EVERY_ITEM, units.length);
    await startRun({
      kind: 'sync',
      label,
      scope: EVERY_ITEM.kind,
      states: [...new Set(units.map((o) => o.item.state))],
      itemIds: units.map((o) => o.item.id),
      slot,
      model,
      effort: store.runChoice.effort,
      prompt: syncPrompt(units, configuredPrompts(settings.agents?.dispatchPrompts), EVERY_ITEM),
      openInT3: false,
    });
    showToast({ tone: 'success', message: `Scheduled ${label} started in ${slot.name}.` });
  } catch (error) {
    toastError('Scheduled sync not started', error);
  }
}
