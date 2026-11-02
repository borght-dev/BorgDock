import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NotificationPreferences, Overview } from '../../../shared/src/api.ts';
import { now, type Db } from '../db.ts';
import { noticesFor, type Notice } from '../engine/notifications.ts';
import { ApnsSender } from './apns.ts';
import type { Config } from '../config.ts';

const DEFAULT_PREFERENCES: NotificationPreferences = { waiting: true, drift: true, finished: true };
// Lock-screen actions are fixed per category, so a question picks the category whose actions fit it.
export function categoryFor(data: Notice['data']): string {
  if (data.kind === 'suggestion') return 'DISPATCH_SUGGESTION';
  if (data.kind !== 'question') return 'DISPATCH_DEFAULT';
  const recommended = data.recommended !== null;
  if (recommended && data.allowCustomAnswer) return 'DISPATCH_QUESTION';
  if (recommended) return 'DISPATCH_QUESTION_RECOMMENDED';
  if (data.allowCustomAnswer) return 'DISPATCH_QUESTION_TEXT';
  return 'DISPATCH_DEFAULT';
}

export class Notifier {
  readonly vapidPublicKey: string;
  private readonly db: Db;
  private readonly apns: ApnsSender | null;
  private seeded: boolean;
  /** BorgDock's activity journal sends the iPhone's pushes (BORGDOCK_* categories); web push stays here. */
  apnsFromActivity = false;

  constructor(config: Config, db: Db) {
    this.db = db;
    const vapidFile = join(config.dataDir, 'vapid.json');
    if (!existsSync(vapidFile)) writeFileSync(vapidFile, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 });
    const vapid = JSON.parse(readFileSync(vapidFile, 'utf8'));
    // Push services want a contact URL; the public origin serves, and a placeholder keeps local http dev working.
    webpush.setVapidDetails(config.publicOrigin.startsWith('https://') ? config.publicOrigin : 'https://dispatch.invalid', vapid.publicKey, vapid.privateKey);
    this.vapidPublicKey = vapid.publicKey;
    this.apns = config.apns ? new ApnsSender(config.apns) : null;
    // A fresh install starts quiet: whatever is already true doesn't trigger a burst of notifications.
    this.seeded = (db.prepare('SELECT count(*) AS n FROM notified').get() as { n: number }).n > 0;
  }

  get apnsEnabled() {
    return this.apns !== null;
  }

  preferences(): NotificationPreferences {
    const row = this.db.prepare(`SELECT value FROM preferences WHERE key = 'notifications'`).get() as { value: string } | undefined;
    return { ...DEFAULT_PREFERENCES, ...(row ? JSON.parse(row.value) : {}) };
  }

  setPreferences(preferences: NotificationPreferences) {
    const value = JSON.stringify({ waiting: Boolean(preferences.waiting), drift: Boolean(preferences.drift), finished: Boolean(preferences.finished) });
    this.db.prepare(`INSERT INTO preferences (key, value) VALUES ('notifications', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(value);
  }

  async process(overview: Overview) {
    const isNew = this.db.prepare('SELECT 1 FROM notified WHERE key = ?');
    const mark = this.db.prepare('INSERT OR IGNORE INTO notified (key, at) VALUES (?, ?)');
    const fresh = noticesFor(overview).filter((n) => !isNew.get(n.key));
    for (const n of fresh) mark.run(n.key, now());
    if (!this.seeded) {
      this.seeded = true;
      return;
    }
    const preferences = this.preferences();
    for (const notice of fresh) if (preferences[notice.preference]) await this.send(notice);
  }

  async send(notice: Notice) {
    const web = this.db.prepare('SELECT endpoint, p256dh, auth FROM push_web').all() as { endpoint: string; p256dh: string; auth: string }[];
    await Promise.all(web.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: notice.title, body: notice.body, tag: notice.group, data: notice.data }),
          { TTL: 3600, urgency: 'high' },
        );
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) this.db.prepare('DELETE FROM push_web WHERE endpoint = ?').run(s.endpoint);
      }
    }));

    if (!this.apns || this.apnsFromActivity) return;
    const devices = this.db.prepare('SELECT device_token, environment FROM push_apns').all() as { device_token: string; environment: 'production' | 'sandbox' }[];
    await Promise.all(devices.map(async (d) => {
      const result = await this.apns!.send(d.device_token, d.environment, {
        title: notice.title,
        body: notice.body,
        category: categoryFor(notice.data),
        threadId: notice.group,
        collapseId: notice.key,
        data: { dispatch: notice.data },
      });
      if (result === 'gone') this.db.prepare('DELETE FROM push_apns WHERE device_token = ?').run(d.device_token);
    }));
  }

  registerWeb(sessionId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    this.db.prepare(`INSERT INTO push_web (endpoint, session_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(endpoint) DO UPDATE SET session_id = excluded.session_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .run(subscription.endpoint, sessionId, subscription.keys.p256dh, subscription.keys.auth, now());
  }

  registerApns(sessionId: string, deviceToken: string, environment: 'production' | 'sandbox') {
    this.db.prepare(`INSERT INTO push_apns (device_token, session_id, environment, created_at) VALUES (?, ?, ?, ?)
                     ON CONFLICT(device_token) DO UPDATE SET session_id = excluded.session_id, environment = excluded.environment`)
      .run(deviceToken, sessionId, environment, now());
  }

  /** Signing a device out also stops its notifications. */
  forgetSession(sessionId: string) {
    this.db.prepare('DELETE FROM push_web WHERE session_id = ?').run(sessionId);
    this.db.prepare('DELETE FROM push_apns WHERE session_id = ?').run(sessionId);
  }

  /** The APNs sender, shared with BorgDock's pushes and Live Activities; null until apns.json exists. */
  get apnsSender(): ApnsSender | null {
    return this.apns;
  }

  close() {
    this.apns?.close();
  }
}
