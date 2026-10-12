import {
  type T3Catalogue,
  type T3ModelOption,
  type T3ModelSelection,
  t3LaunchThread,
  t3ShowThread,
} from '@/services/t3/api';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { assignItemToMe, moveItemState } from './items';
import { configuredHosts, dispatchAdoClient, rawId, scopedId, syncAll } from './sync';
import type { AgentThread, DispatchItem, Slot } from './types';

/**
 * How the agent begins. `plan`: propose a plan and wait. `work`: straight to
 * work. `qa`: bring the item up to date for QA. `done`: close it without QA.
 */
export type LaunchMode = 'plan' | 'work' | 'qa' | 'done';

export const LAUNCH_MODES: readonly { id: LaunchMode; label: string }[] = [
  { id: 'plan', label: 'A plan for me to approve' },
  { id: 'work', label: 'Straight to work' },
  { id: 'qa', label: 'Update for QA' },
  { id: 'done', label: 'Close as done' },
];

// T3's plan mode sticks to the thread and keeps the agent read-only after you
// approve, so "plan first" is an instruction and the thread runs in default mode.
export const PLAN_FIRST = 'Before changing anything, propose a plan and wait for my go-ahead.';

export interface LaunchPrompts {
  pickup: string;
  qa: string;
  done: string;
}

/** The prompts a new install starts with. Placeholders: {id} {title} {branch}. */
export const DEFAULT_LAUNCH_PROMPTS: LaunchPrompts = {
  pickup:
    'Pick up AB#{id}: {title}\n\nRead the work item first. Work on branch {branch} and open a pull request that links AB#{id}.',
  qa: 'Bring AB#{id} up to date for QA: {title}\n\nWork on the branch of the item, {branch}. Add developer notes, QA notes, the pull request link and proof of the change to the work item, then move it to the state that fits.\n\nReport the notes, the proof, the pull request and the state change separately.',
  done: "Close AB#{id} as Done without QA: {title}\n\nRead the work item and check that the work is really finished. If nothing needs testing, write what was done and why QA isn't needed in the item, then move it to Done.\n\nIf you find unfinished work, an open pull request, or something QA should check, stop and tell me instead of closing it.",
};

const BRANCH_STOP_WORDS = new Set([
  'the',
  'and',
  'a',
  'an',
  'for',
  'of',
  'to',
  'before',
  'in',
  'on',
  'every',
  'is',
  'but',
  'with',
  'its',
]);

const FEATURE_TYPES = new Set(['Product Backlog Item', 'User Story', 'Feature', 'Epic']);

/** `feat/` for stories, `chore/` for tasks, `fix/` otherwise, then the id and four title words. */
export function branchName(item: Pick<DispatchItem, 'id' | 'typeName' | 'title'>): string {
  const prefix = FEATURE_TYPES.has(item.typeName)
    ? 'feat'
    : item.typeName === 'Task'
      ? 'chore'
      : 'fix';
  const words = item.title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !BRANCH_STOP_WORDS.has(word) && !/^\d{4,}$/.test(word));
  return [`${prefix}/${item.id}`, ...words.slice(0, 4)].join('-');
}

/** The first message for `mode`, from the templates with the item filled in. */
export function launchPrompt(
  mode: LaunchMode,
  item: Pick<DispatchItem, 'id' | 'typeName' | 'title'>,
  branch: string,
  prompts: LaunchPrompts,
): string {
  const template = mode === 'qa' ? prompts.qa : mode === 'done' ? prompts.done : prompts.pickup;
  const filled = template
    .replaceAll('{id}', String(item.id))
    .replaceAll('{title}', item.title)
    .replaceAll('{branch}', branch);
  return mode === 'plan' ? withPlanFirst(filled) : filled;
}

function withPlanFirst(prompt: string): string {
  return prompt.includes(PLAN_FIRST) ? prompt : `${prompt.trimEnd()}\n\n${PLAN_FIRST}`;
}

