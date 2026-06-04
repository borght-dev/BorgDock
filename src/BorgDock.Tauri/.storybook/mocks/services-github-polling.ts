// .storybook/mocks/services-github-polling.ts
//
// Drop-in replacement for @/services/github/polling. Stories that exercise
// the polling cycle stub responses via:
//   getControl().githubResponses.pollOpenPrsAggregate = [prWithChecksFixture];
// or a function for pending/rejected promises:
//   getControl().githubResponses.pollOpenPrsAggregate = () => new Promise(() => {});

import type { PullRequestWithChecks } from '../../src/types';
import { getControl } from './control';

export const POLL_OPEN_PRS_QUERY = '<<storybook mock>>';

export async function pollOpenPrsAggregate(
  _client: unknown,
  owner: string,
  repo: string,
): Promise<PullRequestWithChecks[]> {
  const r = getControl().githubResponses.pollOpenPrsAggregate;
  if (typeof r === 'function') return r({ owner, repo });
  return r ?? [];
}
