import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Owner } from '../../../shared/src/api.ts';
import type { ClerkConfig } from '../config.ts';

export class ClerkError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** `clerk.example.com` or `https://clerk.example.com/` → `https://clerk.example.com`: the token's `iss`. */
export function frontendApiUrl(frontendApi: string): string {
  const trimmed = frontendApi.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const BACKEND_API = 'https://api.clerk.com/v1';

/**
 * Checks Clerk session tokens against the instance's JWKS (signature, `iss`, `exp`, `nbf`) and reads the user's
 * profile from Clerk's Backend API with the secret key. The token is checked once, at the exchange.
 */
export class ClerkVerifier {
  readonly issuer: string;
  private readonly secretKey: string;
  private readonly jwks: JWTVerifyGetKey;
  private readonly fetcher: typeof fetch;
  private readonly backendApi: string;

  constructor(config: ClerkConfig, options: { jwks?: JWTVerifyGetKey; fetch?: typeof fetch; backendApi?: string } = {}) {
    this.issuer = frontendApiUrl(config.frontendApi);
    this.secretKey = config.secretKey;
    this.jwks = options.jwks ?? createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`), { cooldownDuration: 60_000 });
    this.fetcher = options.fetch ?? fetch;
    this.backendApi = options.backendApi ?? BACKEND_API;
  }

  async verify(token: string): Promise<{ userId: string; sessionId: string | null }> {
    if (typeof token !== 'string' || token.split('.').length !== 3) throw new ClerkError('That Clerk sign-in is invalid. Sign in again.');
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'nbf'],
        clockTolerance: 5,
      });
      return { userId: String(payload.sub), sessionId: typeof payload.sid === 'string' ? payload.sid : null };
    } catch (error) {
      const code = (error as { code?: string }).code;
      throw new ClerkError(code === 'ERR_JWT_EXPIRED' ? 'That Clerk sign-in expired. Sign in again.' : 'That Clerk sign-in is invalid. Sign in again.');
    }
  }

  async profile(userId: string): Promise<Owner> {
    return (await this.identity(userId)).owner;
  }

  /** The profile, plus what an owner allowlist can match: verified email addresses and verified GitHub logins. */
  async identity(userId: string): Promise<ClerkIdentity> {
    if (!/^[A-Za-z0-9_]{1,64}$/.test(userId)) throw new ClerkError('Clerk sent an unexpected user id.', 502);
    const response = await this.fetcher(`${this.backendApi}/users/${userId}`, {
      headers: { authorization: `Bearer ${this.secretKey}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => { throw new ClerkError("Clerk isn't reachable. Try again in a moment.", 502); });
    if (!response.ok) throw new ClerkError(`Clerk answered ${response.status} for your profile.`, 502);
    const user = (await response.json()) as ClerkUser;
    const email = user.email_addresses?.find((e) => e.id === user.primary_email_address_id)?.email_address ?? user.email_addresses?.[0]?.email_address ?? null;
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || email || 'BorgDock owner';
    const verified = (v: { status?: string } | null | undefined) => v?.status === 'verified';
    return {
      owner: { clerkUserId: user.id, name, email, imageUrl: user.image_url ?? null },
      verifiedEmails: (user.email_addresses ?? []).filter((e) => verified(e.verification)).map((e) => e.email_address.toLowerCase()),
      githubLogins: (user.external_accounts ?? [])
        .filter((a) => /github/i.test(a.provider ?? '') && verified(a.verification) && a.username)
        .map((a) => a.username!.toLowerCase()),
    };
  }
}

export type ClerkIdentity = { owner: Owner; verifiedEmails: string[]; githubLogins: string[] };

type ClerkUser = {
  id: string; first_name: string | null; last_name: string | null; username: string | null; image_url: string | null;
  primary_email_address_id: string | null;
  email_addresses?: { id: string; email_address: string; verification?: { status?: string } | null }[];
  external_accounts?: { provider?: string; username?: string | null; verification?: { status?: string } | null }[];
};

/** Whether the owner allowlist in config.json names this Clerk user. */
export function allowlisted(identity: ClerkIdentity, owners: { emails: string[]; githubLogins: string[] }): boolean {
  return identity.verifiedEmails.some((e) => owners.emails.includes(e)) || identity.githubLogins.some((l) => owners.githubLogins.includes(l));
}
