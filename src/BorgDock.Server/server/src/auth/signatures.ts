import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../api/context.ts';
import { audit, type Db } from '../db.ts';
import { DeviceKeys } from '../borgdock/devices.ts';

// Device-signed commands: shared/src/borgdock.ts, "Signed commands". The connector runs the same checks with the
// keys it trusts from pairing, so everything here that isn't the middleware must stay free of server state.

export const SIGNATURE_WINDOW_MS = 2 * 60_000;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const NONCES_KEPT_MS = 2 * SIGNATURE_WINDOW_MS + 60_000;

/** A signed request as it arrived: enough for a connector to check the signature and read the command itself. */
export type SignedEnvelope = { method: string; path: string; signedAt: string; nonce: string; signature: string; body: string };

/** The signed request being handled, for code further down (a connector relay) that has to pass it on. */
export const signedRequest = new AsyncLocalStorage<SignedEnvelope>();

export const sha256hex = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

export function canonicalString(envelope: Pick<SignedEnvelope, 'method' | 'path' | 'signedAt' | 'nonce' | 'body'>): string {
  return `${envelope.method.toUpperCase()}\n${envelope.path}\n${envelope.signedAt}\n${envelope.nonce}\n${sha256hex(envelope.body)}`;
}

/** A Secure Enclave public key: base64 of the 65-byte uncompressed X9.63 point. Throws for anything else. */
export function publicKeyFromX963(base64: string): KeyObject {
  const bytes = Buffer.from(String(base64 ?? ''), 'base64');
  if (bytes.length !== 65 || bytes[0] !== 0x04) throw new Error('The device key must be a P-256 public key (65-byte X9.63, base64).');
  return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: bytes.subarray(1, 33).toString('base64url'), y: bytes.subarray(33).toString('base64url') } });
}

/** DER is what the Secure Enclave produces; a 64-byte r‖s (WebCrypto's format) is accepted too. */
export function verifySignature(publicKey: string | KeyObject, envelope: SignedEnvelope): boolean {
  try {
    const key = typeof publicKey === 'string' ? publicKeyFromX963(publicKey) : publicKey;
    const signature = Buffer.from(envelope.signature, 'base64');
    if (signature.length < 64) return false;
    return verify('sha256', Buffer.from(canonicalString(envelope)), { key, dsaEncoding: signature.length === 64 ? 'ieee-p1363' : 'der' }, signature);
  } catch {
    return false;
  }
}

/** Why an envelope is refused before any key is tried, or null when its time and nonce are well formed. */
export function envelopeProblem(envelope: SignedEnvelope, nowMs = Date.now()): string | null {
  if (!envelope.signature || !envelope.signedAt || !envelope.nonce) return 'unsigned';
  if (!NONCE.test(envelope.nonce)) return 'bad nonce';
  const at = Date.parse(envelope.signedAt);
  if (!Number.isFinite(at) || Math.abs(nowMs - at) > SIGNATURE_WINDOW_MS) return 'outside the 2-minute window';
  return null;
}

/** Each nonce works once within the window. In memory: the connector's copy of the replay table. */
export class NonceCache {
  private seen = new Map<string, number>();

  /** False when the nonce was used already. */
  use(nonce: string, nowMs = Date.now()): boolean {
    for (const [n, at] of this.seen) if (nowMs - at > NONCES_KEPT_MS) this.seen.delete(n);
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, nowMs);
    return true;
  }
}

const REFUSED = { error: 'This needs a signature from your device. Update the app, or sign in again on this device.', signatureRequired: true };

/**
 * Checks the device signature on agent, merge and approve commands: the key registered for the calling session,
 * the 2-minute window and the nonce replay table. Mount it after the session check. The checked envelope stays
 * available through `signedRequest` while the route runs.
 */
export function signatureCheck(db: Db): MiddlewareHandler<Env> {
  const keys = new DeviceKeys(db);
  const claimNonce = db.prepare('INSERT OR IGNORE INTO bd_nonces (nonce, session_id, at) VALUES (?, ?, ?)');
  const forgetOld = db.prepare('DELETE FROM bd_nonces WHERE at < ?');
  return async (c, next) => {
    const session = c.get('session');
    const refuse = (reason: string) => {
      audit(db, { sessionId: session?.id ?? null, via: c.get('via'), ip: c.get('ip'), action: 'signature.rejected', detail: { path: new URL(c.req.url).pathname, reason } });
      return c.json(REFUSED, 403);
    };
    if (!session) return c.json({ error: 'Sign in first.' }, 401);
    const envelope: SignedEnvelope = {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      signedAt: c.req.header('x-borgdock-signed-at') ?? '',
      nonce: c.req.header('x-borgdock-nonce') ?? '',
      signature: c.req.header('x-borgdock-signature') ?? '',
      body: Buffer.from(await c.req.arrayBuffer()).toString('utf8'),
    };
    const problem = envelopeProblem(envelope);
    if (problem) return refuse(problem);
    const key = keys.keyOf(session.id);
    if (!key) return refuse('no device key');
    if (!verifySignature(key, envelope)) return refuse('bad signature');
    const nowMs = Date.now();
    forgetOld.run(new Date(nowMs - NONCES_KEPT_MS).toISOString());
    if (claimNonce.run(envelope.nonce, session.id, new Date(nowMs).toISOString()).changes === 0) return refuse('nonce used before');
    return signedRequest.run(envelope, () => next());
  };
}
