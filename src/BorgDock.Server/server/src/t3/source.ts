import { EventEmitter } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import type { AgentQuestion, PullRequestState, SourceStatus, ThreadStatus } from '../../../shared/src/api.ts';
import type { Db } from '../db.ts';
import { threadPath, type T3Transport } from './client.ts';

export type T3PullRequest = { number: number; url: string; state: PullRequestState; title: string; headBranch: string | null; isDraft: boolean; checks: string | null };

export type T3Thread = {
  id: string;
  environmentId?: string;
  environmentLabel?: string;
  available?: boolean;
  projectId: string;
  worktree: string;
  title: string;
  branch: string | null;
  createdAt: string;
  lastActivityAt: string;
  open: boolean;
  status: ThreadStatus;
  model: string;
  modelInstance: string | null;
  effort: string | null;
  pullRequests: T3PullRequest[];
  firstUserMessage: string;
  questionRequestId: string | null;
  questions: AgentQuestion[];
  lastAgentMessage: string | null;
  /** The checkout T3 made for this thread; null when it works in its project's own checkout. */
  worktreePath?: string | null;
  interactionMode?: string | null;
  runtimeMode?: string | null;
};

export type T3Repository = { key: string; displayName: string };
export type T3Project = {
  id: string; title: string; environmentId?: string; environmentLabel?: string; available?: boolean;
  workspaceRoot?: string | null; repository?: T3Repository | null;
};

type ShellPr = { number: number; url: string; snapshot?: { state?: string; title?: string; headBranch?: string; isDraft?: boolean; checksState?: string; mergedAt?: string } | null };
export type ShellThread = {
  id: string; projectId: string; title: string; branch: string | null;
  modelSelection?: { instanceId?: string; model?: string; options?: { id: string; value: unknown }[] } | null;
  pullRequests?: ShellPr[]; branchPullRequest?: { number: number; url: string } | null;
  latestTurn?: { state?: string; requestedAt?: string; startedAt?: string; completedAt?: string } | null;
  createdAt: string; updatedAt: string; archivedAt: string | null; settledAt: string | null;
  worktreePath?: string | null; interactionMode?: string | null; runtimeMode?: string | null;
  lineage?: { parentThreadId?: string | null; relationshipToParent?: string | null; rootThreadId?: string | null } | null;
  session?: { status?: string } | null; latestUserMessageAt?: string | null;
  hasPendingApprovals?: boolean; hasPendingUserInput?: boolean; hasActionableProposedPlan?: boolean;
  backgroundLiveness?: 'working' | 'monitoring' | null;
  status?: string; activityRunStatus?: string | null;
  latestRunRequestedAt?: string | null; latestRunCompletedAt?: string | null;
  pendingRuntimeRequest?: { id?: string; kind: string } | null;
  latestVisibleMessage?: { role: string; text: string } | null;
  pendingBackgroundTasks?: { taskId: string; kind?: string }[];
};
export type ShellProject = {
  id: string; title: string; workspaceRoot?: string | null;
  repositoryIdentity?: { canonicalKey?: string; displayName?: string; owner?: string; name?: string } | null;
};
export type Shell = { schemaVersion?: number; snapshotSequence: number; projects: ShellProject[]; threads: ShellThread[] };
type Detail = {
  thread?: { messages?: { role: string; text: string; createdAt: string }[]; activities?: { kind: string; payload: any; createdAt: string }[] };
  projection?: {
    messages: { role: string; text: string; createdAt: string }[];
    runtimeRequests: { id: string; kind: string; status: string }[];
    turnItems: { type: string; requestId?: string; questions?: any[] }[];
  };
};

const RECOMMENDED = /\s*\(Recommended\)\s*$/i;
const RECENT_DAYS = 60;

function prState(snapshot: ShellPr['snapshot']): PullRequestState {
  if (!snapshot) return 'unknown';
  if (snapshot.mergedAt || snapshot.state === 'merged') return 'merged';
  return snapshot.state === 'open' ? 'open' : snapshot.state === 'closed' ? 'closed' : 'unknown';
}

/**
 * The agent needs you only when it waits for input or approval, or has stopped (done, a plan to approve, an error).
 * Anything T3 shows as working counts as working, including background work after a finished turn:
 * a plan-mode thread that is implementing keeps its "actionable plan" flag while it works.
 */
