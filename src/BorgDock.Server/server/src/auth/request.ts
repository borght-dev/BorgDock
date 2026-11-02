import type { Context } from 'hono';
import type { Via } from '../db.ts';

/**
 * The server only listens on loopback, so every request comes from this Mac: either Tailscale's
 * proxy (serve for the tailnet, Funnel for the internet), which sets these headers, or a local process.
 */
export function clientOf(c: Context): { via: Via; ip: string | null } {
  const forwarded = (c.req.header('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ip = forwarded.at(-1) ?? null;
  if (c.req.header('tailscale-funnel-request')) return { via: 'internet', ip };
  if (ip) return { via: 'tailnet', ip };
  return { via: 'local', ip: null };
}

/** Counts only failures, per client, so nobody can lock the owner out by failing on purpose from elsewhere. */
export class FailureLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private failures = new Map<string, { count: number; resetAt: number }>();

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  blocked(key: string): boolean {
    const entry = this.failures.get(key);
    return Boolean(entry && entry.resetAt > Date.now() && entry.count >= this.limit);
  }

  fail(key: string) {
    const nowMs = Date.now();
    if (this.failures.size > 10_000) for (const [k, v] of this.failures) if (v.resetAt < nowMs) this.failures.delete(k);
    const entry = this.failures.get(key);
    if (!entry || entry.resetAt < nowMs) this.failures.set(key, { count: 1, resetAt: nowMs + this.windowMs });
    else entry.count += 1;
  }
}

/** Fixed-window counter per key. Enough for one user; it only has to slow down guessing. */
export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  allow(key: string): boolean {
    const nowMs = Date.now();
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.resetAt < nowMs) this.hits.delete(k);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt < nowMs) {
      this.hits.set(key, { count: 1, resetAt: nowMs + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}
