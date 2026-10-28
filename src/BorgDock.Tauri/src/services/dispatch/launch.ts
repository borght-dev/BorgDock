import { withVault } from '@/services/notes/vault-line';
import {
  type T3Catalogue,
  type T3ModelOption,
  type T3ModelSelection,
  type T3Workspace,
  t3LaunchThread,
  t3SendMessage,
  t3ShowThread,
} from '@/services/t3/api';
import { type RunKind, useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { configuredHosts, rawId, scopedId } from './hosts';
import { assignItemToMe, moveItemState } from './items';
import { canContinue, type LaunchTarget, targetPlace } from './launch-target';
import { dispatchAdoClient, syncAll } from './sync';
import type { AgentThread, DispatchItem, ItemOverview, SyncScope } from './types';

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
  /** One agent brings several items up to date. Placeholder: {items}. */
  sync: string;
  /** One agent recommends the next item. Placeholders: {iteration} {assigned}. */
  suggest: string;
}

/**
 * The prompts a new install starts with. Placeholders: {id} {title} {branch};
 * {items} for sync; {iteration} {assigned} for suggest.
 */
export const DEFAULT_LAUNCH_PROMPTS: LaunchPrompts = {
  pickup:
    'Pick up AB#{id}: {title}\n\nRead the work item first. Work on branch {branch} and open a pull request that links AB#{id}.',
  qa: 'Bring AB#{id} up to date for QA: {title}\n\nWork on the branch of the item, {branch}. Add developer notes, QA notes, the pull request link and proof of the change to the work item, then move it to the state that fits.\n\nReport the notes, the proof, the pull request and the state change separately.',
  done: "Close AB#{id} as Done without QA: {title}\n\nRead the work item and check that the work is really finished. If nothing needs testing, write what was done and why QA isn't needed in the item, then move it to Done.\n\nIf you find unfinished work, an open pull request, or something QA should check, stop and tell me instead of closing it.",
  sync: "Bring these work items up to date, one at a time:\n\n{items}\n\nFor each item: read it with its comments and Developer Notes, check its linked pull requests, and decide which state it belongs in. Where a line names a state, that is the move the evidence points to or the move I asked for: check it, then make it. Use this repository's own work-item skills and commands for every write (for example ado-update-for-qa, ado-dev-in-progress and the post-merge rules of ado-fix): they say what the Developer Notes, the QA notes, the required fields and the state change need. Move an item only when the evidence supports it; otherwise leave it and say why.\n\nEnd with one line per item: its id, what you changed, and the state it is in now.",
  suggest:
    "Suggest the next work item I should pick up.\n\nMy open items:\n{assigned}\n\nRead the unassigned items in state New in the current sprint ({iteration}) and recommend one: the one that matters most now, weighing priority, severity, due dates and what I worked on recently. Don't assign or change anything.\n\nAnswer with the recommended item (AB#id and title), why it wins in two or three short bullets, and one runner-up.",
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
    sync: custom?.sync?.trim() || DEFAULT_LAUNCH_PROMPTS.sync,
    suggest: custom?.suggest?.trim() || DEFAULT_LAUNCH_PROMPTS.suggest,
  };
}

/**
 * One line per item for {items}: what it is, where it is, what Dispatch sees,
 * and the state to move it to: the one asked for, else the one the evidence
 * points to.
 */
export function itemLines(units: readonly ItemOverview[], scope?: SyncScope): string {
  return units
    .map((unit) => {
      const { item, verdict, evidence, suggestion } = unit;
      const facts = [verdict.label, ...evidence.map((fact) => fact.label)].join('; ');
      const line = `- AB#${item.id} ${item.title} (${item.state}): ${facts}`;
      const asked = scope?.kind === 'item' && scope.itemId === item.id ? scope.to : null;
      if (asked && asked !== suggestion?.to)
        return `${line}. Move it to ${asked}: I asked for this.`;
      if (suggestion) return `${line}. Move it to ${suggestion.to}: ${suggestion.reason}`;
      return line;
    })
    .join('\n');
}

