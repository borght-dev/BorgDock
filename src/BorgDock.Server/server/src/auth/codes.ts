import { createHash, randomBytes, randomInt } from 'node:crypto';
import { now, type Db } from '../db.ts';
import { sha256 } from './sessions.ts';

// Crockford base32 without I, L, O and U: easy to read off a terminal and type on a phone.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SETUP_CODE_MINUTES = 30;
const normalize = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, '');

/**
 * Enrolment codes let a new passkey be registered without being signed in: the very first one,
 * or a recovery after losing every device. They are only ever created on the Mac itself.
 */
export class SetupCodes {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  create(): { code: string; expiresAt: string } {
    const raw = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const expiresAt = new Date(Date.now() + SETUP_CODE_MINUTES * 60_000).toISOString();
    this.db.prepare('INSERT INTO setup_codes (code_hash, created_at, expires_at) VALUES (?, ?, ?)').run(sha256(raw), now(), expiresAt);
    return { code: `${raw.slice(0, 5)}-${raw.slice(5)}`, expiresAt };
  }

  isValid(code: string): boolean {
    const row = this.db.prepare('SELECT expires_at, used_at FROM setup_codes WHERE code_hash = ?').get(sha256(normalize(code))) as
      | { expires_at: string; used_at: string | null }
      | undefined;
    return Boolean(row && !row.used_at && row.expires_at > now());
  }

  consume(code: string): boolean {
    return this.db.prepare('UPDATE setup_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?')
      .run(now(), sha256(normalize(code)), now()).changes > 0;
  }
}

type AppCode = { challenge: string; passkeyId: string | null; expiresAt: number };

/**
 * The phone app signs in through the web page (ASWebAuthenticationSession) and gets a one-time code
 * back on dispatch://auth. PKCE ties that code to the app instance that started the sign-in, so
 * another app that grabs the redirect can't redeem it.
 */
export class AppCodes {
  private codes = new Map<string, AppCode>();

  create(codeChallenge: string, passkeyId: string | null): string {
    if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) throw new Error('code_challenge must be a base64url SHA-256 hash');
    const nowMs = Date.now();
    for (const [code, c] of this.codes) if (c.expiresAt < nowMs) this.codes.delete(code);
    const code = randomBytes(24).toString('base64url');
    this.codes.set(code, { challenge: codeChallenge, passkeyId, expiresAt: nowMs + 2 * 60_000 });
    return code;
  }

  redeem(code: string, verifier: string): { passkeyId: string | null } | null {
    const entry = this.codes.get(code);
    this.codes.delete(code);
    if (!entry || entry.expiresAt < Date.now()) return null;
    const computed = createHash('sha256').update(verifier).digest('base64url');
    return computed === entry.challenge ? { passkeyId: entry.passkeyId } : null;
  }
}
