// .storybook/mocks/services-github-reviews.ts
//
// Drop-in replacement for @/services/github/reviews. DiscussionTab imports
// getAllComments and getReviews from the @/services/github barrel. This stub
// lets those barrel consumers resolve without hitting the production module.
//
// Stories seed data via:
//   getControl().githubResponses.getReviews = [...]
//   getControl().githubResponses.getAllComments = [...]

import type { RawReview } from './control';
import { getControl } from './control';

export async function getReviews(
  _client: unknown,
  _owner: string,
  _repo: string,
  _prNumber: number,
): Promise<RawReview[]> {
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
): Promise<import('../../src/types/claude-review').ClaudeReviewComment[]> {
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
