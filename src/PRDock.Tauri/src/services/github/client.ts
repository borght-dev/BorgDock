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

export class GitHubClient {
  private readonly getToken: () => Promise<string>;
  private readonly etagCache = new Map<string, ETagEntry>();
  private rateLimit: RateLimit = { remaining: -1, total: -1, reset: null };
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

  getRateLimit(): RateLimit {
    return { ...this.rateLimit };
  }

  get isRateLimitLow(): boolean {
    return this.rateLimit.remaining >= 0 && this.rateLimit.remaining < 500;
  }

  async get<T>(path: string): Promise<T> {
    const url = `https://api.github.com/${path}`;
    const response = await this.fetchWithRetry(url);

    if (response.status === 304) {
      const cached = this.etagCache.get(url);
      if (cached) {
        return cached.data as T;
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new GitHubAuthError(`GitHub API authentication failed (${response.status}).`);
    }

    if (!response.ok) {
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
    }

    return body as T;
  }

  async getRaw(path: string): Promise<string> {
    const url = `https://api.github.com/${path}`;
    const response = await this.fetchWithRetry(url, {
      accept: 'application/vnd.github.v3.raw',
    });

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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'PRDock',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    this.parseRateLimitHeaders(response);

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

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'PRDock',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    this.parseRateLimitHeaders(response);

    if (!response.ok) {
      throw new GitHubApiError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = `https://api.github.com/${path}`;
    const token = await this.getToken();

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'PRDock',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    this.parseRateLimitHeaders(response);

    if (!response.ok) {
      throw new GitHubApiError(
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const token = await this.getToken();

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'PRDock',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    this.parseRateLimitHeaders(response);

    if (!response.ok) {
      throw new GitHubApiError(
        `GitHub GraphQL error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    const result = await response.json();
    if (result.errors?.length > 0) {
      throw new GitHubApiError(`GraphQL error: ${result.errors[0].message}`, 422);
    }

    return result.data as T;
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
          'User-Agent': 'PRDock',
          Accept: extraHeaders?.accept ?? 'application/vnd.github.v3+json',
          ...extraHeaders,
        };

        const cached = this.etagCache.get(url);
        if (cached) {
          headers['If-None-Match'] = cached.etag;
        }

        const response = await fetch(url, { headers });
        this.parseRateLimitHeaders(response);

        // Handle rate limit exhaustion
        if (response.status === 403 && this.rateLimit.remaining === 0) {
          const resetTime = this.rateLimit.reset;
          if (resetTime && attempt < maxRetries) {
            const waitMs = Math.max(0, resetTime.getTime() - Date.now());
            const cappedWait = Math.min(waitMs, 120_000);
            await sleep(cappedWait);
            continue;
          }
        }

        if (!isTransient(response.status) || attempt === maxRetries) {
          return response;
        }

        lastResponse = response;

        const delay = getRetryDelay(attempt, response, baseDelay);
        await sleep(delay);
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = baseDelay * 2 ** attempt;
        await sleep(delay);
      }
    }

    return lastResponse!;
  }

  private parseRateLimitHeaders(response: Response): void {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (remaining) {
      const val = parseInt(remaining, 10);
      if (!Number.isNaN(val)) this.rateLimit.remaining = val;
    }

    const limit = response.headers.get('X-RateLimit-Limit');
    if (limit) {
      const val = parseInt(limit, 10);
      if (!Number.isNaN(val)) this.rateLimit.total = val;
    }

    const reset = response.headers.get('X-RateLimit-Reset');
    if (reset) {
      const val = parseInt(reset, 10);
      if (!Number.isNaN(val)) this.rateLimit.reset = new Date(val * 1000);
    }
  }
}

export class GitHubAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubAuthError';
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
