import type { ActivityCategory, BorgDockPreferences, CategoryDelivery, Presence } from '../../../shared/src/api.ts';
import type { Db } from '../db.ts';
import { CATEGORIES } from './activity.ts';

const KEY = 'borgdock.preferences';
const DELIVERIES: readonly CategoryDelivery[] = ['immediate', 'summary', 'off'];

export const DEFAULT_PREFERENCES: BorgDockPreferences = {
  categories: { review: 'immediate', ci: 'immediate', agent: 'immediate', merge: 'summary', workitem: 'summary', comment: 'summary' },
  quietAtDesk: true,
  faceIdForActions: true,
};

export class Preferences {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  get(): BorgDockPreferences {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(KEY) as { value: string } | undefined;
    const stored = row ? (JSON.parse(row.value) as Partial<BorgDockPreferences>) : {};
    return { ...DEFAULT_PREFERENCES, ...stored, categories: { ...DEFAULT_PREFERENCES.categories, ...stored.categories } };
  }

  /** Keeps only known categories and deliveries; anything else falls back to what was set before. */
  set(input: Partial<BorgDockPreferences>): BorgDockPreferences {
    const current = this.get();
    const categories = { ...current.categories };
    for (const category of CATEGORIES) {
      const delivery = input.categories?.[category as ActivityCategory];
      if (delivery && DELIVERIES.includes(delivery)) categories[category] = delivery;
    }
    const next: BorgDockPreferences = {
      categories,
      quietAtDesk: typeof input.quietAtDesk === 'boolean' ? input.quietAtDesk : current.quietAtDesk,
      faceIdForActions: typeof input.faceIdForActions === 'boolean' ? input.faceIdForActions : current.faceIdForActions,
    };
    this.db.prepare('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, JSON.stringify(next));
    return next;
  }
}

const AT_DESK_IDLE_SECONDS = 5 * 60;
const REPORT_FRESH_MS = 3 * 60_000;

/**
 * Whether you're at your desk, from what the desktop app reports. In memory: it only matters while it's fresh.
 * A linked desktop reports under its session, so signing it out stops it counting; older reports go by device name.
 */
export class PresenceBoard {
  private reports = new Map<string, { idleSeconds: number; at: number; sessionId: string | null }>();
  private readonly sessionActive: (sessionId: string) => boolean;

  constructor(sessionActive: (sessionId: string) => boolean = () => true) {
    this.sessionActive = sessionActive;
  }

  report(presence: Presence, nowMs = Date.now(), sessionId: string | null = null) {
    const device = String(presence.device ?? '').slice(0, 80) || 'desktop';
    const idleSeconds = Math.max(0, Number(presence.idleSeconds) || 0);
    this.reports.set(sessionId ? `session:${sessionId}` : device, { idleSeconds, at: nowMs, sessionId });
  }

  /** A desktop said within the last few minutes that it was used in the last five. */
  atDesk(nowMs = Date.now()): boolean {
    return [...this.reports.values()].some((r) => this.fresh(r, nowMs));
  }

  /** The same, for one linked desktop. */
  atDeskFor(sessionId: string, nowMs = Date.now()): boolean {
    const report = this.reports.get(`session:${sessionId}`);
    return Boolean(report && this.fresh(report, nowMs));
  }

  private fresh(r: { idleSeconds: number; at: number; sessionId: string | null }, nowMs: number): boolean {
    return nowMs - r.at < REPORT_FRESH_MS && r.idleSeconds + (nowMs - r.at) / 1000 < AT_DESK_IDLE_SECONDS && (!r.sessionId || this.sessionActive(r.sessionId));
  }
}
