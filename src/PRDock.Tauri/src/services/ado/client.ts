const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503]);
const MAX_RETRIES = 3;

export class AdoClient {
  private readonly org: string;
  private readonly project: string;
  private readonly pat: string;
  private readonly authHeader: string;

  constructor(org: string, project: string, pat: string) {
    this.org = org;
    this.project = project;
    this.pat = pat;
    this.authHeader = `Basic ${btoa(`:${pat}`)}`;
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, init);
      if (!TRANSIENT_STATUS_CODES.has(response.status) || attempt === MAX_RETRIES) {
        return response;
      }
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 || 1000 : 1000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
    throw new Error('Retry loop exhausted');
  }

  get isConfigured(): boolean {
    return (
      this.org.trim().length > 0 && this.project.trim().length > 0 && this.pat.trim().length > 0
    );
  }

  private get baseUrl(): string {
    return `https://dev.azure.com/${encodeURIComponent(this.org)}/${encodeURIComponent(this.project)}/_apis`;
  }

  private buildUrl(relativePath: string, apiVersion = '7.1'): string {
    const separator = relativePath.includes('?') ? '&' : '?';
    return `${this.baseUrl}/${relativePath}${separator}api-version=${apiVersion}`;
  }

  private buildOrgUrl(relativePath: string): string {
    const separator = relativePath.includes('?') ? '&' : '?';
    return `https://dev.azure.com/${encodeURIComponent(this.org)}/_apis/${relativePath}${separator}api-version=7.1`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
    };
  }

  async get<T>(relativePath: string, apiVersion?: string): Promise<T> {
    const url = this.buildUrl(relativePath, apiVersion);
    const response = await this.fetchWithRetry(url, { headers: this.headers });
    return this.handleResponse<T>(response, url);
  }

  async getOrgLevel<T>(relativePath: string): Promise<T> {
    const url = this.buildOrgUrl(relativePath);
    const response = await this.fetchWithRetry(url, { headers: this.headers });
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
      headers: {
        ...this.headers,
        'Content-Type': contentType ?? 'application/json',
      },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response, url);
  }

  async patch<T>(relativePath: string, body: unknown, contentType?: string): Promise<T> {
    const url = this.buildUrl(relativePath);
    const response = await this.fetchWithRetry(url, {
      method: 'PATCH',
      headers: {
        ...this.headers,
        'Content-Type': contentType ?? 'application/json',
      },
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response, url);
  }

  async delete(relativePath: string): Promise<void> {
    const url = this.buildUrl(relativePath);
    const response = await this.fetchWithRetry(url, {
      method: 'DELETE',
      headers: this.headers,
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
    const response = await this.fetchWithRetry(url, { headers: this.headers });

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

  async testConnection(organization: string, project: string, pat: string): Promise<string | null> {
    try {
      const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects/${encodeURIComponent(project)}?api-version=7.1`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${btoa(`:${pat}`)}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) return 'Invalid Personal Access Token.';
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
      return 'Connection failed: Unknown error';
    }
  }

  private async handleResponse<T>(response: Response, url: string): Promise<T> {
    if (response.status === 401 || response.status === 403) {
      throw new AdoAuthError(`Azure DevOps authentication failed (${response.status}).`);
    }

    if (!response.ok) {
      throw new AdoApiError(
        `Azure DevOps API error: ${response.status} ${response.statusText} for ${url}`,
        response.status,
      );
    }

    return (await response.json()) as T;
  }
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
