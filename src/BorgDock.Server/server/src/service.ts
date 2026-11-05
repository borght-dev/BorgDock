import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type {
  AgentId, AppConfig, BrowseQuery, BrowseResult, ItemDetail, ModelOption, Overview, PrSummary, SourceStatus, Sprint, StartOptions, StartThreadRequest,
  StartThreadResponse, ThreadSummary, WorkItemSummary,
} from '../../shared/src/api.ts';
import { API_VERSION } from '../../shared/src/api.ts';
import { AdoClient, AdoError, type AdoItem } from './ado/client.ts';
import type { Config } from './config.ts';
import { now, type Db } from './db.ts';
import { buildOverview } from './engine/overview.ts';
import { ItemFacts } from './borgdock/item-facts.ts';
import { applyWalk } from './borgdock/walk.ts';
import type { Notifier } from './push/notifier.ts';
import type { T3Transport } from './t3/client.ts';
import { modelCatalogue, type ModelCatalogue } from './t3/models.ts';
import { T3Fleet, type T3Host } from './t3/fleet.ts';

export class UserError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// T3's plan mode sticks to the thread: its iPhone app sends every later message in plan mode too, so the agent
// stays read-only after you approve. "Plan first" is therefore an instruction, and the thread runs in normal mode.
export const PLAN_FIRST = 'Before changing anything, propose a plan and wait for my go-ahead.';

const PROMPT_TEMPLATE = 'Pick up AB#{id}: {title}\n\nRead the work item with the ado skill first. Work on branch {branch} and open a PR that links AB#{id}.';

const STOP_WORDS = new Set(['the', 'and', 'a', 'an', 'for', 'of', 'to', 'before', 'in', 'on', 'every', 'com', 'is', 'but', 'with']);

/** Same naming the apps preview: feat/ for PBIs, chore/ for Tasks, fix/ otherwise, then id and four title words. */
export function branchName(item: { id: number; type: string; title: string }): string {
  const prefix = item.type === 'PBI' ? 'feat' : item.type === 'Task' ? 'chore' : 'fix';
  const words = item.title.replace(/^Horizon \| /, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP_WORDS.has(w) && !/^\d{4,}$/.test(w));
  return `${prefix}/${item.id}-${words.slice(0, 4).join('-')}`;
}

/** The QA handoff runs the repository's own skills on the item's branch. */
export function qaPrompt(item: { id: number; title: string }, branch: string | null, pr: number | null): string {
  const where = branch
    ? `Work on the item's branch \`${branch}\`: fetch and switch to it first${pr ? ` (PR ${pr})` : ''}.`
    : `Find the item's branch through its PR (\`gh pr list --state all --search "AB#${item.id}"\`), then fetch and switch to it.`;
  return [
    `Bring AB#${item.id} up to date for QA: ${item.title}`,
    where,
    'Use the ado-update-for-qa skill for the handoff: developer notes, QA notes, the PR link and UI proof on both the item and the PR, then the state that fits.',
    'If the PR is already merged and CI is green, finish with /ado-fix so the item moves to Ready For QA.',
    'Report the notes, proof, PR and state transition separately.',
  ].join('\n\n');
}

/** Close without QA: the agent checks the work is finished, writes why QA isn't needed, and moves the item to Done. */
export function donePrompt(item: { id: number; title: string }, branch: string | null, pr: { number: number; state: string } | null): string {
  const context = pr
    ? `Its PR is ${pr.number} (${pr.state})${branch ? ` on \`${branch}\`` : ''}.`
    : `Look for its PR with \`gh pr list --state all --search "AB#${item.id}"\`.`;
  return [
    `Close AB#${item.id} as Done without QA: ${item.title}`,
    `Read the item with the ado-fetch skill and check that the work is really finished. ${context}`,
    "If nothing needs testing by QA, follow the repository's own instructions for writing to ADO: prepend a Developer Notes update that says what was done and why QA isn't needed, add a short comment with the same reason, then move the item to Done, setting any field ADO requires in the same update.",
    'If you find unfinished work, an open PR, or something QA should check, stop and tell me instead of closing it.',
    'Report the notes, the comment and the state change.',
  ].join('\n\n');
}

