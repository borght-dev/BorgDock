// .storybook/mocks/services-github-mutations.ts
//
// Drop-in replacement for @/services/github/mutations. DiscussionTab imports
// postComment and submitReview to back its composer. In Storybook we record
// the invocation rather than hitting GitHub.

import { getControl } from './control';

export async function submitReview(
  _client: unknown,
  _owner: string,
  _repo: string,
  _prNumber: number,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
  body?: string,
): Promise<void> {
  getControl().invocations.push({ command: 'github.submitReview', args: { event, body } });
}

export async function postComment(
  _client: unknown,
  _owner: string,
  _repo: string,
  _prNumber: number,
  body: string,
): Promise<void> {
  getControl().invocations.push({ command: 'github.postComment', args: { body } });
}

export async function mergePullRequest(
  _client: unknown,
  _owner: string,
  _repo: string,
  _prNumber: number,
  _method?: string,
): Promise<void> {
  getControl().invocations.push({ command: 'github.mergePullRequest' });
}

export async function bypassMergePullRequest(
  _owner: string,
  _repo: string,
  _prNumber: number,
): Promise<void> {
  getControl().invocations.push({ command: 'github.bypassMergePullRequest' });
}