export function statusOf(t: ShellThread): ThreadStatus {
  if (t.archivedAt || t.settledAt) return 'settled';
  // Subagents never settle and report their checkout's branch, not their own: they count as done.
  if (t.lineage?.relationshipToParent === 'subagent') return 'settled';
  if (t.pendingRuntimeRequest?.kind === 'user_input') return 'question';
  if (t.pendingRuntimeRequest) return 'approval';
  if (t.hasPendingApprovals) return 'approval';
  if (t.hasPendingUserInput) return 'question';
  const session = t.session?.status;
  if (session === 'running' || session === 'starting' || t.latestTurn?.state === 'running') return 'running';
  if (['preparing', 'queued', 'starting', 'running', 'waiting'].includes(t.activityRunStatus ?? t.status ?? '')) return 'running';
  if (t.status === 'failed') return 'failed';
  if (session === 'error' || t.latestTurn?.state === 'error' || t.latestTurn?.state === 'failed') return 'failed';
  if (t.backgroundLiveness === 'working' || t.backgroundLiveness === 'monitoring' || t.pendingBackgroundTasks?.length) return 'running';
  if (t.hasActionableProposedPlan) return 'plan';
  return 'your-turn';
}

const latest = (...dates: (string | null | undefined)[]) => dates.filter((d): d is string => Boolean(d)).sort().pop()!;

export function parseQuestions(payload: any): AgentQuestion[] {
  return (payload?.questions ?? []).map((q: any): AgentQuestion => {
    const options: { label: string; value: string; description?: string }[] = (q.options ?? []).map((o: any) => ({
      label: String(o.label), value: String(o.value ?? o.label), ...(o.description ? { description: String(o.description) } : {}),
    }));
    const labels = options.map((o) => o.label);
    const recommended = labels.findIndex((l) => RECOMMENDED.test(l));
    return {
      id: String(q.id),
      question: String(q.question ?? ''),
      options: options.map((o) => ({ ...o, label: o.label.replace(RECOMMENDED, '') })),
      recommended: recommended === -1 ? null : recommended,
      allowCustomAnswer: q.allowCustomAnswer !== false,
      multiSelect: Boolean(q.multiSelect),
    };
  });
}

/** Keeps an up-to-date picture of T3: polls the shell, fetches detail for open threads that changed. */
export class T3Source extends EventEmitter {
  threads = new Map<string, T3Thread>();
  projects = new Map<string, T3Project>();
  status: SourceStatus = { ok: false, at: null, error: null };

  private client: T3Transport;
  private readonly db: Db;
  private readonly stateDb: string;
  private lastSequence = -1;
  private protocolV2 = false;
  private detailVersion = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private readonly cacheKey?: string;
  private readonly messagePrefix: string;

  constructor(options: { client: T3Transport; db: Db; stateDb: string; cacheKey?: string; messagePrefix?: string }) {
    super();
    this.client = options.client;
    this.db = options.db;
    this.stateDb = options.stateDb;
    this.cacheKey = options.cacheKey;
    this.messagePrefix = options.messagePrefix ?? '';
    if (this.cacheKey) {
      const row = this.db.prepare('SELECT snapshot, synced_at FROM t3_snapshots WHERE source_id = ?').get(this.cacheKey) as { snapshot: string; synced_at: string } | undefined;
      if (row) {
        const cached = JSON.parse(row.snapshot);
        this.threads = new Map(cached.threads.map((t: T3Thread) => [t.id, t]));
        this.projects = new Map(cached.projects.map((p: T3Project) => [p.id, p]));
        this.status.at = row.synced_at;
      }
    }
  }

  /** A connector that reconnects brings a new transport for the same host. */
  useClient(client: T3Transport) {
    this.client = client;
  }