const toSummary = ({ states: _s, linkedPullRequests: _l, changedAt: _c, ...summary }: AdoItem): WorkItemSummary => summary;

/** The Sprint tab and Today read the sprint on every visit; ADO is asked at most this often. */
const SPRINT_CACHE_MS = 60_000;

/** Owns the live picture: ADO items + T3 threads → overview, and every action that changes either side. */
export class DispatchService extends EventEmitter {
  overview: Overview | null = null;
  readonly ado: AdoClient;
  readonly t3: T3Transport;
  private readonly source: T3Fleet;
  private readonly config: Config;
  private readonly db: Db;
  private readonly notifier: Notifier;
  private items: AdoItem[] = [];
  private adoStatus: SourceStatus = { ok: false, at: null, error: null };
  private adoTimer: NodeJS.Timeout | null = null;
  private recomputeTimer: NodeJS.Timeout | null = null;
  private lastFingerprint = '';
  private syncing: Promise<Overview | null> | null = null;
  /** Notes and newest comments per item, for the states walk. */
  private readonly itemFacts: ItemFacts;
  /** GitHub's pull requests for the walk's checks and approvals; the GitHub service plugs in after it starts. */
  pullRequestsForWalk: () => PrSummary[] = () => [];
  private sprintRead: { at: number; sprint: Promise<Sprint> } | null = null;

  constructor(config: Config, db: Db, notifier: Notifier) {
    super();
    this.config = config;
    this.db = db;
    this.notifier = notifier;
    this.ado = new AdoClient(config.ado);
    this.source = new T3Fleet(config, db);
    this.t3 = this.source.hosts[0].client;
    this.source.on('change', () => this.scheduleRecompute());
    this.itemFacts = new ItemFacts(db, this.ado);
  }

  /** Every T3 host: this Mac, configured remote hosts and the machines connectors bring. */
  get fleet(): T3Fleet {
    return this.source;
  }

  /** Something the walk reads changed (GitHub's pull requests): recompute soon. */
  invalidate() {
    this.scheduleRecompute();
  }

  /** After a write: read T3 and ADO again so the overview catches up. */
  refreshSoon() {
    this.afterWrite();
  }

  /** The models a host can start, with the model and effort the launch sheet preselects. */
  launchChoices(host: T3Host): { models: ModelOption[]; defaultModel: string | null } {
    const { models, defaultModel } = this.modelChoices(host);
    return { models, defaultModel };
  }

  /** Where a thread's agent works: the branch T3 made a worktree for, else its project's title. */
  placeOf(thread: Pick<ThreadSummary, 'id' | 'branch' | 'worktree'>): string {
    const known = this.source.threads.get(thread.id);
    return known?.worktreePath && thread.branch ? thread.branch : thread.worktree;
  }

  start() {
    this.source.start();
    this.refreshAdo();
    this.adoTimer = setInterval(() => this.refreshAdo(), this.config.ado.pollSeconds * 1000);
  }

  stop() {
    this.source.stop();
    if (this.adoTimer) clearInterval(this.adoTimer);
    this.t3.close();
  }

  async refreshAdo() {
    try {
      const mine = await this.ado.myOpenItems();
      const queued = (this.db.prepare('SELECT item_id FROM queue').all() as { item_id: number }[]).map((r) => r.item_id);
      const extra = await this.ado.itemsById(queued.filter((id) => !mine.some((i) => i.id === id)));
      this.items = [...mine, ...extra];
      this.adoStatus = { ok: true, at: now(), error: null };
      this.itemFacts.refresh(this.items).then((changed) => { if (changed) this.scheduleRecompute(); }).catch(() => {});
    } catch (error) {
      this.adoStatus = { ok: false, at: this.adoStatus.at, error: (error as Error).message };
    }
    this.scheduleRecompute();
  }

