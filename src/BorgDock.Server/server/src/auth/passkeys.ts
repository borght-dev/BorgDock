import { randomUUID } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { PasskeyInfo } from '../../../shared/src/api.ts';
import { now, type Db } from '../db.ts';

type Row = { id: string; public_key: Uint8Array; counter: number; transports: string; name: string; created_at: string; last_used_at: string | null };
type Challenge = { value: string; purpose: 'register' | 'login'; owner: string; expiresAt: number };

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_PENDING_CHALLENGES = 5000;
// One client can't push everyone else's pending sign-in out of the map.
const MAX_PENDING_PER_CLIENT = 20;
// Dispatch has one user; the passkey user handle is fixed so every device's passkey belongs to the same account.
const USER_ID = new TextEncoder().encode('dispatch-owner');

export class AuthError extends Error {}

/** WebAuthn passkeys with user verification required (Face ID, Touch ID, Windows Hello, or a device PIN). */
export class Passkeys {
  private readonly db: Db;
  private readonly rpId: string;
  private readonly origins: string[];
  private challenges = new Map<string, Challenge>();

  constructor(db: Db, options: { rpId: string; origins: string[] }) {
    this.db = db;
    this.rpId = options.rpId;
    this.origins = options.origins;
  }

  count(): number {
    return (this.db.prepare('SELECT count(*) AS n FROM passkeys').get() as { n: number }).n;
  }

  private remember(value: string, purpose: Challenge['purpose'], owner: string): string {
    const nowMs = Date.now();
    for (const [id, c] of this.challenges) if (c.expiresAt < nowMs) this.challenges.delete(id);
    const mine = [...this.challenges].filter(([, c]) => c.owner === owner);
    if (mine.length >= MAX_PENDING_PER_CLIENT) this.challenges.delete(mine[0][0]);
    if (this.challenges.size >= MAX_PENDING_CHALLENGES) this.challenges.delete(this.challenges.keys().next().value!);
    const id = randomUUID();
    this.challenges.set(id, { value, purpose, owner, expiresAt: nowMs + CHALLENGE_TTL_MS });
    return id;
  }

  // A challenge works once, for the purpose it was issued for, within five minutes.
  private take(id: string, purpose: Challenge['purpose']): string {
    const challenge = this.challenges.get(id);
    this.challenges.delete(id);
    if (!challenge || challenge.purpose !== purpose || challenge.expiresAt < Date.now()) throw new AuthError('This sign-in attempt expired. Try again.');
    return challenge.value;
  }

  async registrationOptions(userName: string, owner: string) {
    const existing = this.db.prepare('SELECT id, transports FROM passkeys').all() as { id: string; transports: string }[];
    const options = await generateRegistrationOptions({
      rpName: 'Dispatch',
      rpID: this.rpId,
      userName,
      userDisplayName: userName,
      userID: USER_ID,
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: JSON.parse(p.transports) })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    return { options, challengeId: this.remember(options.challenge, 'register', owner) };
  }

  async register(challengeId: string, response: RegistrationResponseJSON, name: string): Promise<string> {
    const expectedChallenge = this.take(challengeId, 'register');
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origins,
      expectedRPID: this.rpId,
      requireUserVerification: true,
    }).catch((error) => { throw new AuthError(`The passkey could not be verified: ${error.message}`); });
    if (!result.verified) throw new AuthError('The passkey could not be verified.');
    const { credential } = result.registrationInfo;
    this.db.prepare('INSERT INTO passkeys (id, public_key, counter, transports, name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(credential.id, credential.publicKey, credential.counter, JSON.stringify(credential.transports ?? []), name.slice(0, 60) || 'Passkey', now());
    return credential.id;
  }

  async authenticationOptions(owner: string) {
    // No allowCredentials: the device offers its own Dispatch passkey (discoverable credential).
    const options = await generateAuthenticationOptions({ rpID: this.rpId, userVerification: 'required' });
    return { options, challengeId: this.remember(options.challenge, 'login', owner) };
  }

  async authenticate(challengeId: string, response: AuthenticationResponseJSON): Promise<string> {
    const expectedChallenge = this.take(challengeId, 'login');
    const row = this.db.prepare('SELECT * FROM passkeys WHERE id = ?').get(response.id) as Row | undefined;
    if (!row) throw new AuthError('This passkey is not registered with Dispatch.');
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origins,
      expectedRPID: this.rpId,
      requireUserVerification: true,
      credential: { id: row.id, publicKey: new Uint8Array(row.public_key), counter: row.counter, transports: JSON.parse(row.transports) },
    }).catch((error) => { throw new AuthError(`The passkey could not be verified: ${error.message}`); });
    if (!result.verified) throw new AuthError('The passkey could not be verified.');
    this.db.prepare('UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?').run(result.authenticationInfo.newCounter, now(), row.id);
    return row.id;
  }

  list(): PasskeyInfo[] {
    const rows = this.db.prepare('SELECT id, name, created_at, last_used_at FROM passkeys ORDER BY created_at').all() as Row[];
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
  }

  rename(id: string, name: string): boolean {
    return this.db.prepare('UPDATE passkeys SET name = ? WHERE id = ?').run(name.slice(0, 60), id).changes > 0;
  }

  /** The last passkey can't be removed from the app; that would lock everyone out. */
  remove(id: string): boolean {
    if (this.count() <= 1) throw new AuthError('This is your only passkey. Add another one before removing it.');
    return this.db.prepare('DELETE FROM passkeys WHERE id = ?').run(id).changes > 0;
  }
}
