import { invalidateGitHubTokenCache } from '@/services/github/auth';
import { createLogger } from '@/services/logger';

export interface RateLimit {
  remaining: number;
  total: number;
  reset: Date | null;
}

interface ETagEntry {
  etag: string;
  data: unknown;
}

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503]);
const GITHUB_REQUEST_TIMEOUT_MS = 10_000;

const log = createLogger('github');

export class GitHubClient {
  private readonly getToken: () => Promise<string>;
  private readonly etagCache = new Map<string, ETagEntry>();
  // REST and GraphQL draw from separate 5000/h pools — track them separately
  // so neither poisons the other's reading (the polling loop is GraphQL-only).
  private restRateLimit: RateLimit = { remaining: -1, total: -1, reset: null };
  private graphqlRateLimit: RateLimit = { remaining: -1, total: -1, reset: null };
  private _freshCount = 0;
  private _pollStartCount = 0;

  constructor(getToken: () => Promise<string>) {
    this.getToken = getToken;
  }

  /** Call before starting a poll cycle to track whether any fresh data arrives. */
  markPollStart(): void {
    this._pollStartCount = this._freshCount;
  }

  /** Returns true if any GET request returned fresh (non-304) data since markPollStart(). */
  get hadFreshData(): boolean {
    return this._freshCount > this._pollStartCount;
  }

  /** REST (core) pool. */
  getRateLimit(): RateLimit {
    return { ...this.restRateLimit };
  }

  /** GraphQL pool — populated by graphql() from headers and the inline rateLimit field. */
  getGraphqlRateLimit(): RateLimit {
    return { ...this.graphqlRateLimit };
  }

  /** True when either pool is running low — adaptive polling doubles its interval. */
  get isRateLimitLow(): boolean {
    const rest = this.restRateLimit.remaining;
    const graphql = this.graphqlRateLimit.remaining;
    return (rest >= 0 && rest < 500) || (graphql >= 0 && graphql < 500);
  }

  /** Populate the in-memory ETag cache from persisted entries (call on startup). */
  seedEtagCache(entries: Array<{ url: string; etag: string; data: unknown }>): void {
    for (const entry of entries) {
      this.etagCache.set(entry.url, { etag: entry.etag, data: entry.data });
    }
  }

  /** Export current ETag cache entries for persistence to SQLite. */
  getEtagEntries(): Array<{ url: string; etag: string; jsonData: unknown }> {
    const entries: Array<{ url: string; etag: string; jsonData: unknown }> = [];
    for (const [url, entry] of this.etagCache) {
      entries.push({ url, etag: entry.etag, jsonData: entry.data });
    }
    return entries;
  }

