// .storybook/mocks/services-github-pulls.ts
//
// Drop-in replacement for @/services/github/pulls. The functions used
// by PR Detail are getOpenPRs() (called by PrDetailApp), and getPRFiles /
// getCommitFiles / getPRCommits (called by FilesTab and CommitsTab). All
// functions read their return value from the storybook control surface.
//
// To stub a never-resolving fetch:
//   getControl().githubResponses.getOpenPRs = () => new Promise(() => {});
// To stub a rejection:
//   getControl().githubResponses.getOpenPRs = () => Promise.reject(new Error('boom'));

import type { PullRequest, PullRequestCommit, PullRequestFileChange } from '../../src/types';
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

export async function getPRFiles(
  _client: unknown,
  _owner: string,
  _repo: string,
  _prNumber: number,
): Promise<PullRequestFileChange[]> {
  const r = getControl().githubResponses.getPRFiles;
  if (typeof r === 'function') return r();
  return r ?? [];
}

export async function getCommitFiles(
  _client: unknown,
  _owner: string,
  _repo: string,
  _commitSha: string,
): Promise<PullRequestFileChange[]> {
  const r = getControl().githubResponses.getCommitFiles;
  if (typeof r === 'function') return r();
  return r ?? [];
}

export async function getPRCommits(
  _client: unknown,
  _owner: string,
  _repo: string,
  _prNumber: number,
): Promise<PullRequestCommit[]> {
  const r = getControl().githubResponses.getPRCommits;
  if (typeof r === 'function') return r();
  return r ?? [];
}

// Re-export production helpers that FilesTab also imports from this module
// through the barrel (toDiffFile is exported directly from FilesTab, but
// getPRWithChecks / aggregateReviewStatus are barrel-only). We only need
// stubs that keep the module shape intact; stories don't invoke these directly.
export async function getPRWithChecks(): Promise<unknown> {
  return null;
}

export async function getClosedPRs(): Promise<PullRequest[]> {
  return [];
}
