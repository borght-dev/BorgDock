// Frames on the connector's WebSocket (`wss://<server>/api/connector`), one JSON object per frame. The connector
// dials out, so a machine behind NAT needs no open port. Shared by the server and `connector/`.
import { createHmac, randomBytes, timingSafeEqual, randomInt } from 'node:crypto';
import type { SignedEnvelope } from '../auth/signatures.ts';

export type ConnectorMachine = { id: string; label: string; version: string | null };

/** Connector → server, first frame. `token` once paired; `pair` asks for a pairing code; `local` is the CLI on the server's own machine. */
export type Hello = { type: 'hello'; token?: string; pair?: boolean; local?: boolean; machine: ConnectorMachine };

export type RelayRequest =
  | { kind: 'get'; path: string }
  | { kind: 'rpc'; tag: string; payload: Record<string, unknown> }
  | { kind: 'command'; envelope: SignedEnvelope }
  | { kind: 'verify'; devicePublicKey: string; proof: string; deviceName: string };

export type ServerFrame =
  | { type: 'welcome'; machineId: string; label: string }
  | { type: 'pairing'; code: string; expiresAt: string; serverUrl: string }
  | { type: 'registered'; machineId: string; token: string }
  | { type: 'paired'; deviceName: string }
  /** `code: 'unpaired'`: the machine was removed; the connector drops its token and trust and pairs again. */
  | { type: 'error'; message: string; code?: 'unpaired' }
  | { type: 'request'; id: string; request: RelayRequest };

export type ConnectorFrame =
  | Hello
  | { type: 'reply'; id: string; ok: true; value: unknown }
  | { type: 'reply'; id: string; ok: false; error: string; status?: number };

/** The QR a pairing shows: `borgdock://pair?server=<url>&code=<code>&secret=<base64url 32 bytes>`. */
export function pairingLink(serverUrl: string, code: string, secret: string): string {
  return `borgdock://pair?${new URLSearchParams({ server: serverUrl, code, secret })}`;
}

/** Pairing codes and typed secrets use Crockford's alphabet: no I, L, O or U to misread. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * The short secret a typed code carries after the server's code: "ABCD-EFGH-JKMN-PQRS" is code ABCD-EFGH plus
 * secret JKMNPQRS. Like the QR's secret it never leaves the connector, so the server can't prove a pairing itself.
 */
export const newTypedSecret = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export const typedPairingCode = (code: string, typedSecret: string) => `${code}-${typedSecret.slice(0, 4)}-${typedSecret.slice(4)}`;

/** A typed code's proof: base64(HMAC-SHA256(UTF-8 of the 8-character secret, devicePublicKey bytes)). */
export function typedPairingProof(typedSecret: string, devicePublicKey: string): string {
  return createHmac('sha256', Buffer.from(typedSecret, 'utf8')).update(Buffer.from(devicePublicKey, 'base64')).digest('base64');
}

export function typedProofMatches(typedSecret: string, devicePublicKey: string, proof: string): boolean {
  const expected = Buffer.from(typedPairingProof(typedSecret, devicePublicKey), 'base64');
  const given = Buffer.from(String(proof ?? ''), 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The secret a pairing QR carries; it never leaves the connector. */
export const newPairingSecret = () => randomBytes(32).toString('base64url');

/** The phone proves it scanned the QR: proof = base64(HMAC-SHA256(secret, devicePublicKey bytes)). */
export function pairingProof(secret: string, devicePublicKey: string): string {
  return createHmac('sha256', Buffer.from(secret, 'base64url')).update(Buffer.from(devicePublicKey, 'base64')).digest('base64');
}

export function proofMatches(secret: string, devicePublicKey: string, proof: string): boolean {
  const expected = Buffer.from(pairingProof(secret, devicePublicKey), 'base64');
  const given = Buffer.from(String(proof ?? ''), 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
