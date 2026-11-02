import type { ActivityPush, ActivityCategory, PushData, ReadPush, RefreshPush } from '../../../shared/src/api.ts';
import type { Committed } from '../borgdock/activity.ts';
import type { PresenceBoard, Preferences } from '../borgdock/preferences.ts';
import type { Db } from '../db.ts';
import type { ApnsPush, ApnsResult } from './apns.ts';

export type PushSender = { push(deviceToken: string, environment: 'production' | 'sandbox', push: ApnsPush): Promise<ApnsResult> };

type Entry = Committed['entries'][number];

/** The notification category the app registered for an entry: its lock-screen actions follow from it. */
export function pushCategory(category: ActivityCategory, data: PushData | ActivityPush): string {
  if (data.kind === 'question') {
    if (data.recommended !== null && data.allowCustomAnswer) return 'BORGDOCK_QUESTION';
    if (data.recommended !== null) return 'BORGDOCK_QUESTION_RECOMMENDED';
    if (data.allowCustomAnswer) return 'BORGDOCK_QUESTION_TEXT';
    return 'BORGDOCK_DEFAULT';
  }
  if (data.kind === 'suggestion') return 'BORGDOCK_SUGGESTION';
  if (category === 'review') return 'BORGDOCK_PR';
  if (category === 'ci') return 'BORGDOCK_CI';
  return 'BORGDOCK_DEFAULT';
}

export const pushDataOf = (entry: Entry): PushData | ActivityPush =>
  entry.push ?? { kind: 'activity', entryId: entry.id, category: entry.category, target: entry.target };

/** Groups a lock screen's notifications: per work item, pull request, CI group or thread. */
function threadIdOf(entry: Entry): string {
  const t = entry.target;
  if (t.kind === 'item') return `item-${t.id}`;
  if (t.kind === 'thread') return t.itemId ? `item-${t.itemId}` : `thread-${t.id}`;
  if (t.kind === 'pr') return `pr-${t.key}`;
  if (t.kind === 'ci') return `ci-${t.groupId}`;
  return 'borgdock';
}

const SUMMARY_EVERY_MS = 30 * 60_000;
const REFRESH_AT_MOST_EVERY_MS = 5 * 60_000;

/**
 * BorgDock's iPhone pushes. Each category is delivered at once, in a summary or not at all (preferences); a burst
 * of new lines becomes one summary; nothing alerts while the desktop says you're at your desk. Silent pushes tell
 * the app to refresh its widgets (`refresh`) or to remove notifications read elsewhere (`read`).
 */
export class BorgDockPusher {
  private readonly db: Db;
  private readonly sender: () => PushSender | null;
  private readonly preferences: Preferences;
  private readonly presence: PresenceBoard;
  private summary: Entry[] = [];
  private lastSummaryAt = Date.now();
  private lastRefreshAt = 0;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(options: { db: Db; sender: () => PushSender | null; preferences: Preferences; presence: PresenceBoard }) {
    this.db = options.db;
    this.sender = options.sender;
    this.preferences = options.preferences;
    this.presence = options.presence;
  }

  private devices(): { device_token: string; environment: 'production' | 'sandbox' }[] {
    return this.db.prepare('SELECT device_token, environment FROM push_apns').all() as { device_token: string; environment: 'production' | 'sandbox' }[];
  }

  private async toEveryDevice(push: ApnsPush): Promise<number> {
    const sender = this.sender();
    if (!sender) return 0;
    let sent = 0;
    await Promise.all(this.devices().map(async (d) => {
      const result = await sender.push(d.device_token, d.environment, push);
      if (result === 'sent') sent += 1;
      if (result === 'gone') this.db.prepare('DELETE FROM push_apns WHERE device_token = ?').run(d.device_token);
    }));
    return sent;
  }

  /** What to do with new journal lines; returns what was pushed at once, for tests and the log. */
  async deliver(committed: Committed, nowMs = Date.now()): Promise<{ alerts: string[]; queued: number }> {
    const { categories, quietAtDesk } = this.preferences.get();
    const quiet = quietAtDesk && this.presence.atDesk(nowMs);
    const now: Entry[] = [];
    for (const entry of committed.entries) {
      const delivery = categories[entry.category];
      if (delivery === 'off') continue;
      if (delivery === 'summary' || quiet || committed.burst) this.summary.push(entry);
      else now.push(entry);
    }
    const alerts: string[] = [];
    for (const entry of now) {
      const data = pushDataOf(entry);
      await this.toEveryDevice({
        pushType: 'alert',
        collapseId: entry.id,
        payload: {
          aps: { alert: { title: entry.title, body: entry.detail }, sound: 'default', category: pushCategory(entry.category, data), 'thread-id': threadIdOf(entry) },
          dispatch: data,
        },
      });
      alerts.push(entry.id);
    }
    if (committed.burst && !quiet) await this.flushSummary(nowMs, true);
    this.scheduleRefresh();
    return { alerts, queued: this.summary.length };
  }

  /** One push for everything queued; runs every half hour, or at once for a burst. Quiet while you're at your desk. */
  async flushSummary(nowMs = Date.now(), force = false): Promise<boolean> {
    if (!this.summary.length) return false;
    if (!force && nowMs - this.lastSummaryAt < SUMMARY_EVERY_MS) return false;
    const { quietAtDesk } = this.preferences.get();
    if (quietAtDesk && this.presence.atDesk(nowMs)) {
      // You saw it on the desktop; the Activity tab still has it.
      this.summary = [];
      return false;
    }
    const entries = this.summary.splice(0);
    this.lastSummaryAt = nowMs;
    const title = entries.length === 1 ? entries[0].title : `${entries.length} updates in BorgDock`;
    const body = entries.length === 1 ? entries[0].detail : entries.slice(0, 3).map((e) => e.title).join(' · ');
    const data: ActivityPush = entries.length === 1 ? (pushDataOf(entries[0]) as ActivityPush) : { kind: 'activity', entryId: entries[0].id, category: entries[0].category, target: { kind: 'none' } };
    await this.toEveryDevice({ pushType: 'alert', collapseId: `summary:${nowMs}`, payload: { aps: { alert: { title, body }, sound: 'default', category: 'BORGDOCK_DEFAULT', 'thread-id': 'borgdock-summary' }, dispatch: data } });
    return true;
  }

  /** Lines read on one device disappear from the others' notification centres. */
  async read(ids: string[]) {
    if (!ids.length) return;
    const data: ReadPush = { kind: 'read', ids: ids.slice(0, 100) };
    await this.toEveryDevice({ pushType: 'background', payload: { aps: { 'content-available': 1 }, dispatch: data } });
  }

  /** Widgets refresh at most every five minutes; a change in between is sent when the five minutes are up. */
  scheduleRefresh(nowMs = Date.now()) {
    if (this.refreshTimer) return;
    const wait = Math.max(0, this.lastRefreshAt + REFRESH_AT_MOST_EVERY_MS - nowMs);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.lastRefreshAt = Date.now();
      const data: RefreshPush = { kind: 'refresh' };
      this.toEveryDevice({ pushType: 'background', payload: { aps: { 'content-available': 1 }, dispatch: data } }).catch(() => {});
    }, wait);
    this.refreshTimer.unref();
  }

  stop() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }
}
