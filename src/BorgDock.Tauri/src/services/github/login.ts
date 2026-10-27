import type { GitHubClient } from './client';

/**
 * The login a client actually reads with. A client bound to an account is
 * that account; the default one follows whichever account gh has active,
 * which can change while the app runs, so its answer is asked again every
 * few minutes.
 */
const FRESH_FOR_MS = 5 * 60_000;
const known = new WeakMap<GitHubClient, { login: string; at: number }>();

export async function resolvedLogin(
  client: GitHubClient,
  now: number = Date.now(),
): Promise<string | null> {
  if (client.account) return client.account.toLowerCase();
  const cached = known.get(client);
  if (cached && now - cached.at < FRESH_FOR_MS) return cached.login;
  try {
    const user = await client.get<{ login?: string }>('user');
    const login = user.login?.toLowerCase();
    if (!login) return cached?.login ?? null;
    known.set(client, { login, at: now });
    return login;
  } catch {
    return cached?.login ?? null;
  }
}
