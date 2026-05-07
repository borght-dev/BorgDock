// .storybook/mocks/services-github-reviews.ts
//
// Drop-in replacement for @/services/github/reviews. DiscussionTab imports
// getAllComments and getReviews from the @/services/github barrel. This stub
// lets those barrel consumers resolve without hitting the production module.
//
// If a future story needs specific review data, expand githubResponses in
// control.ts and read from it here (mirroring the pulls mock pattern).

import { getControl } from './control';

export async function getReviews(
  _client: unknown,
  _owner: string,
  _repo: string,
  _prNumber: number,
): Promise<unknown[]> {
  const r = getControl().githubResponses.getReviews;
  if (typeof r === 'function') return r();
  return r ?? [];
}

export async function getReviewComments(
  _client: unknown,
  _owner: string,
  _repo: string,
  _prNumber: number,
): Promise<unknown[]> {
  return [];
}

export async function getBotReviewComments(
  _client: unknown,
  _owner: string,
  _repo: string,
  _prNumber: number,
): Promise<unknown[]> {
  return [];
}

export async function getAllComments(
  _client: unknown,
  _owner: string,
  _repo: string,
  _prNumber: number,
): Promise<unknown[]> {
  const r = getControl().githubResponses.getAllComments;
  if (typeof r === 'function') return r();
  return r ?? [];
}

export function detectSeverity(_body: string): string {
  return 'none';
}

export function splitStructuredReview(comment: unknown): unknown[] {
  return [comment];
}
