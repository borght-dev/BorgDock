/**
 * Identity of CI failure observations. A scope is the boundary nothing
 * crosses: one repository as one account sees it on one GitHub host.
 */

export const GITHUB_HOST = 'github.com';

export interface ScopeParts {
  host: string;
  account: string;
  owner: string;
  repo: string;
}

/** `github.com|<account>|<owner>/<repo>`, lower-case; the account is empty for the default one. */
export function scopeOf({ host, account, owner, repo }: ScopeParts): string {
  return `${host}|${account.trim().toLowerCase()}|${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function parseScope(scope: string): ScopeParts | null {
  const [host, account, path] = scope.split('|');
  const [owner, repo] = (path ?? '').split('/');
  if (!host || account === undefined || !owner || !repo) return null;
  return { host, account, owner, repo };
}

/** Scopes in the same account on the same host, the only ones cross-repo suggestions compare. */
export function sameAccount(a: string, b: string): boolean {
  const left = parseScope(a);
  const right = parseScope(b);
  return !!left && !!right && left.host === right.host && left.account === right.account;
}

/**
 * GitHub gives every job attempt its own job id, so a rerun is a new
 * occurrence, never an edit of an old one.
 */
export function jobOccurrenceId(scope: string, jobId: number): string {
  return `${scope}#job:${jobId}`;
}

/** Commit statuses have no attempts: one occurrence per context and commit. */
export function statusOccurrenceId(scope: string, sha: string, context: string): string {
  return `${scope}#status:${sha}:${context}`;
}

/**
 * The job's base name and matrix values, from GitHub's default
 * `build (18.x, ubuntu-latest)` naming. A custom `name:` without the suffix
 * has no values; the API has no structured matrix, so this is a heuristic.
 */
export function parseMatrix(jobName: string): { base: string; values: string[] } {
  const match = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(jobName.trim());
  if (!match?.[1] || !match[2]) return { base: jobName.trim(), values: [] };
  return {
    base: match[1],
    values: match[2]
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}
