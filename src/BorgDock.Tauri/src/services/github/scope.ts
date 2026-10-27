/**
 * A scope is one repository as one account sees it on one GitHub host:
 * the boundary CI failures and activity never cross.
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

/**
 * The scope with the empty default account replaced by the login the client
 * actually reads with. The active gh account can change under the app, so a
 * scope that leaves the account empty could reuse one account's baseline for
 * another.
 */
export function resolvedScope(scope: string, login: string): string {
  const parts = parseScope(scope);
  if (!parts) return scope;
  return scopeOf({ ...parts, account: parts.account || login });
}
