// .storybook/mocks/services-github-auth.ts
//
// Drop-in replacement for @/services/github/auth. Returns a token from
// the storybook control surface, or echoes the PAT it was passed.
// invalidateGitHubTokenCache() is a no-op; no PR-Detail story exercises
// the cache-invalidation path.

import { getControl } from './control';

export async function getGitHubToken(patFromSettings?: string): Promise<string> {
  const getter = getControl().githubResponses.tokenGetter;
  if (typeof getter === 'function') return getter();
  return patFromSettings ?? 'gh_storybook_dummy_token';
}

export function invalidateGitHubTokenCache(): void {
  // no-op in storybook
}
