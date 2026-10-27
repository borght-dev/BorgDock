// .storybook/mocks/services-github-checks.ts
//
// Drop-in replacement for @/services/github/checks. PR Detail uses
// getCheckRunsForRef(); other exports (getCheckSuites, getCheckRuns,
// readJobEvidence, rerunWorkflow) aren't called by any PR-Detail story.
//
// To stub a never-resolving fetch:
//   getControl().githubResponses.getCheckRunsForRef = () => new Promise(() => {});
// To stub a rejection:
//   getControl().githubResponses.getCheckRunsForRef = () => Promise.reject(new Error('boom'));

import type { JobLogEvidence } from '../../src/services/ci-failures/types';
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

/** Job log evidence for the Checks tab's "First failure" excerpt. Stories set `githubResponses.readJobEvidence`. */
export async function readJobEvidence(
  _client: unknown,
  _owner: string,
  _repo: string,
  jobId: number,
): Promise<JobLogEvidence> {
  const r = getControl().githubResponses.readJobEvidence;
  if (typeof r === 'function') return r({ jobId });
  if (r) return r;
  throw new Error('services-github-checks mock: no readJobEvidence response');
}

export async function rerunWorkflow(): Promise<void> {}

/** "Rerun affected" in the related CI failures sheet; stories only show the confirmation. */
export async function rerunFailedChecks(): Promise<{
  workflowRunIds: number[];
  checkSuiteIds: number[];
}> {
  return { workflowRunIds: [], checkSuiteIds: [] };
}
