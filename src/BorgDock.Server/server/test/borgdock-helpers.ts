import { generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { canonicalString, type SignedEnvelope } from '../src/auth/signatures.ts';

/** A device key like the Secure Enclave's: the private key, and the public key as base64 X9.63. */
export function deviceKey() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, 'base64url'), Buffer.from(jwk.y!, 'base64url')]);
  return { privateKey, publicKey: raw.toString('base64') };
}

/** The X-BorgDock-* headers the app sends for one request. */
export function signedHeaders(privateKey: KeyObject, method: string, path: string, body: string, overrides: Partial<SignedEnvelope> = {}) {
  const envelope = { method, path, signedAt: new Date().toISOString(), nonce: randomBytes(16).toString('base64url'), body, signature: '', ...overrides };
  const signature = sign('sha256', Buffer.from(canonicalString(envelope)), { key: privateKey, dsaEncoding: 'der' }).toString('base64');
  return { 'x-borgdock-signed-at': envelope.signedAt, 'x-borgdock-nonce': envelope.nonce, 'x-borgdock-signature': overrides.signature ?? signature };
}
