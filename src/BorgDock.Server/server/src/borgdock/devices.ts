import { now, type Db } from '../db.ts';
import { publicKeyFromX963 } from '../auth/signatures.ts';
import { migratePlatform } from './schema.ts';

/** Each signed-in device's P-256 public key, bound to its session once: a session never changes its key. */
export class DeviceKeys {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
    migratePlatform(db);
  }

  /** Throws when the key isn't a P-256 point; answers false when the session already has a key. */
  bind(sessionId: string, publicKey: string, clerkUserId: string | null): boolean {
    publicKeyFromX963(publicKey);
    return this.db.prepare('INSERT OR IGNORE INTO bd_device_keys (session_id, public_key, clerk_user_id, created_at) VALUES (?, ?, ?, ?)')
      .run(sessionId, publicKey, clerkUserId, now()).changes > 0;
  }

  keyOf(sessionId: string): string | null {
    const row = this.db.prepare('SELECT public_key FROM bd_device_keys WHERE session_id = ?').get(sessionId) as { public_key: string } | undefined;
    return row?.public_key ?? null;
  }

  /** The session that holds `publicKey`, if it is still signed in. */
  sessionOf(publicKey: string): string | null {
    const row = this.db.prepare(`SELECT k.session_id FROM bd_device_keys k JOIN sessions s ON s.id = k.session_id
                                 WHERE k.public_key = ? AND s.revoked_at IS NULL AND s.expires_at > ?`).get(publicKey, now()) as { session_id: string } | undefined;
    return row?.session_id ?? null;
  }
}
