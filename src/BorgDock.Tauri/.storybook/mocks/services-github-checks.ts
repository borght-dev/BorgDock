// .storybook/mocks/services-github-checks.ts
//
// Drop-in replacement for @/services/github/checks. PR Detail uses
// getCheckRunsForRef(); other exports (getCheckSuites, getCheckRuns,
// getJobLog, rerunWorkflow) aren't called by any PR-Detail story.
//
// To stub a never-resolving fetch:
//   getControl().githubResponses.getCheckRunsForRef = () => new Promise(() => {});
// To stub a rejection:
//   getControl().githubResponses.getCheckRunsForRef = () => Promise.reject(new Error('boom'));

import type { CheckRun } from '../../src/types/check-run';
import { getControl } from './control';

export async function getCheckRunsForRef(
  _client: unknown,
  _owner: string,
  _repo: string,
  ref: string,
): Promise<CheckRun[]> {
  const r = getControl().githubResponses.getCheckRunsForRef;
  if (typeof r === 'function') return r({ ref });
  return r ?? [];
}