  async get<T>(path: string): Promise<T> {
    const url = `https://api.github.com/${path}`;
    const start = performance.now();
    log.info('GET start', { path });
    const response = await this.fetchWithRetry(url);
    const durationMs = Math.round(performance.now() - start);

    if (response.status === 304) {
      const cached = this.etagCache.get(url);
      if (cached) {
        log.info('GET 304 cached', { path, durationMs });
        return cached.data as T;
      }
      log.warn('GET 304 with no cached entry', { path, durationMs });
      this.etagCache.delete(url);
      const retryResponse = await this.fetchWithRetry(url);
      this.parseRestRateLimitHeaders(retryResponse);
      if (!retryResponse.ok) {
        throw new GitHubApiError(
          `GitHub API error: ${retryResponse.status} ${retryResponse.statusText}`,
          retryResponse.status,
        );
      }
      const retryBody = await retryResponse.json();
      this._freshCount++;
      const retryEtag = retryResponse.headers.get('etag');
      if (retryEtag) {
        this.etagCache.set(url, { etag: retryEtag, data: retryBody });
      }
      return retryBody as T;
    }

    this.checkResponseForAuthErrors(response, 'GET', path);

    if (!response.ok) {
      log.error('GET failed', {
        path,
        status: response.status,
        statusText: response.statusText,
        durationMs,
      });
      throw new GitHubApiError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    const body = await response.json();
    this._freshCount++;

    const etag = response.headers.get('etag');
    if (etag) {
      this.etagCache.set(url, { etag, data: body });
      if (this.etagCache.size > 500) {
        const oldest = this.etagCache.keys().next().value;
        if (oldest) this.etagCache.delete(oldest);
      }
    }

    log.info('GET ok', {
      path,
      status: response.status,
      durationMs,
      rateLimitRemaining: this.restRateLimit.remaining,
      cached: !!etag,
    });

    return body as T;
  }

  async getRaw(path: string): Promise<string> {
    const url = `https://api.github.com/${path}`;
    const response = await this.fetchWithRetry(url, {
      accept: 'application/vnd.github.v3.raw',
    });

    this.checkResponseForAuthErrors(response, 'GET_RAW', path);

    if (!response.ok) {
      throw new GitHubApiError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    return response.text();
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = `https://api.github.com/${path}`;
    const token = await this.getToken();

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'BorgDock',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    this.parseRestRateLimitHeaders(response);
    this.checkResponseForAuthErrors(response, 'POST', path);

    if (!response.ok) {
      throw new GitHubApiError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const url = `https://api.github.com/${path}`;
    const token = await this.getToken();

    const response = await this.fetchWithTimeout(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'BorgDock',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    this.parseRestRateLimitHeaders(response);
    this.checkResponseForAuthErrors(response, 'PUT', path);

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const errorBody = await response.json();
        if (errorBody?.message) detail = errorBody.message;
      } catch {
        /* ignore */
      }
      throw new GitHubApiError(`GitHub API error: ${response.status} — ${detail}`, response.status);
    }

    return (await response.json()) as T;
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = `https://api.github.com/${path}`;
    const token = await this.getToken();

    const response = await this.fetchWithTimeout(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'BorgDock',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    this.parseRestRateLimitHeaders(response);
    this.checkResponseForAuthErrors(response, 'PATCH', path);

    if (!response.ok) {
      throw new GitHubApiError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const start = performance.now();
    const queryName = query.match(/(?:query|mutation)\s+(\w+)/)?.[1] ?? 'anonymous';
    log.info('graphql start', { query: queryName });
    const token = await this.getToken();

    const response = await this.fetchWithTimeout('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'BorgDock',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    this.parseGraphqlRateLimitFromHeaders(response);
    const durationMs = Math.round(performance.now() - start);

    if (!response.ok) {
      log.error('graphql failed', { query: queryName, status: response.status, durationMs });
      if (response.status === 403 && this.graphqlRateLimit.remaining === 0) {
        throw new GitHubRateLimitError(
          `GitHub API rate limit exceeded. Resets at ${this.graphqlRateLimit.reset?.toISOString() ?? 'unknown'}.`,
          this.graphqlRateLimit.reset,
        );
      }
      if (response.status === 401 || response.status === 403) {
        invalidateGitHubTokenCache();
        throw new GitHubAuthError(`GitHub API authentication failed (${response.status}).`);
      }
      throw new GitHubApiError(
        `GitHub GraphQL error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    const result = await response.json();
    if (result.errors?.length > 0) {
      log.error('graphql errors', { query: queryName, errors: result.errors, durationMs });
      throw new GitHubApiError(`GraphQL error: ${result.errors[0].message}`, 422);
    }
    // Body rateLimit (when the query requests it) is the authoritative point
    // count — parse it after headers so it wins.
    const cost = this.parseGraphqlRateLimitFromBody(result.data);
    log.info('graphql ok', {
      query: queryName,
      durationMs,
      cost,
      rateLimitRemaining: this.graphqlRateLimit.remaining,
    });

    return result.data as T;
  }

  private checkResponseForAuthErrors(response: Response, _method: string, _path: string): void {
    if (response.status === 403 && this.restRateLimit.remaining === 0) {
      throw new GitHubRateLimitError(
        `GitHub API rate limit exceeded. Resets at ${this.restRateLimit.reset?.toISOString() ?? 'unknown'}.`,
        this.restRateLimit.reset,
      );
    }
    if (response.status === 401 || response.status === 403) {
      invalidateGitHubTokenCache();
      throw new GitHubAuthError(`GitHub API authentication failed (${response.status}).`);
    }
  }

  private async fetchWithRetry(
    url: string,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const maxRetries = 3;
    const baseDelay = 1000;
    let lastResponse: Response | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const token = await this.getToken();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'BorgDock',
          Accept: extraHeaders?.accept ?? 'application/vnd.github.v3+json',
          ...extraHeaders,
        };

        const cached = this.etagCache.get(url);
        if (cached) {
          headers['If-None-Match'] = cached.etag;
        }

        const response = await this.fetchWithTimeout(url, { headers });
        this.parseRestRateLimitHeaders(response);

        // Handle rate limit exhaustion
        if (response.status === 403 && this.restRateLimit.remaining === 0) {
          const resetTime = this.restRateLimit.reset;
          if (resetTime && attempt < maxRetries) {
            const waitMs = Math.max(0, resetTime.getTime() - Date.now());
            const cappedWait = Math.min(waitMs, 120_000);
            log.warn('rate limit exhausted — waiting for reset', {
              url,
              attempt,
              waitMs: cappedWait,
              resetAt: resetTime.toISOString(),
            });
            await sleep(cappedWait);
            continue;
          }
          log.error('rate limit exhausted — giving up', {
            url,
            attempt,
            resetAt: resetTime?.toISOString(),
          });
        }

        if (!isTransient(response.status) || attempt === maxRetries) {
          if (attempt > 0) {
            log.info('fetch succeeded after retries', {
              url,
              attempts: attempt + 1,
              status: response.status,
            });
          }
          return response;
        }

        lastResponse = response;

        const delay = getRetryDelay(attempt, response, baseDelay);
        log.warn('transient failure — retrying', {
          url,
          attempt,
          status: response.status,
          delayMs: delay,
        });
        await sleep(delay);
      } catch (error) {
        if (attempt === maxRetries) {
          log.error('fetch exhausted retries', error, { url, attempts: attempt + 1 });
          throw error;
        }
        const delay = baseDelay * 2 ** attempt;
        log.warn('network error — retrying', {
          url,
          attempt,
          error: error instanceof Error ? error.message : String(error),
          delayMs: delay,
        });
        await sleep(delay);
      }
    }

    return lastResponse!;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (isAbortError(error)) {
        throw new Error(`GitHub request timed out after ${GITHUB_REQUEST_TIMEOUT_MS}ms: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseRestRateLimitHeaders(response: Response): void {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (remaining) {
      const val = parseInt(remaining, 10);
      if (!Number.isNaN(val)) this.restRateLimit.remaining = val;
    }

    const limit = response.headers.get('X-RateLimit-Limit');
    if (limit) {
      const val = parseInt(limit, 10);
      if (!Number.isNaN(val)) this.restRateLimit.total = val;
    }

    const reset = response.headers.get('X-RateLimit-Reset');
    if (reset) {
      const val = parseInt(reset, 10);
      if (!Number.isNaN(val)) this.restRateLimit.reset = new Date(val * 1000);
    }
  }

  /** GraphQL responses carry the same X-RateLimit-* headers, but for the GraphQL pool. */
  private parseGraphqlRateLimitFromHeaders(response: Response): void {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (remaining) {
      const val = parseInt(remaining, 10);
      if (!Number.isNaN(val)) this.graphqlRateLimit.remaining = val;
    }

    const limit = response.headers.get('X-RateLimit-Limit');
    if (limit) {
      const val = parseInt(limit, 10);
      if (!Number.isNaN(val)) this.graphqlRateLimit.total = val;
    }

    const reset = response.headers.get('X-RateLimit-Reset');
    if (reset) {
      const val = parseInt(reset, 10);
      if (!Number.isNaN(val)) this.graphqlRateLimit.reset = new Date(val * 1000);
    }
  }

  /**
   * Parse the inline `rateLimit { remaining limit resetAt cost }` field that
   * queries may request at the root. Returns the reported query cost (points)
   * for logging, if present.
   */
  private parseGraphqlRateLimitFromBody(data: unknown): number | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const rl = (
      data as {
        rateLimit?: { remaining?: number; limit?: number; resetAt?: string; cost?: number };
      }
    ).rateLimit;
    if (!rl) return undefined;
    if (typeof rl.remaining === 'number') this.graphqlRateLimit.remaining = rl.remaining;
    if (typeof rl.limit === 'number') this.graphqlRateLimit.total = rl.limit;
    if (typeof rl.resetAt === 'string') {
      const d = new Date(rl.resetAt);
      if (!Number.isNaN(d.getTime())) this.graphqlRateLimit.reset = d;
    }
    return typeof rl.cost === 'number' ? rl.cost : undefined;
  }
}

export class GitHubAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubAuthError';
  }
}

export class GitHubRateLimitError extends Error {
  readonly resetAt: Date | null;
  constructor(message: string, resetAt: Date | null) {
    super(message);
    this.name = 'GitHubRateLimitError';
    this.resetAt = resetAt;
  }
}

export class GitHubApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

function isTransient(status: number): boolean {
  return TRANSIENT_STATUS_CODES.has(status);
}

function getRetryDelay(attempt: number, response: Response, baseDelay: number): number {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds)) {
      return Math.min(seconds * 1000, 120_000);
    }
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) {
      const wait = date.getTime() - Date.now();
      return Math.min(Math.max(wait, 0), 120_000);
    }
  }
  return baseDelay * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}