/** The first message of a run that brings `units` up to date. */
export function syncPrompt(
  units: readonly ItemOverview[],
  prompts: LaunchPrompts,
  scope?: SyncScope,
): string {
  return prompts.sync.replaceAll('{items}', itemLines(units, scope));
}

/** The sprint most of my items are in, as ADO names it; `null` when they all sit on the backlog. */
export function currentIteration(items: readonly DispatchItem[]): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.sprint === 'Backlog' || !item.iterationPath) continue;
    counts.set(item.iterationPath, (counts.get(item.iterationPath) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** The first message of a run that recommends what to pick up next. */
export function suggestPrompt(items: readonly DispatchItem[], prompts: LaunchPrompts): string {
  const assigned = items
    .filter((item) => item.assignedToMe)
    .map((item) => `- AB#${item.id} ${item.title} (${item.state})`)
    .join('\n');
  return prompts.suggest
    .replaceAll('{iteration}', currentIteration(items) ?? 'the current sprint')
    .replaceAll('{assigned}', assigned || '- none');
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
  /** `<model> · <account>`. */
  label: string;
  /** The model's own name, without the account. */
  name: string;
  /** The provider instance it runs under, as T3 names it. */
  account: string;
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
        name: model.name,
        account: provider.displayName,
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
  target: LaunchTarget;
  /** Absent when the target continues a thread: it keeps its own model. */
  model: LaunchModel | undefined;
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

/** What `launchAt` starts: a titled thread with its first message. */
export interface TargetLaunch {
  target: LaunchTarget;
  /** Absent when the target continues a thread: it keeps its own model. */
  model: LaunchModel | undefined;
  effort: string | null;
  title: string;
  prompt: string;
}

export function hostRefOf(hostId: string) {
  const host = configuredHosts(useSettingsStore.getState().settings).find((h) => h.id === hostId);
  return { id: hostId, baseUrl: host?.baseUrl };
}

/** Where T3 runs a new thread for `target`: its project and the checkout in it. */
function workspaceOf(target: Exclude<LaunchTarget, { kind: 'continue' }>): {
  projectId: string;
  workspace: T3Workspace;
} {
  if (target.kind === 'worktree') {
    return {
      projectId: target.project.id,
      workspace: { type: 'worktree', baseRef: target.baseRef },
    };
  }
  const { thread } = target;
  return {
    projectId: thread.projectId,
    workspace: thread.worktreePath
      ? { type: 'existingWorktree', worktreePath: thread.worktreePath, branch: thread.branch }
      : { type: 'root' },
  };
}

/**
 * Start an agent where `target` says and resolve with its thread's scoped id.
 * Every T3 launch goes through here: Dispatch's item threads and runs,
 * workstream runs and related CI failure investigations.
 */
export async function launchAt(request: TargetLaunch): Promise<string> {
  const { target, model } = request;
  const written = request.prompt.trim();
  if (!written) throw new Error('The first message is empty.');
  if (written.length > PROMPT_LIMIT) {
    throw new Error('The first message is longer than 20,000 characters.');
  }
  const host = hostRefOf(target.hostId);
  if (target.kind === 'continue') {
    if (!canContinue(target.thread)) {
      throw new Error(
        `${target.thread.title} is still at work. Start a new thread in its checkout.`,
      );
    }
    await t3SendMessage(host, rawId(target.hostId, target.thread.id), written, false);
    return target.thread.id;
  }
  if (!model) throw new Error('Pick a model.');
  const { projectId, workspace } = workspaceOf(target);
  const rawThreadId = await t3LaunchThread(host, {
    projectId: rawId(target.hostId, projectId),
    title: request.title.slice(0, TITLE_LIMIT),
    modelSelection: model.selection(model.efforts.length > 0 ? request.effort : null),
    prompt: withVault(written),
    workspace,
  });
  return scopedId(target.hostId, rawThreadId);
}

/** The repository a target works in, remembered so the next sheet starts there. */
export function rememberTarget(target: LaunchTarget): void {
  const repository =
    target.kind === 'worktree'
      ? (target.project.repository?.key ?? null)
      : (useDispatchStore.getState().projects.find((p) => p.id === target.thread.projectId)
          ?.repository?.key ?? null);
  useDispatchStore.getState().rememberTarget({ hostId: target.hostId, repository });
}

/**
 * Start an agent on `item` where `target` says: launch the thread, link it to the item,
 * then do the ADO steps that were asked for. The thread runs by then, so an
 * ADO step that fails is reported, not rolled back.
 */
export async function startThread(request: StartRequest): Promise<StartResult> {
  const { item, target, model } = request;
  const written = request.prompt.trim();
  const threadId = await launchAt({
    target,
    model,
    effort: request.effort,
    title: `AB#${item.id} ${item.title}`,
    prompt: request.mode === 'plan' && written ? withPlanFirst(written) : written,
  });
  const settings = useSettingsStore.getState().settings;
  const store = useDispatchStore.getState();
  store.linkThread(threadId, item.id);
  if (model) store.rememberLaunch(model.id, request.effort, request.mode);
  rememberTarget(target);

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
    await t3ShowThread(
      hostRefOf(target.hostId),
      rawId(target.hostId, threadId),
      settings.agents?.t3Path,
    ).catch((error) => warnings.push(`T3 did not open: ${errorText(error)}`));
  }
  syncAll(true);
  return { threadId, warnings };
}

export type { T3Catalogue };

// ── Runs ────────────────────────────────────────────────────

export interface RunRequest {
  kind: RunKind;
  /** What the thread is called in T3, after "Dispatch:". */
  label: string;
  /** For a sync, what it was started for. */
  scope?: SyncScope['kind'];
  /** For a sync, the states of the items it was given, and their ids. */
  states: string[];
  itemIds: number[];
  target: LaunchTarget;
  model: LaunchModel | undefined;
  effort: string | null;
  prompt: string;
  openInT3: boolean;
}

/**
 * Start one agent that works on many items, or on none: a sync or a
 * suggestion. The thread is linked to no item, so the ids it names don't
 * attach it to one, and Dispatch remembers it to show how it went. A sync of
 * one item is that item's thread: its row shows the agent at work.
 */
export async function startRun(request: RunRequest): Promise<string> {
  const { target, model } = request;
  const threadId = await launchAt({
    target,
    model,
    effort: request.effort,
    title: `Dispatch: ${request.label}`,
    prompt: request.prompt,
  });
  const store = useDispatchStore.getState();
  const fromStates = Object.fromEntries(
    (store.overview?.items ?? [])
      .filter((o) => request.itemIds.includes(o.item.id))
      .map((o) => [String(o.item.id), o.item.state]),
  );
  // A continued thread keeps the item it belongs to.
  if (target.kind !== 'continue') {
    store.linkThread(threadId, request.scope === 'item' ? (request.itemIds[0] ?? null) : null);
  }
  store.addRun({
    threadId,
    kind: request.kind,
    scope: request.scope,
    states: request.states,
    itemIds: request.itemIds,
    fromStates,
    where: targetPlace(target),
    startedAt: new Date().toISOString(),
  });
  rememberTarget(target);
  store.rememberRunChoice({
    target: useDispatchStore.getState().launchPreferences.target,
    model: model?.id ?? store.runChoice.model,
    effort: model ? request.effort : store.runChoice.effort,
  });
  if (request.openInT3) {
    await t3ShowThread(
      hostRefOf(target.hostId),
      rawId(target.hostId, threadId),
      useSettingsStore.getState().settings.agents?.t3Path,
    ).catch(() => {});
  }
  syncAll(true);
  return threadId;
}