/** The prompts in use: the defaults, each replaced by what Settings holds. */
export function configuredPrompts(custom: Partial<LaunchPrompts> | undefined): LaunchPrompts {
  return {
    pickup: custom?.pickup?.trim() || DEFAULT_LAUNCH_PROMPTS.pickup,
    qa: custom?.qa?.trim() || DEFAULT_LAUNCH_PROMPTS.qa,
    done: custom?.done?.trim() || DEFAULT_LAUNCH_PROMPTS.done,
  };
}

const IN_PROGRESS_NAMES = ['Development In Progress', 'In Progress', 'Active', 'Committed'];

/** The state to move an item to when work starts on it; `null` when it is already under way. */
export function stateOnStart(item: Pick<DispatchItem, 'stateCategory' | 'states'>): string | null {
  if (item.stateCategory !== 'Proposed') return null;
  const names = item.states.map((state) => state.name);
  return (
    IN_PROGRESS_NAMES.find((name) => names.includes(name)) ??
    item.states.find((state) => state.category === 'InProgress')?.name ??
    null
  );
}

// ── Models ──────────────────────────────────────────────────

const EFFORT_OPTION_IDS = ['reasoningEffort', 'effort'];
const RECENT_DAYS = 14;
const MAX_RECENT = 5;
const MS_PER_DAY = 86_400_000;

/** A model the launch sheet offers. */
export interface LaunchModel {
  /** `<provider instance>/<model>`. */
  id: string;
  label: string;
  /** Used in T3 in the last two weeks; these come first. */
  recent: boolean;
  /** Reasoning levels the model supports, lowest first. Empty when it has none. */
  efforts: { id: string; label: string }[];
  /** The effort last used with this model in T3, else the model's own default. */
  defaultEffort: string | null;
  /** The selection T3 takes for this model at `effort`. */
  selection: (effort: string | null) => T3ModelSelection;
}

function defaultValue(option: T3ModelOption): string | boolean | undefined {
  if (option.kind === 'boolean') return false;
  return option.choices.find((choice) => choice.isDefault)?.id;
}

/** Every model the host can start, the ones used lately first. */
export function launchModels(
  catalogue: T3Catalogue,
  threads: readonly AgentThread[],
  now: number = Date.now(),
): LaunchModel[] {
  const lastUsed = new Map<string, string>();
  const lastEffort = new Map<string, string>();
  const byActivity = [...threads].sort((a, b) => a.lastActivityAt.localeCompare(b.lastActivityAt));
  for (const thread of byActivity) {
    const id = `${thread.modelInstance}/${thread.model}`;
    if (thread.effort) lastEffort.set(id, thread.effort);
    if (now - Date.parse(thread.lastActivityAt) < RECENT_DAYS * MS_PER_DAY) {
      lastUsed.set(id, thread.lastActivityAt);
    }
  }

  const models = catalogue.providers.flatMap((provider) =>
    provider.models.map((model): LaunchModel => {
      const id = `${provider.instanceId}/${model.slug}`;
      const effortOption = model.options.find((option) => EFFORT_OPTION_IDS.includes(option.id));
      const efforts = (effortOption?.choices ?? []).map(({ id: effortId, label }) => ({
        id: effortId,
        label,
      }));
      const remembered = lastEffort.get(id);
      return {
        id,
        label: `${model.name} · ${provider.displayName}`,
        recent: false,
        efforts,
        defaultEffort:
          (remembered && efforts.some((effort) => effort.id === remembered) ? remembered : null) ??
          effortOption?.choices.find((choice) => choice.isDefault)?.id ??
          null,
        selection: (effort) => ({
          instanceId: provider.instanceId,
          model: model.slug,
          options: model.options.flatMap((option) => {
            const value = option === effortOption ? (effort ?? undefined) : defaultValue(option);
            return value === undefined ? [] : [{ id: option.id, value }];
          }),
        }),
      };
    }),
  );

  const recentIds = [...lastUsed]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id]) => id)
    .filter((id) => models.some((model) => model.id === id))
    .slice(0, MAX_RECENT);
  const recent = recentIds.flatMap((id) => {
    const model = models.find((m) => m.id === id);
    return model ? [{ ...model, recent: true }] : [];
  });
  return [...recent, ...models.filter((model) => !recentIds.includes(model.id))];
}

