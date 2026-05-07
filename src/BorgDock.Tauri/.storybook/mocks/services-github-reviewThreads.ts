// .storybook/mocks/services-github-reviewThreads.ts
//
// Drop-in replacement for @/services/github/reviewThreads. FilesTab calls
// getReviewThreads after files load. Stubs read from the control surface so
// stories can seed threads by setting:
//   getControl().githubResponses.getReviewThreads = [...]

import type { ReviewThread } from '../../src/types';
import { getControl } from './control';

export async function getReviewThreads(
  _client: unknown,
  _owner: string,
  _repo: string,
  _number: number,
  _filePatches: Map<string, string | undefined>,
): Promise<ReviewThread[]> {
  const r = getControl().githubResponses.getReviewThreads;
  if (typeof r === 'function') return r();
  return r ?? [];
}

export async function resolveReviewThread(
  _client: unknown,
  _threadId: string,
): Promise<void> {
  getControl().invocations.push({ command: 'github.resolveReviewThread', args: { _threadId } });
}

export async function unresolveReviewThread(
  _client: unknown,
  _threadId: string,
): Promise<void> {
  getControl().invocations.push({ command: 'github.unresolveReviewThread', args: { _threadId } });
}

/** Re-exported so the barrel's named export resolves correctly. */
export function buildSnippetFromPatch(
  patch: string | undefined,
  line: number,
): string {
  if (!patch) return '';
  const lines = patch.split('\n');
  return lines[line] ?? '';
}
