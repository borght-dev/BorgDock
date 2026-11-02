import type { AgentActivityState, ChecksActivityState, LiveActivityRegistration, PrSummary, ThreadStatus } from '../../../shared/src/api.ts';
import { now, type Db } from '../db.ts';
import { migratePlatform } from '../borgdock/schema.ts';
import type { PushSender } from './borgdock.ts';

/** The ActivityKit attribute types the app declares; push-to-start names them. */
export const AGENT_ATTRIBUTES_TYPE = 'AgentActivityAttributes';

/** `machine` is the T3 host's label; the app's AgentActivityAttributes decodes threadId, itemId, title and machine. */
export type LiveThread = { id: string; title: string; place: string; machine: string; itemId: number | null; status: ThreadStatus; createdAt: string };

const TOKEN = /^[0-9a-f]{32,400}$/i;
/** Only devices still signed in get Live Activity pushes: a revoked or expired session's tokens are skipped. */
const ACTIVE_SESSION = `JOIN sessions s ON s.id = a.session_id AND s.revoked_at IS NULL AND s.expires_at > ?`;
const ENDED_STAY_MS = 15 * 60_000;

/** The agent's run as the Live Activity shows it. */
export function agentState(thread: LiveThread): AgentActivityState {
  const startedAt = thread.createdAt;
  switch (thread.status) {
    case 'running': return { step: 'Working', stepIndex: 1, stepCount: 3, status: 'running', startedAt };
    case 'question': return { step: 'Asks you something', stepIndex: 2, stepCount: 3, status: 'waiting', startedAt };
    case 'plan': return { step: 'Plan ready to review', stepIndex: 2, stepCount: 3, status: 'waiting', startedAt };
    case 'approval': return { step: 'Needs approval', stepIndex: 2, stepCount: 3, status: 'waiting', startedAt };
    case 'failed': return { step: 'Stopped with an error', stepIndex: 3, stepCount: 3, status: 'failed', startedAt };
    default: return { step: 'Done', stepIndex: 3, stepCount: 3, status: 'done', startedAt };
  }
}

export function checksState(pr: PrSummary): ChecksActivityState {
  return { passed: pr.checks.passed, failed: pr.checks.failed, pending: pr.checks.pending, total: pr.checks.total };
}

/**
 * Live Activity updates over APNs (topic `<bundleId>.push-type.liveactivity`): agent runs and pull request checks
 * the app registered, and push-to-start for a thread you launched from BorgDock once its agent runs.
 */
export class LiveActivities {
  private readonly db: Db;
  private readonly sender: () => PushSender | null;
  private readonly environment: () => 'production' | 'sandbox';

  constructor(db: Db, sender: () => PushSender | null, environment: () => 'production' | 'sandbox') {
    this.db = db;
    this.sender = sender;
    this.environment = environment;
    migratePlatform(db);
  }

  register(sessionId: string, registration: LiveActivityRegistration): void {
    if (!TOKEN.test(registration.pushToken ?? '')) throw new Error('Invalid push token');
    const subject = registration.kind === 'agent' ? String(registration.threadId ?? '') : registration.kind === 'checks' ? String(registration.prKey ?? '') : '';
    if (!subject) throw new Error('Name the thread or pull request');
    this.db.prepare('INSERT OR REPLACE INTO bd_live_activities (token, session_id, kind, subject, last_state, created_at) VALUES (?, ?, ?, ?, NULL, ?)')
      .run(registration.pushToken, sessionId, registration.kind, subject, now());
    // The phone started this agent's activity itself (right after launching), so push-to-start must not add a second.
    if (registration.kind === 'agent') this.db.prepare('UPDATE bd_launched SET activity_started = 1 WHERE thread_id = ?').run(subject);
  }

  unregister(token: string): boolean {
    return this.db.prepare('DELETE FROM bd_live_activities WHERE token = ?').run(token).changes > 0;
  }

  /** One push-to-start token per device; a new one replaces the old. */
  registerStartToken(sessionId: string, token: string) {
    if (!TOKEN.test(token ?? '')) throw new Error('Invalid push token');
    this.db.prepare('DELETE FROM bd_push_to_start WHERE session_id = ?').run(sessionId);
    this.db.prepare('INSERT OR REPLACE INTO bd_push_to_start (token, session_id, created_at) VALUES (?, ?, ?)').run(token, sessionId, now());
  }

  /** A thread launched from BorgDock: its device gets a Live Activity when the agent starts running. */
  launched(threadId: string, sessionId: string) {
    this.db.prepare('INSERT OR IGNORE INTO bd_launched (thread_id, session_id, at) VALUES (?, ?, ?)').run(threadId, sessionId, now());
  }

