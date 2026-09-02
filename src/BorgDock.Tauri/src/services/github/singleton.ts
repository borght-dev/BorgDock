import { GitHubClient } from './client';

const DEFAULT_ACCOUNT = '__active__';
const clients = new Map<string, GitHubClient>();
const repoAccounts = new Map<string, string>();

function accountKey(account?: string): string {
  return account?.trim().toLowerCase() || DEFAULT_ACCOUNT;
}

export function initClient(tokenGetter: () => Promise<string>, account?: string): GitHubClient {
  const key = accountKey(account);
  const client = new GitHubClient(tokenGetter, account?.trim() ?? '');
  clients.set(key, client);
  return client;
}

export function getClient(account?: string): GitHubClient | null {
  return clients.get(accountKey(account)) ?? null;
}

export function bindRepoClient(owner: string, repo: string, account?: string): void {
  repoAccounts.set(`${owner}/${repo}`.toLowerCase(), accountKey(account));
}

export function getClientForRepo(owner: string, repo: string): GitHubClient | null {
  const key = repoAccounts.get(`${owner}/${repo}`.toLowerCase()) ?? DEFAULT_ACCOUNT;
  return clients.get(key) ?? clients.get(DEFAULT_ACCOUNT) ?? null;
}

export function resetClient(): void {
  clients.clear();
  repoAccounts.clear();
}