  start(intervalSeconds: number) {
    this.poll();
    this.timer = setInterval(() => this.poll(), intervalSeconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Regular polls skip when one is already running. A forced poll (someone pulled to refresh) waits for it,
   * then reads everything again, including the detail of every open thread.
   */
  async poll(force = false): Promise<void> {
    if (this.inFlight) {
      if (!force) return;
      await this.inFlight.catch(() => {});
    }
    if (force) this.detailVersion.clear();
    this.inFlight = this.readShell(force);
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async readShell(force: boolean) {
    try {
      const wasOffline = !this.status.ok;
      const shell = await this.client.get<Shell>('/api/orchestration/shell');
      this.protocolV2 = (shell.schemaVersion ?? 1) >= 2;
      this.status = { ok: true, at: new Date().toISOString(), error: null };
      if (shell.snapshotSequence !== this.lastSequence || force || wasOffline) {
        await this.apply(shell);
        this.lastSequence = shell.snapshotSequence;
        this.status = { ok: true, at: new Date().toISOString(), error: null };
        if (this.cacheKey) this.db.prepare('INSERT OR REPLACE INTO t3_snapshots VALUES (?, ?, ?)').run(this.cacheKey, JSON.stringify({ threads: [...this.threads.values()], projects: [...this.projects.values()] }), this.status.at);
        this.emit('change');
      }
      this.status = { ok: true, at: new Date().toISOString(), error: null };
    } catch (error) {
      this.status = { ok: false, at: this.status.at, error: (error as Error).message };
      this.emit('change');
    }
  }

  private async apply(shell: Shell) {
    this.projects = new Map(shell.projects.map((p) => [p.id, { id: p.id, title: p.title, workspaceRoot: p.workspaceRoot ?? null, repository: repositoryOf(p) }]));
    const cutoff = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
    const relevant = shell.threads.filter((t) => t.updatedAt >= cutoff || (!t.archivedAt && !t.settledAt));
    const firstMessages = this.firstUserMessages(relevant.map((t) => t.id));

    const next = new Map<string, T3Thread>();
    for (const t of relevant) {
      const previous = this.threads.get(t.id);
      const status = statusOf(t);
      const thread: T3Thread = {
        id: t.id,
        projectId: t.projectId,
        worktree: this.projects.get(t.projectId)?.title ?? 'unknown',
        title: t.title,
        branch: t.branch,
        createdAt: t.createdAt,
        lastActivityAt: latest(t.createdAt, t.latestUserMessageAt, t.latestTurn?.requestedAt, t.latestTurn?.completedAt, t.latestRunRequestedAt, t.latestRunCompletedAt),
        open: status !== 'settled',
        status,
        model: t.modelSelection?.model ?? 'unknown',
        modelInstance: t.modelSelection?.instanceId ?? null,
        effort: (t.modelSelection?.options?.find((o) => o.id === 'reasoningEffort' || o.id === 'effort')?.value as string | undefined) ?? null,
        pullRequests: pullRequestsOf(t),
        firstUserMessage: firstMessages.get(t.id) ?? '',
        questionRequestId: previous?.questionRequestId ?? null,
        questions: previous?.questions ?? [],
        lastAgentMessage: t.latestVisibleMessage?.role === 'assistant' ? t.latestVisibleMessage.text.trim().slice(0, 1200) : previous?.lastAgentMessage ?? null,
        worktreePath: t.worktreePath ?? null,
        interactionMode: t.interactionMode ?? null,
        runtimeMode: t.runtimeMode ?? null,
      };
      next.set(t.id, thread);
    }
    this.threads = next;

    // A PR known only through a thread's branch has no snapshot; another thread may have one.
    const known = new Map<number, T3PullRequest>();
    for (const t of next.values()) for (const pr of t.pullRequests) if (pr.state !== 'unknown') known.set(pr.number, pr);
    for (const t of next.values()) {
      t.pullRequests = t.pullRequests.map((pr) => (pr.state === 'unknown' && known.has(pr.number) ? { ...known.get(pr.number)!, headBranch: pr.headBranch ?? known.get(pr.number)!.headBranch } : pr));
    }
    this.emit('change');

    // Detail (questions, latest agent message) only for open threads whose turn moved on.
    const stale = [...next.values()].filter((t) => !t.firstUserMessage || (t.open && this.detailVersion.get(t.id) !== `${t.lastActivityAt}|${t.status}`));
    for (let i = 0; i < stale.length; i += 4) await Promise.all(stale.slice(i, i + 4).map((t) => this.loadDetail(t)));
  }

  private async loadDetail(thread: T3Thread) {
    try {
      const detail = await this.client.get<Detail>(`${threadPath(thread.id)}${this.protocolV2 ? (thread.firstUserMessage ? '/bounded' : '') : '?turnLimit=1'}`);
      const messages = detail.projection?.messages ?? detail.thread?.messages ?? [];
      if (!thread.firstUserMessage) {
        const first = messages.find((m) => m.role === 'user' && m.text?.trim());
        if (first) {
          thread.firstUserMessage = first.text.slice(0, 4000);
          this.db.prepare('INSERT OR REPLACE INTO first_messages VALUES (?, ?)').run(this.messageKey(thread.id), thread.firstUserMessage);
        }
      }
      const activities = detail.thread?.activities ?? [];
      const agentMessage = [...messages].reverse().find((m) => m.role === 'assistant' && m.text?.trim());
      thread.lastAgentMessage = agentMessage ? agentMessage.text.trim().slice(0, 1200) : null;
      thread.questions = [];
      thread.questionRequestId = null;
      if (thread.status === 'question') {
        const pending = detail.projection?.runtimeRequests.find((r) => r.kind === 'user_input' && r.status === 'pending');
        const item = pending && detail.projection?.turnItems.find((i) => i.type === 'user_input_request' && i.requestId === pending.id);
        if (pending && item) {
          thread.questionRequestId = pending.id;
          thread.questions = parseQuestions(item);
        }
        const resolved = new Set(activities.filter((a) => a.kind === 'user-input.resolved').map((a) => a.payload?.requestId));
        const request = [...activities].reverse().find((a) => a.kind === 'user-input.requested' && !resolved.has(a.payload?.requestId));
        if (request) {
          thread.questionRequestId = String(request.payload.requestId);
          thread.questions = parseQuestions(request.payload);
        }
      }
      this.detailVersion.set(thread.id, `${thread.lastActivityAt}|${thread.status}`);
    } catch {
      // Keep the previous detail; the next poll retries.
    }
  }

  // The first message is the most reliable place for "pick up 59541"; T3's HTTP API only pages
  // backwards from the newest turn, so read it once from T3's own database and cache it.
  private firstUserMessages(threadIds: string[]): Map<string, string> {
    const cached = new Map<string, string>();
    const select = this.db.prepare('SELECT text FROM first_messages WHERE thread_id = ?');
    const missing: string[] = [];
    for (const id of threadIds) {
      const row = select.get(this.messageKey(id)) as { text: string } | undefined;
      if (row) cached.set(id, row.text);
      else missing.push(id);
    }
    if (!missing.length || !this.stateDb) return cached;
    try {
      const t3db = new DatabaseSync(this.stateDb, { readOnly: true });
      try {
        const query = t3db.prepare(this.protocolV2
          ? `SELECT json_extract(payload_json, '$.text') AS text FROM orchestration_v2_projection_messages WHERE thread_id = ? AND role = 'user' ORDER BY created_at LIMIT 1`
          : `SELECT text FROM projection_thread_messages WHERE thread_id = ? AND role = 'user' ORDER BY created_at LIMIT 1`);
        const insert = this.db.prepare('INSERT OR REPLACE INTO first_messages (thread_id, text) VALUES (?, ?)');
        for (const id of missing) {
          const row = query.get(id) as { text: string } | undefined;
          if (!row) continue;
          const text = row.text.slice(0, 4000);
          insert.run(this.messageKey(id), text);
          cached.set(id, text);
        }
      } finally {
        t3db.close();
      }
    } catch {
      // T3's schema is internal; without it, linking falls back to titles, branches and PRs.
    }
    return cached;
  }

  private messageKey(id: string): string { return `${this.messagePrefix}${id}`; }
}

export function repositoryOf(project: ShellProject): T3Repository | null {
  const identity = project.repositoryIdentity;
  const key = identity?.canonicalKey?.trim();
  if (!key) return null;
  const displayName = identity?.displayName?.trim() || (identity?.owner && identity?.name ? `${identity.owner}/${identity.name}` : key);
  return { key, displayName };
}

function pullRequestsOf(t: ShellThread): T3PullRequest[] {
  const prs: T3PullRequest[] = (t.pullRequests ?? []).map((p) => ({
    number: p.number,
    url: p.url,
    state: prState(p.snapshot),
    title: p.snapshot?.title ?? '',
    headBranch: p.snapshot?.headBranch ?? null,
    isDraft: Boolean(p.snapshot?.isDraft),
    checks: p.snapshot?.checksState ?? null,
  }));
  const branchPr = t.branchPullRequest;
  if (branchPr && !prs.some((p) => p.number === branchPr.number)) {
    prs.push({ number: branchPr.number, url: branchPr.url, state: 'unknown', title: '', headBranch: t.branch, isDraft: false, checks: null });
  }
  return prs;
}