  launchedThreads(): Set<string> {
    return new Set((this.db.prepare('SELECT thread_id FROM bd_launched').all() as { thread_id: string }[]).map((r) => r.thread_id));
  }

  private async send(token: string, payload: Record<string, unknown>): Promise<boolean> {
    const sender = this.sender();
    if (!sender) return false;
    const result = await sender.push(token, this.environment(), { pushType: 'liveactivity', priority: 10, payload });
    if (result === 'gone') {
      this.db.prepare('DELETE FROM bd_live_activities WHERE token = ?').run(token);
      this.db.prepare('DELETE FROM bd_push_to_start WHERE token = ?').run(token);
    }
    return result === 'sent';
  }

  /** After the overview changed: update agent activities whose run moved on, end finished ones, start new ones. */
  async threadsChanged(threads: Map<string, LiveThread>, nowMs = Date.now()): Promise<number> {
    let pushes = 0;
    const timestamp = Math.floor(nowMs / 1000);
    const rows = this.db.prepare(`SELECT a.token, a.subject, a.last_state FROM bd_live_activities a ${ACTIVE_SESSION} WHERE a.kind = 'agent'`).all(now()) as { token: string; subject: string; last_state: string | null }[];
    for (const row of rows) {
      const thread = threads.get(row.subject);
      if (!thread) continue;
      const state = agentState(thread);
      const fingerprint = JSON.stringify(state);
      if (fingerprint === row.last_state) continue;
      const ended = state.status === 'done' || state.status === 'failed';
      const aps: Record<string, unknown> = { timestamp, event: ended ? 'end' : 'update', 'content-state': state };
      if (ended) aps['dismissal-date'] = Math.floor((nowMs + ENDED_STAY_MS) / 1000);
      if (state.status === 'waiting') aps.alert = { title: thread.title, body: state.step };
      if (await this.send(row.token, { aps })) pushes += 1;
      if (ended) this.db.prepare('DELETE FROM bd_live_activities WHERE token = ?').run(row.token);
      else this.db.prepare('UPDATE bd_live_activities SET last_state = ? WHERE token = ?').run(fingerprint, row.token);
    }

    const waiting = this.db.prepare(`SELECT l.thread_id, a.token FROM bd_launched l JOIN bd_push_to_start a ON a.session_id = l.session_id ${ACTIVE_SESSION} WHERE l.activity_started = 0`)
      .all(now()) as { thread_id: string; token: string }[];
    for (const { thread_id: threadId, token } of waiting) {
      const thread = threads.get(threadId);
      if (!thread || thread.status !== 'running') continue;
      this.db.prepare('UPDATE bd_launched SET activity_started = 1 WHERE thread_id = ?').run(threadId);
      const sent = await this.send(token, {
        aps: {
          timestamp,
          event: 'start',
          'content-state': agentState(thread),
          'attributes-type': AGENT_ATTRIBUTES_TYPE,
          attributes: { threadId: thread.id, title: thread.title, machine: thread.machine, itemId: thread.itemId },
          alert: { title: thread.title, body: `The agent started in ${thread.place}` },
        },
      });
      if (sent) pushes += 1;
    }
    return pushes;
  }

  /** After GitHub's Focus changed: update check activities; end them once nothing is pending. */
  async checksChanged(pullRequests: PrSummary[], nowMs = Date.now()): Promise<number> {
    let pushes = 0;
    const byKey = new Map(pullRequests.map((pr) => [pr.key, pr]));
    const rows = this.db.prepare(`SELECT a.token, a.subject, a.last_state FROM bd_live_activities a ${ACTIVE_SESSION} WHERE a.kind = 'checks'`).all(now()) as { token: string; subject: string; last_state: string | null }[];
    for (const row of rows) {
      const pr = byKey.get(row.subject);
      if (!pr) continue;
      const state = checksState(pr);
      const fingerprint = JSON.stringify(state);
      if (fingerprint === row.last_state) continue;
      const ended = state.pending === 0 && state.total > 0;
      const aps: Record<string, unknown> = { timestamp: Math.floor(nowMs / 1000), event: ended ? 'end' : 'update', 'content-state': state };
      if (ended) {
        aps['dismissal-date'] = Math.floor((nowMs + ENDED_STAY_MS) / 1000);
        aps.alert = { title: `${pr.repo}#${pr.number}`, body: state.failed ? `${state.failed} of ${state.total} checks failed` : 'All checks passed' };
      }
      if (await this.send(row.token, { aps })) pushes += 1;
      if (ended) this.db.prepare('DELETE FROM bd_live_activities WHERE token = ?').run(row.token);
      else this.db.prepare('UPDATE bd_live_activities SET last_state = ? WHERE token = ?').run(fingerprint, row.token);
    }
    return pushes;
  }
}
