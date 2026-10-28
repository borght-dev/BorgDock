import { t3Catalogue } from '@/services/t3/api';
import { type RememberedTarget, useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast, toastError } from '@/stores/toast-store';
import type { DispatchSyncSchedule } from '@/types';
import {
  configuredPrompts,
  hostRefOf,
  launchModels,
  preferredModel,
  startRun,
  syncPrompt,
} from './launch';
import { type LaunchTarget, repositoryProjects, targetPlace } from './launch-target';
import type { AgentProject, SyncScope } from './types';
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

/** Where a scheduled run starts: a new worktree of the last run's repository, in its environment. */
export function scheduledTarget(
  projects: readonly AgentProject[],
  last: RememberedTarget | null,
): Extract<LaunchTarget, { kind: 'worktree' }> | null {
  if (!last?.repository) return null;
  const project = repositoryProjects(projects, last.hostId).find(
    (p) => p.repository?.key === last.repository,
  );
  return project ? { kind: 'worktree', hostId: last.hostId, project, baseRef: null } : null;
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
  const target = scheduledTarget(store.projects, store.runChoice.target);
  if (!target) {
    showToast({
      tone: 'info',
      message:
        'Scheduled sync skipped: start Sync all by hand once, so it knows where to run, or that environment is offline.',
    });
    return;
  }
  try {
    const catalogue = await t3Catalogue(hostRefOf(target.hostId));
    const models = launchModels(
      catalogue,
      store.threads.filter((t) => t.hostId === target.hostId),
    );
    const model = models.find((m) => m.id === preferredModel(models, store.runChoice.model));
    if (!model) throw new Error(`${target.project.hostLabel} lists no models.`);
    const label = syncLabel(EVERY_ITEM, units.length);
    await startRun({
      kind: 'sync',
      label,
      scope: EVERY_ITEM.kind,
      states: [...new Set(units.map((o) => o.item.state))],
      itemIds: units.map((o) => o.item.id),
      target,
      model,
      effort: store.runChoice.effort,
      prompt: syncPrompt(units, configuredPrompts(settings.agents?.dispatchPrompts), EVERY_ITEM),
      openInT3: false,
    });
    showToast({
      tone: 'success',
      message: `Scheduled ${label} started in ${targetPlace(target)}.`,
    });
  } catch (error) {
    toastError('Scheduled sync not started', error);
  }
}
