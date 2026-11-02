import { EventEmitter } from 'node:events';
import type { ActivityCategory, ActivityEntry, ActivityPage, ActivityTarget, Digest, PushData, ReadsSince, Tone } from '../../../shared/src/api.ts';
import { now, type Db } from '../db.ts';
import type { Draft } from './activity-derive.ts';
import { migratePlatform } from './schema.ts';

export const CATEGORIES: readonly ActivityCategory[] = ['review', 'ci', 'agent', 'merge', 'workitem', 'comment'];
/** More new lines than this in one observation is a catch-up, not news: one summary push instead of many. */
export const BURST = 4;
/**
 * A source reports in pieces when the server starts (one GitHub account, then the next; ADO, then each T3 host), so
 * everything it reports in its first few minutes only seeds.
 */
export const WARMUP_MS = 3 * 60_000;
const AWAY_AFTER_MS = 60 * 60_000;
const PAGE_LIMIT = 100;

type Row = { id: string; source: string; category: ActivityCategory; title: string; detail: string; tone: Tone; target: string; push: string | null; at: string; created_at: string; read_at: string | null };

export type Committed = { entries: (ActivityEntry & { push: PushData | null })[]; burst: boolean };

const MAX_TARGETS = 200;

/** One key per thing an entry is about: kind and id, a pull request's key case-insensitive. */
function targetKey(target: unknown): string | null {
  const t = (target ?? {}) as Record<string, unknown>;
  switch (t.kind) {
    case 'pr': return t.key ? `pr:${String(t.key).toLowerCase()}` : null;
    case 'item': return Number.isFinite(Number(t.id)) ? `item:${Number(t.id)}` : null;
    case 'thread': return t.id ? `thread:${String(t.id)}` : null;
    case 'ci': return t.groupId ? `ci:${String(t.groupId)}` : null;
    default: return null;
  }
}

const toEntry = (r: Row): ActivityEntry => ({ id: r.id, category: r.category, title: r.title, detail: r.detail, at: r.at, read: Boolean(r.read_at), tone: r.tone, target: JSON.parse(r.target) as ActivityTarget });

/**
 * What changed since you last looked, kept until you read it. Each source's first observation only seeds: it
 * records what is already true and adds nothing. After that a line is added the first time its fact is seen.
 *
 * Event 'entries' (Committed) after a commit that added lines.
 */
export class ActivityJournal extends EventEmitter {
  private readonly db: Db;

  constructor(db: Db) {
    super();
    this.db = db;
    migratePlatform(db);
  }

  seeded(source: string): boolean {
    return this.seededAt(source) !== null;
  }

  /** When BorgDock first observed `source`. */
  private seededAt(source: string): string | null {
    return (this.db.prepare('SELECT seeded_at FROM bd_activity_sources WHERE source = ?').get(source) as { seeded_at: string } | undefined)?.seeded_at ?? null;
  }

