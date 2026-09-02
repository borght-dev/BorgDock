import { invoke } from '@tauri-apps/api/core';
import type { AdoAuthMethod } from '@/types/settings';

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503]);
const MAX_RETRIES = 3;

interface AdoFetchResponse {
  status: number;
  status_text: string;
  body: string;
  body_base64: string | null;
  headers: Record<string, string>;
}

export class AdoClient {
  private readonly org: string;
  private readonly project: string;
  private readonly pat: string;
  private readonly authMethod: AdoAuthMethod;
  private cachedHeader: string | null = null;

  constructor(org: string, project: string, pat: string, authMethod: AdoAuthMethod = 'pat') {
    this.org = org;
    this.project = project;
    this.pat = pat;
    this.authMethod = authMethod;
  }

  private async getAuthHeader(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cachedHeader) return this.cachedHeader;
    const header = await invoke<string>('ado_resolve_auth_header', {
      authMethod: this.authMethod,
      pat: this.authMethod === 'pat' ? this.pat : null,
      forceRefresh,
    });
    this.cachedHeader = header;
    return header;
  }

  /**
   * Route ADO HTTP requests through the Rust backend. On a 401, refresh
   * the cached Authorization header once and retry the original request.
   * The retry is enforced here rather than in `fetchWithRetry` so it
   * applies to every call path (get, post, patch, delete, getStream).
   */
  private async fetchViaTauri(url: string, init: RequestInit): Promise<Response> {
    let response = await this.fetchViaTauriOnce(url, init, await this.getAuthHeader());
    if (response.status === 401) {
      try {
        const fresh = await this.getAuthHeader(true);
        response = await this.fetchViaTauriOnce(url, init, fresh);
      } catch {
        // Resolver failed on refresh — let the original 401 surface.
      }
    }
    return response;
  }

  private async fetchViaTauriOnce(
    url: string,
    init: RequestInit,
    authHeader: string,
  ): Promise<Response> {
    const headers: Record<string, string> = { Authorization: authHeader };
    if (init.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) {
        if (k.toLowerCase() !== 'authorization') headers[k] = v;
      }
    }

    const result = await invoke<AdoFetchResponse>('ado_fetch', {
      request: {
        url,
        method: (init.method ?? 'GET').toUpperCase(),
        headers,
        body: init.body ? String(init.body) : null,
      },
    });

    return new Response(result.body, {
      status: result.status,
      statusText: result.status_text,
      headers: new Headers(result.headers),
    });
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await this.fetchViaTauri(url, init);
      if (!TRANSIENT_STATUS_CODES.has(response.status) || attempt === MAX_RETRIES) {
        return response;
      }
      const retryAfter = response.headers.get('Retry-After');
      const rawDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 || 1000 : 1000 * 2 ** attempt;
      const delay = Math.min(rawDelay, 120_000);
      await new Promise((r) => setTimeout(r, delay));
    }
    throw new Error('Retry loop exhausted');
  }

  get isConfigured(): boolean {
    if (this.org.trim().length === 0 || this.project.trim().length === 0) return false;
    if (this.authMethod === 'azCli') return true;
    return this.pat.trim().length > 0;
  }

  private get baseUrl(): string {
    return `https://dev.azure.com/${encodeURIComponent(this.org)}/${encodeURIComponent(this.project)}/_apis`;
  }

  private buildUrl(relativePath: string, apiVersion = '7.1'): string {
    const separator = relativePath.includes('?') ? '&' : '?';
    return `${this.baseUrl}/${relativePath}${separator}api-version=${apiVersion}`;
  }

  private buildOrgUrl(relativePath: string, apiVersion = '7.1'): string {
    const separator = relativePath.includes('?') ? '&' : '?';
    return `https://dev.azure.com/${encodeURIComponent(this.org)}/_apis/${relativePath}${separator}api-version=${apiVersion}`;
  }

  private get commonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  async get<T>(relativePath: string, apiVersion?: string): Promise<T> {
    const url = this.buildUrl(relativePath, apiVersion);
    const response = await this.fetchWithRetry(url, { headers: this.commonHeaders });
    return this.handleResponse<T>(response, url);
  }

  async getOrgLevel<T>(relativePath: string, apiVersion?: string): Promise<T> {
    const url = this.buildOrgUrl(relativePath, apiVersion);
    const response = await this.fetchWithRetry(url, { headers: this.commonHeaders });
    return this.handleResponse<T>(response, url);
  }

  async post<T>(
    relativePath: string,
    body: unknown,
    contentType?: string,
    apiVersion?: string,
  ): Promise<T> {
    const url = this.buildUrl(relativePath, apiVersion);
    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: { ...this.commonHeaders, 'Content-Type': contentType ?? 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response, url);
  }

  async patch<T>(relativePath: string, body: unknown, contentType?: string): Promise<T> {
    const url = this.buildUrl(relativePath);
    const response = await this.fetchWithRetry(url, {
      method: 'PATCH',
      headers: { ...this.commonHeaders, 'Content-Type': contentType ?? 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response, url);
  }

  async delete(relativePath: string): Promise<void> {
    const url = this.buildUrl(relativePath);
    const response = await this.fetchWithRetry(url, {
      method: 'DELETE',
      headers: this.commonHeaders,
    });

    if (response.status === 401 || response.status === 403) {
      throw new AdoAuthError(`Azure DevOps authentication failed (${response.status}).`);
    }

    if (!response.ok) {
      throw new AdoApiError(
        `Azure DevOps API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }
  }

  async getStream(relativePath: string): Promise<Blob> {
    const url = this.buildUrl(relativePath);
    const response = await this.fetchWithRetry(url, { headers: this.commonHeaders });

    if (response.status === 401 || response.status === 403) {
      throw new AdoAuthError(`Azure DevOps authentication failed (${response.status}).`);
    }

    if (!response.ok) {
      throw new AdoApiError(
        `Azure DevOps API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    return response.blob();
  }

  /**
   * Verify the current credentials by GETting the project metadata.
   * Uses the configured auth method — no extra args required.
   *
   * Returns a human-readable string on HTTP-level failures, `null` on
   * success. Structured errors from `ado_resolve_auth_header` (e.g.
   * `AzNotInstalled`, `AzNotLoggedIn`) are re-thrown so the UI can
   * match on their `kind` field and render mode-specific copy.
   */
  async testConnection(): Promise<string | null> {
    try {
      const url = `https://dev.azure.com/${encodeURIComponent(this.org)}/_apis/projects/${encodeURIComponent(this.project)}?api-version=7.1`;
      const response = await this.fetchWithRetry(url, { headers: this.commonHeaders });

      if (response.status === 401) return 'Authentication failed. Check your credentials.';
      if (response.status === 404) return 'Organization or project not found.';

      if (!response.ok) {
        return `Connection failed: ${response.status} ${response.statusText}`;
      }

      return null;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') return 'Connection timed out.';
        return `Connection failed: ${error.message}`;
      }
      // Non-Error values (structured Tauri errors from the resolver)
      // surface unchanged so the caller can dispatch on `kind`.
      throw error;
    }
  }

  private async handleResponse<T>(response: Response, url: string): Promise<T> {
    if (response.status === 401 || response.status === 403) {
      throw new AdoAuthError(`Azure DevOps authentication failed (${response.status}).`);
    }

    // An expired az-cli / cookie session makes dev.azure.com bounce to the
    // sign-in page: a 302 (when the transport doesn't follow it) or a 200
    // with an HTML body. Either way there's no JSON to parse.
    if (REDIRECT_STATUS_CODES.has(response.status)) {
      throw new AdoAuthExpiredError();
    }

    if (!response.ok) {
      throw new AdoApiError(
        `Azure DevOps API error: ${response.status} ${response.statusText} for ${url}`,
        response.status,
      );
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('text/html')) {
      throw new AdoAuthExpiredError();
    }
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }

    // No/unknown content-type (some proxies, tests): sniff before parsing so a
    // login page never surfaces as a bare JSON SyntaxError every poll cycle.
    const text = await response.text();
    const trimmed = text.trimStart();
    if (trimmed.startsWith('<')) {
      throw new AdoAuthExpiredError();
    }
    if (trimmed.length === 0) {
      return undefined as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AdoApiError(
        `Azure DevOps returned a non-JSON response (${contentType || 'no content-type'}) for ${url}`,
        response.status,
      );
    }
  }
}

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * The ADO session behind the auth header is gone (typically an expired
 * `az login`): the service answers with its sign-in page instead of JSON.
 * Distinct from {@link AdoAuthError} (a real 401/403) so callers can show
 * "sign in again" once instead of logging a parse error every cycle.
 */
export class AdoAuthExpiredError extends Error {
  constructor(message = 'Azure DevOps sign-in expired — run `az login` and refresh.') {
    super(message);
    this.name = 'AdoAuthExpiredError';
  }
}

/** Duck-typed so it works across module mocks and realm boundaries. */
export function isAdoAuthExpiredError(err: unknown): err is AdoAuthExpiredError {
  return (
    err instanceof AdoAuthExpiredError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { name?: unknown }).name === 'AdoAuthExpiredError')
  );
}

export class AdoAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdoAuthError';
  }
}

export class AdoApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdoApiError';
    this.status = status;
  }
}
