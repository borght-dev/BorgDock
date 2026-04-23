import { GitHubClient } from './client';

let client: GitHubClient | null = null;

export function initClient(tokenGetter: () => Promise<string>): GitHubClient {
  client = new GitHubClient(tokenGetter);
  return client;
}

export function getClient(): GitHubClient | null {
  return client;
}

export function resetClient(): void {
  client = null;
}
