// A stand-in for api.github.com and its log storage: answers recorded-shape responses and records every request.
// Tests never reach the real GitHub.

import type { TokenSource } from '../../src/github/client.ts';
import type { RawPr } from '../../src/github/queries.ts';

export type Seen = { method: string; url: string; headers: Record<string, string>; body: any; operation: string | null };
type Answer = { status?: number; body?: unknown; headers?: Record<string, string>; text?: string };
type Handler = (request: Seen) => Answer | undefined | Promise<Answer | undefined>;

export class FakeGithub {
  readonly seen: Seen[] = [];
  private readonly graphql = new Map<string, Handler>();
  private readonly rest: { method: string; pattern: RegExp; handler: Handler }[] = [];

  /** Answers a GraphQL operation by its name (`query FocusSearch`), per account when the handler looks at the token. */
  onGraphql(operation: string, handler: Handler | Record<string, unknown>) {
    this.graphql.set(operation, typeof handler === 'function' ? (handler as Handler) : () => ({ body: { data: handler } }));
  }

  onRest(method: string, pattern: RegExp, handler: Handler | Record<string, unknown> | unknown[]) {
    this.rest.unshift({ method, pattern, handler: typeof handler === 'function' ? (handler as Handler) : () => ({ body: handler }) });
  }

  requests(method: string, pattern: RegExp) {
    return this.seen.filter((s) => s.method === method && pattern.test(s.url));
  }

  operations(name: string) {
    return this.seen.filter((s) => s.operation === name);
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const method = init?.method ?? 'GET';
    const operation = url.endsWith('/graphql') ? (/(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? null) : null;
    const request: Seen = { method, url, headers, body, operation };
    this.seen.push(request);
    let answer: Answer | undefined;
    if (operation) answer = await this.graphql.get(operation)?.(request);
    else answer = await this.rest.find((r) => r.method === method && r.pattern.test(url))?.handler(request);
    if (!answer) return new Response(JSON.stringify({ message: `Not Found (${method} ${url})` }), { status: 404 });
    const text = answer.text ?? (answer.body === undefined ? '' : JSON.stringify(answer.body));
    return new Response(answer.status === 304 ? null : text, { status: answer.status ?? 200, headers: answer.headers });
  };
}

export const fakeTokens = (accounts = ['koen']): TokenSource => ({
  accounts: async () => accounts,
  token: async (login) => `token-of-${login}-0123456789`,
});

const DAY = 86_400_000;
export const NOW = Date.parse('2026-10-31T12:00:00Z');
export const ago = (ms: number) => new Date(NOW - ms).toISOString();
export const hours = (n: number) => n * 3_600_000;
export const days = (n: number) => n * DAY;

type Check = { name: string; conclusion?: string | null; status?: string; id?: number; runId?: number; workflow?: string; completedAt?: string };

export function checkRun(c: Check) {
  return {
    __typename: 'CheckRun', databaseId: c.id ?? 1, name: c.name, status: c.status ?? 'COMPLETED', conclusion: c.conclusion === undefined ? 'SUCCESS' : c.conclusion,
    startedAt: ago(hours(2)), completedAt: c.completedAt ?? ago(hours(1)), detailsUrl: `https://github.com/acme/shop/actions/runs/${c.runId ?? 1}/job/${c.id ?? 1}`,
    checkSuite: { workflowRun: { databaseId: c.runId ?? 1, workflow: { name: c.workflow ?? 'CI' } } },
  };
}

/** A pull request node in the shape GitHub's GraphQL search returns it (recorded from a real answer, then anonymised). */
export function rawPr(o: Partial<{
  number: number; title: string; body: string; author: string; authorName: string | null; draft: boolean; updatedAgo: number; createdAgo: number;
  head: string; headSha: string; base: string; mergeable: RawPr['mergeable']; requested: string[]; teams: string[]; autoMerge: boolean;
  reviews: { login: string; state: string; at?: string; sha?: string }[]; checks: Check[]; commits: string[]; owner: string; repo: string;
}> = {}): RawPr {
  const number = o.number ?? 1;
  const headSha = o.headSha ?? `sha${number}`;
  return {
    id: `PR_${number}`, number, title: o.title ?? `Pull request ${number}`, body: o.body ?? '', url: `https://github.com/${o.owner ?? 'acme'}/${o.repo ?? 'shop'}/pull/${number}`,
    isDraft: o.draft ?? false, state: 'OPEN', createdAt: ago(o.createdAgo ?? days(2)), updatedAt: ago(o.updatedAgo ?? hours(1)), mergedAt: null,
    additions: 10, deletions: 2, changedFiles: 1, headRefName: o.head ?? `feat/${number}-thing`, baseRefName: o.base ?? 'main', headRefOid: headSha,
    isCrossRepository: false, mergeable: o.mergeable ?? 'MERGEABLE', reviewDecision: null, autoMergeRequest: o.autoMerge ? { enabledAt: ago(hours(1)) } : null,
    author: { login: o.author ?? 'sanne', avatarUrl: `https://avatars.example/${o.author ?? 'sanne'}`, name: o.authorName === undefined ? 'Sanne de Vries' : o.authorName },
    repository: { name: o.repo ?? 'shop', owner: { login: o.owner ?? 'acme' }, defaultBranchRef: { name: 'main' } },
    labels: { nodes: [{ name: 'frontend', color: '1d76db' }] },
    reviewRequests: { nodes: [
      ...(o.requested ?? []).map((login) => ({ requestedReviewer: { __typename: 'User', login } })),
      ...(o.teams ?? []).map((slug) => ({ requestedReviewer: { __typename: 'Team', slug } })),
    ] },
    latestReviews: { nodes: (o.reviews ?? []).map((r) => ({ state: r.state, submittedAt: r.at ?? ago(hours(3)), author: { login: r.login }, commit: { oid: r.sha ?? headSha } })) },
    head: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: (o.checks ?? [{ name: 'build' }]).map(checkRun) as never[] } } } }] },
    recent: { nodes: (o.commits ?? [headSha]).map((oid) => ({ commit: { oid } })) },
  };
}

/** One page of a FocusSearch answer; `next` is the cursor of the page after it. */
export function searchAnswer(nodes: RawPr[], login = 'koen', next: string | null = null) {
  return {
    viewer: { login }, found: { pageInfo: { hasNextPage: next !== null, endCursor: next }, nodes },
    rateLimit: { cost: 1, remaining: 4990 },
  };
}