  /**
   * Records one observation of `source`. Returns the lines it added: none while the source warms up, and none for
   * facts older than BorgDock's first look at it (a host back online after hours reports its old threads too).
   */
  commit(source: string, drafts: Draft[], at = now()): Committed {
    const seen = this.db.prepare('INSERT OR IGNORE INTO bd_activity_seen (key, source, at) VALUES (?, ?, ?)');
    const insert = this.db.prepare(`INSERT OR IGNORE INTO bd_activity (id, source, category, title, detail, tone, target, push, at, created_at)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const seededAt = this.seededAt(source);
    const seeding = seededAt === null;
    const warming = seeding || Date.parse(at) - Date.parse(seededAt) < WARMUP_MS;
    const added: Committed['entries'] = [];
    this.db.exec('BEGIN');
    try {
      for (const draft of drafts) {
        if (seen.run(draft.id, source, at).changes === 0 || warming) continue;
        if (Date.parse(draft.at) < Date.parse(seededAt!)) continue;
        if (insert.run(draft.id, source, draft.category, draft.title, draft.detail, draft.tone, JSON.stringify(draft.target), draft.push ? JSON.stringify(draft.push) : null, draft.at, at).changes === 0) continue;
        const { push, ...entry } = draft;
        added.push({ ...entry, read: false, push: push ?? null });
      }
      if (seeding) this.db.prepare('INSERT OR IGNORE INTO bd_activity_sources (source, seeded_at) VALUES (?, ?)').run(source, at);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    const committed = { entries: added, burst: added.length > BURST };
    if (added.length) this.emit('entries', committed);
    return committed;
  }

  /** The newest lines first. Looking at the first page counts as a visit, for the away summary. */
  page(query: { category?: string | null; before?: string | null; limit?: number; visit?: boolean }, nowMs = Date.now()): ActivityPage {
    const category = query.category && CATEGORIES.includes(query.category as ActivityCategory) ? query.category : null;
    const limit = Math.max(1, Math.min(PAGE_LIMIT, Math.floor(query.limit ?? 50)));
    const rows = this.db.prepare(`SELECT * FROM bd_activity WHERE (? IS NULL OR category = ?) AND (? IS NULL OR at < ?) ORDER BY at DESC, created_at DESC LIMIT ?`)
      .all(category, category, query.before ?? null, query.before ?? null, limit) as Row[];
    const counts = this.db.prepare('SELECT category, count(*) AS n FROM bd_activity WHERE read_at IS NULL GROUP BY category').all() as { category: ActivityCategory; n: number }[];
    const unreadByCategory = Object.fromEntries(CATEGORIES.map((c) => [c, counts.find((r) => r.category === c)?.n ?? 0])) as Record<ActivityCategory, number>;
    const away = query.before || query.visit === false ? this.awayWindow() : this.visit(nowMs);
    return { entries: rows.map(toEntry), unread: Object.values(unreadByCategory).reduce((a, b) => a + b, 0), unreadByCategory, away: away ? this.awaySummary(away) : null };
  }

  private state<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : null;
  }

  private setState(key: string, value: unknown) {
    this.db.prepare('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  }

  private awayWindow(): { from: string; to: string } | null {
    return this.state<{ from: string; to: string }>('activity.away');
  }

  /** A visit after an hour or more away opens a new away window; visits close together keep the last one. */
  private visit(nowMs: number): { from: string; to: string } | null {
    const last = this.state<string>('activity.lastVisit');
    const at = new Date(nowMs).toISOString();
    this.setState('activity.lastVisit', at);
    if (last && nowMs - Date.parse(last) >= AWAY_AFTER_MS) {
      const window = { from: last, to: at };
      this.setState('activity.away', window);
      return window;
    }
    return this.awayWindow();
  }

  private awaySummary(window: { from: string; to: string }): ActivityPage['away'] {
    const rows = this.db.prepare('SELECT category, tone FROM bd_activity WHERE created_at > ? AND created_at <= ?').all(window.from, window.to) as { category: ActivityCategory; tone: Tone }[];
    if (!rows.length) return null;
    const merged = rows.filter((r) => r.category === 'merge').length;
    const ciFailures = rows.filter((r) => r.category === 'ci').length;
    const agentsDone = rows.filter((r) => r.category === 'agent' && r.tone === 'ok').length;
    return { ...window, merged, ciFailures, agentsDone, other: rows.length - merged - ciFailures - agentsDone };
  }

  /** Marks lines read; returns the ids that changed, for the silent `read` push. */
  markRead(request: { ids: string[] } | { all: true }): { unread: number; ids: string[] } {
    const at = now();
    const ids = 'all' in request && request.all
      ? (this.db.prepare('SELECT id FROM bd_activity WHERE read_at IS NULL').all() as { id: string }[]).map((r) => r.id)
      : ((request as { ids?: unknown }).ids instanceof Array ? (request as { ids: unknown[] }).ids.map(String).slice(0, 500) : []);
    const update = this.db.prepare('UPDATE bd_activity SET read_at = ? WHERE id = ? AND read_at IS NULL');
    const changed = ids.filter((id) => update.run(at, id).changes > 0);
    return { unread: this.unread(), ids: changed };
  }

  /** You read these things elsewhere: every unread line about them from before `before` becomes read. */
  markTargetsRead(targets: unknown, before: string): { unread: number; ids: string[] } {
    const keys = new Set((Array.isArray(targets) ? targets.slice(0, MAX_TARGETS) : []).map(targetKey).filter((k): k is string => k !== null));
    if (!keys.size) return { unread: this.unread(), ids: [] };
    const rows = this.db.prepare('SELECT id, target FROM bd_activity WHERE read_at IS NULL AND at <= ?').all(new Date(before).toISOString()) as { id: string; target: string }[];
    const ids = rows.filter((r) => keys.has(targetKey(JSON.parse(r.target)) ?? '')).map((r) => r.id);
    return this.markRead({ ids });
  }

  /**
   * What was read since `since` (inclusive), on any device. `until` is the next call's `since`; a line read in the
   * same millisecond may come back twice, never not at all.
   */
  readsSince(since: string, at = now()): ReadsSince {
    const from = Number.isFinite(Date.parse(since)) ? new Date(since).toISOString() : new Date(Date.parse(at) - 86_400_000).toISOString();
    const rows = this.db.prepare('SELECT target FROM bd_activity WHERE read_at >= ? AND read_at < ? ORDER BY read_at').all(from, at) as { target: string }[];
    const targets = new Map<string, ActivityTarget>();
    for (const r of rows) {
      const target = JSON.parse(r.target) as ActivityTarget;
      const key = targetKey(target);
      if (key && !targets.has(key)) targets.set(key, target);
    }
    return { until: at, targets: [...targets.values()] };
  }

  unread(): number {
    return (this.db.prepare('SELECT count(*) AS n FROM bd_activity WHERE read_at IS NULL').get() as { n: number }).n;
  }

  /** Lines for the daily note's "Since yesterday" block, oldest first. */
  digest(since: string, refOf: (target: ActivityTarget) => string | null): Digest {
    const from = Number.isFinite(Date.parse(since)) ? new Date(since).toISOString() : new Date(Date.now() - 86_400_000).toISOString();
    const rows = this.db.prepare('SELECT * FROM bd_activity WHERE at >= ? ORDER BY at ASC LIMIT 200').all(from) as Row[];
    return {
      since: from,
      lines: rows.map((r) => {
        const ref = refOf(JSON.parse(r.target));
        return { text: r.detail ? `${r.title}: ${r.detail}` : r.title, refs: ref ? [ref] : [] };
      }),
    };
  }
}
