import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { UserError } from '../service.ts';

const run = promisify(execFile);
const API = 'https://api.github.com';
const TOKEN_TTL_MS = 10 * 60_000;
const ETAG_ENTRIES = 300;

/** A GitHub failure the routes answer as is: 404 stays 404, a moved head 409, the rest 502. */
export class GithubError extends UserError {
  readonly githubStatus: number;
  constructor(githubStatus: number, message: string) {
    super(message, githubStatus === 404 ? 404 : githubStatus === 409 ? 409 : githubStatus === 422 ? 400 : 502);
    this.githubStatus = githubStatus;
  }
}

/** Where tokens come from: `gh` on this machine. Tests pass their own. */
export type TokenSource = { accounts(): Promise<string[]>; token(login: string): Promise<string> };

export class GhTokens implements TokenSource {
  private readonly cache = new Map<string, { token: string; at: number }>();

  async accounts(): Promise<string[]> {
    try {
      const { stdout } = await run('gh', ['auth', 'status', '--json', 'hosts'], { timeout: 15_000 });
      const hosts = JSON.parse(stdout).hosts as Record<string, { login: string; state: string }[]>;
      return (hosts['github.com'] ?? []).filter((h) => h.state === 'success').map((h) => h.login);
    } catch {
      return [];
    }
  }

  async token(login: string): Promise<string> {
    const cached = this.cache.get(login);
    if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.token;
    try {
      const { stdout } = await run('gh', ['auth', 'token', '--user', login], { timeout: 15_000 });
      const token = stdout.trim();
      this.cache.set(login, { token, at: Date.now() });
      return token;
    } catch {
      throw new GithubError(401, `gh has no token for ${login}. Run gh auth login on the server's machine.`);
    }
  }
}

type Fetch = typeof fetch;

/** One GitHub account's reads and writes. GETs remember their ETag, so an unchanged answer costs no rate limit. */
export class GithubClient {
  readonly login: string;
  private readonly tokens: TokenSource;
  private readonly fetch: Fetch;
  private readonly etags = new Map<string, { etag: string; body: unknown }>();

  constructor(login: string, tokens: TokenSource, fetchImpl: Fetch = fetch) {
    this.login = login;
    this.tokens = tokens;
    this.fetch = fetchImpl;
  }

  private async headers(extra: Record<string, string> = {}) {
    return {
      authorization: `Bearer ${await this.tokens.token(this.login)}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'BorgDock',
      ...extra,
    };
  }

  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await this.send(`${API}/graphql`, { method: 'POST', headers: await this.headers({ 'content-type': 'application/json' }), body: JSON.stringify({ query, variables }) });
    const body = (await response.json().catch(() => null)) as { data?: T; errors?: { message: string; type?: string }[] } | null;
    if (!response.ok) throw new GithubError(response.status, failure(response.status, body));
    if (body?.errors?.length && !body.data) throw new GithubError(body.errors[0].type === 'NOT_FOUND' ? 404 : 502, `GitHub: ${body.errors[0].message}`);
    if (body?.errors?.length) {
      const notFound = body.errors.find((e) => e.type === 'NOT_FOUND');
      if (notFound) throw new GithubError(404, `GitHub: ${notFound.message}`);
    }
    return body!.data as T;
  }

  async rest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${API}${path}`;
    const cached = method === 'GET' ? this.etags.get(url) : undefined;
    const headers = await this.headers({
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cached ? { 'if-none-match': cached.etag } : {}),
    });
    const response = await this.send(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 304 && cached) return cached.body as T;
    const text = await response.text();
    const parsed = text ? safeJson(text) : null;
    if (!response.ok) throw new GithubError(response.status, failure(response.status, parsed));
    const etag = response.headers.get('etag');
    if (method === 'GET' && etag) {
      this.etags.delete(url);
      this.etags.set(url, { etag, body: parsed });
      if (this.etags.size > ETAG_ENTRIES) this.etags.delete(this.etags.keys().next().value!);
    }
    return parsed as T;
  }

  /**
   * The last `maxBytes` of a job's log, or null when GitHub has none. The redirect is followed by hand so the token
   * never reaches the storage host, and storage is asked for the tail only.
   */
  async logTail(owner: string, repo: string, jobId: number, maxBytes = 65_536): Promise<string | null> {
    const response = await this.send(`${API}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, { method: 'GET', headers: await this.headers(), redirect: 'manual' });
    let storage: Response = response;
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new GithubError(502, 'GitHub redirected the log without a location.');
      storage = await this.send(location, { method: 'GET', headers: { range: `bytes=-${maxBytes}`, 'user-agent': 'BorgDock' } });
      if (storage.status === 416) return '';
      if (storage.status === 404) return null;
    } else if (response.status === 404 || response.status === 410) return null;
    if (!storage.ok) throw new GithubError(storage.status, `Reading the log failed (${storage.status}).`);
    const bytes = new Uint8Array(await storage.arrayBuffer());
    const truncated = storage.status === 206 || bytes.length > maxBytes;
    let text = new TextDecoder().decode(bytes.length > maxBytes ? bytes.slice(bytes.length - maxBytes) : bytes);
    // A tail starts mid-line; that first part line is noise.
    if (truncated && text.includes('\n')) text = text.slice(text.indexOf('\n') + 1);
    return text;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new GithubError(502, `Could not reach GitHub: ${(error as Error).message}`);
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function failure(status: number, body: unknown): string {
  const message = typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : null;
  if (status === 401) return 'GitHub rejected the token. Run gh auth login on the server\'s machine.';
  if (status === 403 && message?.toLowerCase().includes('rate limit')) return 'GitHub\'s rate limit is used up. Try again in a few minutes.';
  return `GitHub: ${message ?? `answered ${status}`}`;
}