/** The model to preselect: the one picked last time, else the one used last in T3. */
export function preferredModel(models: readonly LaunchModel[], lastPicked: string | null): string {
  return models.find((model) => model.id === lastPicked)?.id ?? models[0]?.id ?? '';
}

// ── Starting ────────────────────────────────────────────────

export interface StartRequest {
  item: DispatchItem;
  slot: Slot;
  model: LaunchModel;
  effort: string | null;
  mode: LaunchMode;
  /** The first message, as edited in the sheet. */
  prompt: string;
  /** Move the item to this state once the thread runs; `null` leaves ADO alone. */
  moveTo: string | null;
  assignToMe: boolean;
  /** Bring T3 to the front on the new thread. */
  openInT3: boolean;
}

export interface StartResult {
  threadId: string;
  /** ADO steps that failed after the thread started; the thread still runs. */
  warnings: string[];
}

const TITLE_LIMIT = 120;
const PROMPT_LIMIT = 20_000;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Start an agent on `item` in `slot`: launch the thread, link it to the item,
 * then do the ADO steps that were asked for. The thread runs by then, so an
 * ADO step that fails is reported, not rolled back.
 */
export async function startThread(request: StartRequest): Promise<StartResult> {
  const { item, slot, model } = request;
  const written = request.prompt.trim();
  if (!written) throw new Error('The first message is empty.');
  if (written.length > PROMPT_LIMIT) {
    throw new Error('The first message is longer than 20,000 characters.');
  }
  if (!slot.available) throw new Error(`${slot.hostLabel} is offline.`);
  if (slot.state !== 'free') {
    throw new Error(`${slot.name} already has an open thread. Settle it or pick another slot.`);
  }

  const settings = useSettingsStore.getState().settings;
  const host = configuredHosts(settings).find((h) => h.id === slot.hostId);
  const hostRef = { id: slot.hostId, baseUrl: host?.baseUrl };
  const rawThreadId = await t3LaunchThread(hostRef, {
    projectId: rawId(slot.hostId, slot.id),
    title: `AB#${item.id} ${item.title}`.slice(0, TITLE_LIMIT),
    modelSelection: model.selection(model.efforts.length > 0 ? request.effort : null),
    prompt: request.mode === 'plan' ? withPlanFirst(written) : written,
  });
  const threadId = scopedId(slot.hostId, rawThreadId);
  const store = useDispatchStore.getState();
  store.linkThread(threadId, item.id);
  store.rememberLaunch(model.id, request.effort, request.mode);

  const warnings: string[] = [];
  const client = dispatchAdoClient();
  if (client && request.assignToMe) {
    await assignItemToMe(client, item.id).catch((error) =>
      warnings.push(`Not assigned to you: ${errorText(error)}`),
    );
  }
  if (client && request.moveTo) {
    await moveItemState(client, item.id, request.moveTo).catch((error) =>
      warnings.push(`ADO state not changed: ${errorText(error)}`),
    );
  }
  if (request.openInT3) {
    await t3ShowThread(hostRef, rawThreadId, settings.agents?.t3Path).catch((error) =>
      warnings.push(`T3 did not open: ${errorText(error)}`),
    );
  }
  syncAll(true);
  return { threadId, warnings };
}

/** The free slot an item's last thread ran in: the natural place for a QA or Done handoff. */
export function lastSlotOf(
  threads: readonly AgentThread[],
  slots: readonly Slot[],
): Slot | undefined {
  const last = threads[0];
  if (!last) return undefined;
  return slots.find(
    (slot) => slot.id === last.projectId && slot.available && slot.state === 'free',
  );
}

export type { T3Catalogue };
