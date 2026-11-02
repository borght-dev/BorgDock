import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { DesktopLinkStart, DesktopLinkStatus } from '../../../shared/src/api.ts';
import type { Env } from '../api/context.ts';
import { now, type Db } from '../db.ts';
import { CODE_ALPHABET } from './connector-protocol.ts';
import { migratePlatform } from './schema.ts';

const LINK_MS = 10 * 60_000;
/** An expired link still answers `expired` for a while, so a polling desktop learns why. */
const EXPIRED_KEPT_MS = 10 * 60_000;
const PICKUP_MS = 2 * 60_000;
const PENDING_PER_CLIENT = 3;
const PENDING_TOTAL = 20;

/** What a linked desktop session may call; everything else answers 403. Keys are `METHOD path`. */
export const DESKTOP_ROUTES = new Set([
  'GET /api/server',
  'GET /api/activity',
  'POST /api/activity/read',
  'POST /api/activity/read-targets',
  'GET /api/activity/reads',
  'POST /api/presence',
  'POST /api/auth/logout',
]);

const hash = (value: string) => createHash('sha256').update(value).digest();
const normalizeCode = (code: unknown) => String(code ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

export class DesktopLinkError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Linked BorgDock desktop apps: each is an app session that may only use DESKTOP_ROUTES. */
export class Desktops {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
    migratePlatform(db);
  }

  record(sessionId: string, name: string) {
    this.db.prepare('INSERT OR REPLACE INTO bd_desktops (session_id, name, linked_at) VALUES (?, ?, ?)').run(sessionId, name.slice(0, 80), now());
  }

  /** The desktop picked up its token: the link is complete. */
  collected(sessionId: string) {
    this.db.prepare('UPDATE bd_desktops SET collected_at = ? WHERE session_id = ?').run(now(), sessionId);
  }

  /**
   * Approved links whose token was never picked up. Their tokens lived only in this process's memory, so after a
   * restart nobody can hold them: revoke the sessions instead of leaving them linked for months.
   */
  revokeUncollected(revoke: (sessionId: string) => void) {
    const rows = this.db.prepare('SELECT session_id FROM bd_desktops WHERE collected_at IS NULL').all() as { session_id: string }[];
    for (const { session_id: sessionId } of rows) {
      revoke(sessionId);
      this.db.prepare('DELETE FROM bd_desktops WHERE session_id = ?').run(sessionId);
    }
  }

  isDesktop(sessionId: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM bd_desktops WHERE session_id = ?').get(sessionId));
  }

  /** Desktops whose session is still signed in; revoking the session unlinks the desktop. */
  list(): { sessionId: string; name: string; lastSeenAt: string | null }[] {
    return (this.db.prepare(`SELECT d.session_id, d.name, s.last_seen_at FROM bd_desktops d JOIN sessions s ON s.id = d.session_id
                             WHERE s.revoked_at IS NULL AND s.expires_at > ? ORDER BY d.linked_at`).all(now()) as { session_id: string; name: string; last_seen_at: string | null }[])
      .map((r) => ({ sessionId: r.session_id, name: r.name, lastSeenAt: r.last_seen_at }));
  }
}

/** Refuses every route a desktop session isn't for, before any route runs. */
export function desktopScope(desktops: Desktops): MiddlewareHandler<Env> {
  return async (c, next) => {
    const session = c.get('session');
    if (!session || session.kind !== 'app' || !desktops.isDesktop(session.id)) return next();
    if (DESKTOP_ROUTES.has(`${c.req.method} ${new URL(c.req.url).pathname}`)) return next();
    return c.json({ error: 'A linked desktop can only read activity, sync what you read and report presence. Use the phone for this.' }, 403);
  };
}

type Link = {
  id: string;
  code: string;
  secretHash: Buffer;
  deviceName: string;
  client: string;
  expiresAt: number;
  approved: { token: string; sessionId: string } | null;
};

/**
 * Links in progress, in memory: a link lives ten minutes, and the token waits here only until the desktop picks it
 * up. A link approved but never picked up revokes its session when it expires.
 */
export class DesktopLinks {
  private readonly links = new Map<string, Link>();
  private readonly abandoned: (sessionId: string) => void;

  constructor(abandoned: (sessionId: string) => void) {
    this.abandoned = abandoned;
  }

  start(input: { deviceName: string; client: string; serverUrl: string }, nowMs = Date.now()): DesktopLinkStart {
    this.sweep(nowMs);
    const pending = [...this.links.values()].filter((l) => !l.approved && l.expiresAt > nowMs);
    if (pending.filter((l) => l.client === input.client).length >= PENDING_PER_CLIENT || pending.length >= PENDING_TOTAL) {
      throw new DesktopLinkError('Too many desktop links are waiting. Finish one or wait ten minutes.', 429);
    }
    let code: string;
    do code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    while ([...this.links.values()].some((l) => l.code === code));
    const pollSecret = randomBytes(32).toString('base64url');
    const link: Link = { id: randomUUID(), code, secretHash: hash(pollSecret), deviceName: input.deviceName, client: input.client, expiresAt: nowMs + LINK_MS, approved: null };
    this.links.set(link.id, link);
    const display = `${code.slice(0, 4)}-${code.slice(4)}`;
    return {
      linkId: link.id,
      code: display,
      pollSecret,
      expiresAt: new Date(link.expiresAt).toISOString(),
      link: `borgdock://link-desktop?${new URLSearchParams({ server: input.serverUrl, code: display })}`,
    };
  }

  /** The pending link for a code; one use, so an approved or expired code fails. */
  pending(code: unknown, nowMs = Date.now()): Link {
    this.sweep(nowMs);
    const normalized = normalizeCode(code);
    const link = [...this.links.values()].find((l) => l.code === normalized);
    if (!link || link.approved || link.expiresAt <= nowMs) throw new DesktopLinkError('That code expired or was used. Show a new one on the desktop.', 409);
    return link;
  }

  /** The desktop gets a couple of minutes to pick up its token, even when the code was approved at the last second. */
  approve(link: Link, session: { token: string; sessionId: string }, nowMs = Date.now()) {
    link.approved = session;
    link.expiresAt = Math.max(link.expiresAt, nowMs + PICKUP_MS);
  }

  /** The token comes back once; then the link is gone. A wrong secret looks like no link at all. */
  poll(linkId: string, secret: unknown, serverName: string, nowMs = Date.now()): DesktopLinkStatus {
    this.sweep(nowMs);
    const link = this.links.get(linkId);
    if (!link || !timingSafeEqual(hash(String(secret ?? '')), link.secretHash)) throw new DesktopLinkError('No such desktop link.', 404);
    if (link.approved) {
      this.links.delete(link.id);
      return { status: 'approved', token: link.approved.token, sessionId: link.approved.sessionId, serverName };
    }
    if (link.expiresAt <= nowMs) {
      this.links.delete(link.id);
      return { status: 'expired' };
    }
    return { status: 'pending' };
  }

  /** Drops expired links and revokes approved ones nobody picked up. Runs on every call and on a timer. */
  sweep(nowMs = Date.now()) {
    for (const link of this.links.values()) {
      if (link.expiresAt > nowMs) continue;
      if (link.approved) {
        this.links.delete(link.id);
        this.abandoned(link.approved.sessionId);
      } else if (link.expiresAt + EXPIRED_KEPT_MS <= nowMs) {
        this.links.delete(link.id);
      }
    }
  }
}
