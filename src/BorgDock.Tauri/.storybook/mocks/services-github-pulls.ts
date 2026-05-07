// .storybook/mocks/services-github-pulls.ts
//
// Drop-in replacement for @/services/github/pulls. The functions used
// by PR Detail are getOpenPRs() (called by PrDetailApp). Other exports
// from the production module aren't called by any PR-Detail story; if a
// future story needs them, add them here using the same getControl()
// pattern.
//
// To stub a never-resolving fetch:
//   getControl().githubResponses.getOpenPRs = () => new Promise(() => {});
// To stub a rejection:
//   getControl().githubResponses.getOpenPRs = () => Promise.reject(new Error('boom'));

import type { PullRequest } from '../../src/types/pull-request';
import { getControl } from './control';

export async function getOpenPRs(
  _client: unknown,
  owner: string,
  repo: string,
  _options: { hydrateDetails?: boolean } = {},
): Promise<PullRequest[]> {
  const r = getControl().githubResponses.getOpenPRs;
  if (typeof r === 'function') return r({ owner, repo });
  return r ?? [];
}
