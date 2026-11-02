import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SessionInfo } from '../../../shared/src/api.ts';
import { now, type Db, type Via } from '../db.ts';

export type Session = {
  id: string;
  kind: 'browser' | 'app';
  name: string;
  createdAt: string;
  passkeyId: string | null;
  verifiedAt: string | null;
  /** True when this request extended the expiry, so a browser cookie should be re-issued. */
  extended: boolean;
};

type Row = {
  id: string; token_hash: string; kind: 'browser' | 'app'; name: string; created_at: string; passkey_id: string | null;
  last_seen_at: string; last_seen_via: Via; expires_at: string; revoked_at: string | null; verified_at: string | null;
};

const RECENT_VERIFICATION_MS = 5 * 60_000;

// Sliding expiry: a browser that isn't used for 30 days signs out; the phone app gets 180 days.
const IDLE_DAYS = { browser: 30, app: 180 };
const TOUCH_EVERY_MS = 60_000;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** Only a hash of each token is stored, so a copy of the database can't be used to sign in. */
export class Sessions {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  create(input: { kind: 'browser' | 'app'; name: string; passkeyId: string | null; via: Via }): { session: Session; token: string } {
    const token = randomToken();
    const id = randomUUID();
    const at = now();
    // A browser session starts right after a passkey check; an app session never counts as one.
    const verifiedAt = input.kind === 'browser' && input.passkeyId ? at : null;
    this.db.prepare(`INSERT INTO sessions (id, token_hash, kind, name, passkey_id, created_at, last_seen_at, last_seen_via, expires_at, verified_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, sha256(token), input.kind, input.name.slice(0, 80), input.passkeyId, at, at, input.via, daysFromNow(IDLE_DAYS[input.kind]), verifiedAt);
    return { session: { id, kind: input.kind, name: input.name, createdAt: at, passkeyId: input.passkeyId, verifiedAt, extended: false }, token };
  }

  validate(token: string, via: Via): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(token)) as Row | undefined;
    if (!row || row.revoked_at || row.expires_at < now()) return null;
    const extended = Date.now() - Date.parse(row.last_seen_at) > TOUCH_EVERY_MS || row.last_seen_via !== via;
    if (extended) {
      this.db.prepare('UPDATE sessions SET last_seen_at = ?, last_seen_via = ?, expires_at = ? WHERE id = ?')
        .run(now(), via, daysFromNow(IDLE_DAYS[row.kind]), row.id);
    }
    return { id: row.id, kind: row.kind, name: row.name, createdAt: row.created_at, passkeyId: row.passkey_id, verifiedAt: row.verified_at, extended };
  }

  isActive(id: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?').get(id, now()));
  }

  markVerified(id: string, passkeyId: string) {
    this.db.prepare('UPDATE sessions SET verified_at = ?, passkey_id = COALESCE(passkey_id, ?) WHERE id = ?').run(now(), passkeyId, id);
  }

  static recentlyVerified(session: Session): boolean {
    return session.kind === 'browser' && Boolean(session.verifiedAt) && Date.now() - Date.parse(session.verifiedAt!) < RECENT_VERIFICATION_MS;
  }

  list(currentId: string | null): SessionInfo[] {
    const rows = this.db.prepare(`SELECT * FROM sessions WHERE revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC`).all(now()) as Row[];
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      lastSeenVia: r.last_seen_via,
      current: r.id === currentId,
    }));
  }

  info(id: string): SessionInfo | null {
    return this.list(id).find((s) => s.id === id) ?? null;
  }

  revoke(id: string): boolean {
    return this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now(), id).changes > 0;
  }

  /** Removing a passkey signs out every session that was opened with it. */
  revokeForPasskey(passkeyId: string): string[] {
    const ids = (this.db.prepare('SELECT id FROM sessions WHERE passkey_id = ? AND revoked_at IS NULL').all(passkeyId) as { id: string }[]).map((r) => r.id);
    for (const id of ids) this.revoke(id);
    return ids;
  }
}
