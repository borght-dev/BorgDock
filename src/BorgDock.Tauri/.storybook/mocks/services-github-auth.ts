// .storybook/mocks/services-github-auth.ts
//
// Drop-in replacement for @/services/github/auth. Returns a token from
// the storybook control surface, or echoes the PAT it was passed.

import { getControl } from './control';

export async function getGitHubToken(patFromSettings?: string): Promise<string> {
  getControl().invocations.push({ command: 'github.getToken', args: { hasPat: !!patFromSettings } });
  const getter = getControl().githubResponses.tokenGetter;
  if (typeof getter === 'function') return getter();
  return patFromSettings ?? 'gh_storybook_dummy_token';
}

export function invalidateGitHubTokenCache(): void {
  getControl().invocations.push({ command: 'github.invalidateTokenCache' });
}