  /** Pull to refresh: read ADO and T3 again right now and answer with the result. Concurrent pulls share one sync. */
  syncNow(): Promise<Overview | null> {
    this.syncing ??= (async () => {
      await Promise.all([this.refreshAdo(), this.source.poll(true)]);
      if (this.recomputeTimer) clearTimeout(this.recomputeTimer);
      this.recomputeTimer = null;
      this.recompute();
      return this.overview;
    })().finally(() => { this.syncing = null; });
    return this.syncing;
  }

  private scheduleRecompute() {
    if (this.recomputeTimer) return;
    this.recomputeTimer = setTimeout(() => {
      this.recomputeTimer = null;
      this.recompute();
    }, 250);
  }

  private recompute() {
    const queue = new Map((this.db.prepare('SELECT item_id, queued_at FROM queue').all() as { item_id: number; queued_at: string }[]).map((r) => [r.item_id, r.queued_at]));
    const dismissed = new Set((this.db.prepare('SELECT suggestion_id FROM dismissed_suggestions').all() as { suggestion_id: string }[]).map((r) => r.suggestion_id));
    const manualLinks = new Map((this.db.prepare('SELECT thread_id, item_id FROM thread_links').all() as { thread_id: string; item_id: number | null }[]).map((r) => [r.thread_id, r.item_id]));
    // Every project's threads count; only the worktree rack keeps to the M/V/W slots.
    const projects = [...this.source.projects.values()].filter((p) => this.config.worktreePattern.test(p.title));
    const { overview, dequeue } = buildOverview({
      items: this.items,
      threads: [...this.source.threads.values()],
      projects,
      queue,
      dismissed,
      manualLinks,
      worktreePattern: this.config.worktreePattern,
      threadLink: (id) => this.threadLink(id),
      sources: { ado: this.adoStatus, t3: this.source.status, environments: this.source.environments },
    });
    for (const workspace of overview.worktrees) {
      const host = this.source.hostFor(workspace.id!);
      const choices = this.modelChoices(host);
      workspace.models = choices.models;
      workspace.defaultModel = choices.defaultModel;
    }
    for (const id of dequeue) this.db.prepare('DELETE FROM queue WHERE item_id = ?').run(id);
    applyWalk(overview, { items: this.items, facts: this.itemFacts.facts, pullRequests: this.pullRequestsForWalk(), placeOf: (t) => this.placeOf(t), now: new Date() });

    const { generatedAt: _at, ...comparable } = overview;
    const fingerprint = JSON.stringify(comparable);
    if (fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;
    this.overview = overview;
    this.emit('overview', overview);
    if (this.adoStatus.ok && this.source.environments.some((e) => e.ok)) this.notifier.process(overview).catch(() => {});
  }

  threadLink(threadId: string) {
    const host = this.source.hostFor(threadId);
    const rawId = this.source.rawId(threadId);
    return {
      link: `${host.config.webBase}/${encodeURIComponent(rawId)}`,
      appLink: `t3code://threads/${encodeURIComponent(host.config.environmentId)}/${encodeURIComponent(rawId)}`,
    };
  }

  /* ---------- models ---------- */

  private catalogue(host = this.source.hosts[0]): ModelCatalogue {
    if (host.providers.length || host !== this.source.hosts[0]) return this.source.catalogue(host);
    return modelCatalogue(join(dirname(this.config.t3.stateDb), 'model-manifest.json'), [...this.source.threads.values()]);
  }

  private preference<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  private remember(key: string, value: unknown) {
    this.db.prepare('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  }

  /** Models with the reasoning level the start sheet should preselect, plus the model to preselect. */
  private modelChoices(host = this.source.hosts[0]): { models: ModelOption[]; defaultModel: string | null; catalogue: ModelCatalogue } {
    const catalogue = this.catalogue(host);
    const remembered = this.preference<Record<string, string>>('start.effort') ?? {};
    const models = catalogue.models.map((m) => {
      const valid = (e: string | null | undefined) => (e && m.efforts.some((x) => x.id === e) ? e : null);
      return { ...m, defaultEffort: valid(remembered[m.id]) ?? valid(catalogue.recentEffort.get(m.id)) ?? valid(m.defaultEffort) };
    });
    const last = this.preference<string>('start.model');
    const defaultModel = models.some((m) => m.id === last) ? last : catalogue.fallbackModel;
    return { models, defaultModel, catalogue };
  }

  // Older app builds only know "codex" or "claude": use your most-used model of that kind.
  private legacyModel(agent: AgentId | undefined, models: ModelOption[], fallback: string | null): string | null {
    if (!agent) return null;
    const provider = agent === 'claude' ? 'Claude' : 'Codex';
    return (models.find((m) => m.provider === provider && m.recent) ?? models.find((m) => m.provider === provider))?.id ?? fallback;
  }

  async appConfig(): Promise<AppConfig> {
    const user = await this.ado.me().catch(() => ({ name: 'You', email: '' }));
    const { models, defaultModel } = this.modelChoices();
    const legacy = (agent: AgentId) => {
      const id = this.legacyModel(agent, models, defaultModel);
      return { id: agent, label: models.find((m) => m.id === id)?.label ?? agent };
    };
    return {
      apiVersion: API_VERSION,
      user,
      models,
      defaultModel,
      agents: [legacy('codex'), legacy('claude')],
      defaultAgent: models.find((m) => m.id === defaultModel)?.provider === 'Claude' ? 'claude' : 'codex',
      worktrees: (this.overview?.worktrees ?? []).map((w) => w.name),
      promptTemplate: PROMPT_TEMPLATE,
      vapidPublicKey: this.notifier.vapidPublicKey,
    };
  }

  /* ---------- actions ---------- */

  async startThread(request: StartThreadRequest): Promise<StartThreadResponse> {
    if (!Number.isInteger(request.itemId)) throw new UserError('itemId must be a work item number');
    const candidates = [...this.source.projects.values()].filter((p) => p.id === request.worktree || p.title === request.worktree);
    if (candidates.length !== 1) throw new UserError(candidates.length ? 'That worktree name exists on multiple hosts. Reload and select its host.' : `T3 has no project called ${request.worktree}`);
    const project = candidates[0];
    if (!this.config.worktreePattern.test(project.title)) throw new UserError('Select an M, V or W worktree');
    const host = this.source.hostFor(project.id);
    this.requireOnline(host);
    const { models, defaultModel, catalogue } = this.modelChoices(host);
    const modelId = request.model ?? this.legacyModel(request.agent, models, defaultModel) ?? defaultModel;
    const model = models.find((m) => m.id === modelId);
    if (!model) throw new UserError(`T3 can't start ${modelId ?? 'that model'}. Pick another model.`);
    const effort = request.effort ?? model.defaultEffort;
    if (effort && !model.efforts.some((e) => e.id === effort)) throw new UserError(`${model.label} has no ${effort} reasoning level.`);
    const modelSelection = catalogue.selection(model.id, effort);
    const written = String(request.prompt ?? '').trim();
    if (!written) throw new UserError('The first message is empty');
    if (written.length > 20_000) throw new UserError('The first message is longer than 20,000 characters');
    if (!['plan', 'default', 'qa', 'done'].includes(request.mode)) throw new UserError('mode must be plan, default, qa or done');
    const prompt = request.mode === 'plan' && !written.includes(PLAN_FIRST) ? `${written}\n\n${PLAN_FIRST}` : written;

    const worktree = this.overview?.worktrees.find((w) => w.id === project.id || (!w.id && w.name === project.title));
    if (worktree && worktree.state !== 'free') throw new UserError(`${request.worktree} already has an open thread. Settle it or pick another worktree.`, 409);

    const known = this.items.find((i) => i.id === request.itemId);
    const title = known?.title ?? (await this.ado.item(request.itemId)).item.title;
    const threadId = randomUUID();
    const createdAt = now();
    const thread = {
      projectId: this.source.rawId(project.id),
      title: `AB#${request.itemId} ${title}`.slice(0, 120),
      modelSelection,
      runtimeMode: 'full-access',
      interactionMode: 'default',
      branch: null,
      worktreePath: null,
      createdAt,
    };
    await host.client.dispatch({
      type: 'thread.turn.start',
      threadId,
      message: { messageId: randomUUID(), role: 'user', text: prompt, attachments: [] },
      modelSelection,
      runtimeMode: thread.runtimeMode,
      interactionMode: thread.interactionMode,
      bootstrap: { createThread: thread },
      createdAt,
    });
    this.db.prepare('INSERT OR REPLACE INTO thread_links (thread_id, item_id, linked_at) VALUES (?, ?, ?)').run(`${host.prefix}${threadId}`, request.itemId, now());
    this.remember('start.model', model.id);
    if (effort) this.remember('start.effort', { ...(this.preference<Record<string, string>>('start.effort') ?? {}), [model.id]: effort });

    // The thread is running at this point; ADO steps that fail are reported, not rolled back.
    const warnings: string[] = [];
    let adoState: string | null = null;
    if (request.assignToMe) await this.ado.assignToMe(request.itemId).catch((e) => warnings.push(`Not assigned to you: ${e.message}`));
    if (request.moveAdoTo) adoState = await this.ado.moveState(request.itemId, request.moveAdoTo).catch((e) => (warnings.push(`ADO state not changed: ${e.message}`), null));
    this.afterWrite();
    return { threadId: `${host.prefix}${threadId}`, ...this.threadLink(`${host.prefix}${threadId}`), adoState, warning: warnings.join(' ') || null };
  }

  async answer(threadId: string, requestId: string, answers: Record<string, string | string[]>) {
    const thread = this.source.threads.get(threadId);
    if (!thread) throw new UserError('Unknown thread', 404);
    if (thread.questionRequestId !== requestId) throw new UserError('The agent has moved on from that question. Reload to see the current one.', 409);
    const known = new Set(thread.questions.map((q) => q.id));
    const clean = Object.fromEntries(Object.entries(answers ?? {}).filter(([id, value]) => known.has(id) && (typeof value === 'string' ? value.trim() : value.length)));
    if (Object.keys(clean).length !== known.size) throw new UserError('Answer every question first.');
    const host = this.source.hostFor(threadId);
    this.requireOnline(host);
    await host.client.dispatch({ type: 'thread.user-input.respond', threadId: this.source.rawId(threadId), requestId, answers: clean, createdAt: now() });
    this.afterWrite();
  }

  async settle(threadId: string) {
    if (!this.source.threads.has(threadId)) throw new UserError('Unknown thread', 404);
    const host = this.source.hostFor(threadId);
    this.requireOnline(host);
    await host.client.dispatch({ type: 'thread.settle', threadId: this.source.rawId(threadId) });
    this.afterWrite();
  }

  async moveState(itemId: number, to: string): Promise<string> {
    if (!to?.trim()) throw new UserError('Pick a state');
    const known = this.items.find((i) => i.id === itemId);
    if (known && !known.states.some((s) => s.name === to)) throw new UserError(`${to} is not a state of this ${known.typeName}`);
    try {
      const state = await this.ado.moveState(itemId, to);
      this.afterWrite();
      return state;
    } catch (error) {
      // TF401320: the team's workflow needs fields filled before this transition.
      if (error instanceof AdoError && /TF401320/.test(error.message)) {
        throw new UserError(`ADO won't move it yet: ${error.message.replace(/^TF401320: /, '')} Start it with "Update for QA" and the agent fills it in.`);
      }
      throw error;
    }
  }

  async startOptions(itemId: number): Promise<StartOptions> {
    const entry = this.overview?.items.find((o) => o.item.id === itemId);
    const item = entry?.item ?? (await this.ado.item(itemId)).item;
    // A thread's branch is whatever its worktree had checked out; only the PR's branch, or a branch naming the item, is the item's.
    const namesItem = (b: string | null | undefined) => (b && new RegExp(`(^|/)(AB)?${itemId}(\\b|[-_])`, 'i').test(b) ? b : null);
    const branch = entry?.pullRequest?.branch ?? entry?.threads.map((t) => namesItem(t.branch)).find(Boolean) ?? null;
    const last = entry?.threads[0];
    const free = this.overview?.worktrees.find((w) => w.name === last?.worktree && (!last?.environmentId || w.environmentId === last.environmentId) && w.state === 'free' && w.available !== false);
    return {
      prompts: {
        pickup: PROMPT_TEMPLATE.replaceAll('{id}', String(item.id)).replaceAll('{title}', item.title).replaceAll('{branch}', branchName(item)),
        qa: qaPrompt(item, branch, entry?.pullRequest?.number ?? null),
        done: donePrompt(item, branch, entry?.pullRequest ? { number: entry.pullRequest.number, state: entry.pullRequest.state } : null),
      },
      branch,
      qaWorktree: free ? free.name : null,
      qaWorkspaceId: free?.id ?? null,
    };
  }

  dismissSuggestion(itemId: number) {
    const suggestion = this.overview?.items.find((o) => o.item.id === itemId)?.suggestion;
    if (!suggestion) throw new UserError('There is no suggestion for this item', 404);
    this.db.prepare('INSERT OR REPLACE INTO dismissed_suggestions (suggestion_id, item_id, dismissed_at) VALUES (?, ?, ?)').run(suggestion.id, itemId, now());
    this.scheduleRecompute();
  }

  queue(itemId: number) {
    if (!Number.isInteger(itemId) || itemId <= 0) throw new UserError('itemId must be a work item number');
    this.db.prepare('INSERT OR IGNORE INTO queue (item_id, queued_at) VALUES (?, ?)').run(itemId, now());
    if (this.items.some((i) => i.id === itemId)) this.scheduleRecompute();
    else this.refreshAdo();
  }

  unqueue(itemId: number) {
    this.db.prepare('DELETE FROM queue WHERE item_id = ?').run(itemId);
    this.scheduleRecompute();
  }

  linkThread(threadId: string, itemId: number | null) {
    if (!this.source.threads.has(threadId)) throw new UserError('Unknown thread', 404);
    this.db.prepare('INSERT OR REPLACE INTO thread_links (thread_id, item_id, linked_at) VALUES (?, ?, ?)').run(threadId, itemId, now());
    this.scheduleRecompute();
  }

  private requireOnline(host: T3Host) {
    if (!host.source.status.ok) throw new UserError(`${host.config.label} is offline. Refresh before trying again.`, 503);
  }

  private afterWrite() {
    this.source.poll(true);
    this.refreshAdo();
  }

  /* ---------- ADO reads ---------- */

  async itemDetail(id: number): Promise<ItemDetail> {
    return this.ado.item(id).then((detail) => ({ ...detail, item: toSummary(detail.item as AdoItem) }));
  }

  queries(): Promise<BrowseQuery[]> {
    return this.ado.queries();
  }

  async browse(query: string | null, search: string | null): Promise<BrowseResult> {
    if (search?.trim()) return { items: (await this.ado.search(search)).map(toSummary), truncated: false };
    const result = await this.ado.runQuery(query ?? 'sprint');
    return { items: result.items.map(toSummary), truncated: result.truncated };
  }

  /** The current sprint, read again once the last read is a minute old. A failed read is never kept. */
  sprint(): Promise<Sprint> {
    if (this.sprintRead && Date.now() - this.sprintRead.at < SPRINT_CACHE_MS) return this.sprintRead.sprint;
    const sprint = this.ado.currentSprint().then(({ items, ...iteration }) => ({
      ...iteration,
      items: items.map(({ stateChangedAt, finishedAt, ...item }) => ({ ...toSummary(item), stateChangedAt, finishedAt })),
      generatedAt: now(),
    }));
    const read = { at: Date.now(), sprint };
    this.sprintRead = read;
    sprint.catch(() => { if (this.sprintRead === read) this.sprintRead = null; });
    return sprint;
  }
}
