import { getPRFiles, getPRReviewDetails } from '@/services/github/pulls';
import type { DiffFile, DiffLine, PullRequest, PullRequestFileChange } from '@/types';
import type { GitHubClient } from './github/client';

export type ReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';
export interface ReviewCommentDraft {
  id: string;
  path: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  body: string;
  saved: boolean;
  outdated: boolean;
}
export interface ReviewDocument {
  headSha: string;
  baseSha: string;
  fingerprints: Record<string, string>;
  reviewed: string[];
  comments: ReviewCommentDraft[];
  body: string;
  event: ReviewEvent;
  step: string | null;
}
export interface ReviewFileGroup {
  name: string;
  files: DiffFile[];
}
export interface ReviewSnapshot {
  pr: PullRequest;
  baseSha: string;
  groups: ReviewFileGroup[];
  files: DiffFile[];
}

export const emptyReviewDocument: ReviewDocument = {
  headSha: '',
  baseSha: '',
  fingerprints: {},
  reviewed: [],
  comments: [],
  body: '',
  event: 'COMMENT',
  step: null,
};

export function reviewDocumentKey(pr: PullRequest, account: string) {
  return `${account.toLowerCase()}:${pr.repoOwner.toLowerCase()}/${pr.repoName.toLowerCase()}#${pr.number}`;
}

export function reviewFileCategory(path: string): 'source' | 'docs' | 'generated' | 'tests' {
  const normalized = path.replaceAll('\\', '/');
  if (/(^|\/)[^/]*\.Tests(\/|$)|(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\./i.test(normalized))
    return 'tests';
  if (
    /(^|\/)(generated|dist|obj|bin)(\/|$)|\.(generated|g)\.|(^|\/)(bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock)$/i.test(
      normalized,
    )
  )
    return 'generated';
  if (/(^|\/)(docs?|documentation)(\/|$)|\.(md|mdx|rst)$/i.test(normalized)) return 'docs';
  return 'source';
}

export function toReviewDiffFile(file: PullRequestFileChange): DiffFile {
  return {
    ...file,
    sha: file.sha ?? '',
    status: ['added', 'removed', 'renamed', 'copied'].includes(file.status)
      ? (file.status as DiffFile['status'])
      : 'modified',
    isBinary:
      !file.patch && file.additions === 0 && file.deletions === 0 && file.status !== 'renamed',
    isTruncated: !file.patch && file.additions + file.deletions > 0,
  };
}

export function groupReviewFiles(files: PullRequestFileChange[]): ReviewFileGroup[] {
  const rank = { source: 0, docs: 1, generated: 2, tests: 3 };
  const groups = new Map<string, ReviewFileGroup>();
  const sorted = files
    .map(toReviewDiffFile)
    .sort(
      (a, b) =>
        rank[reviewFileCategory(a.filename)] - rank[reviewFileCategory(b.filename)] ||
        a.filename.localeCompare(b.filename, undefined, { numeric: true }),
    );
  for (const file of sorted) {
    const category = reviewFileCategory(file.filename);
    const folder = file.filename.split('/').slice(0, -1).join('/') || 'Root files';
    const name =
      category === 'tests'
        ? 'Tests'
        : category === 'docs'
          ? 'Documentation'
          : category === 'generated'
            ? 'Generated & lockfiles'
            : folder;
    const group = groups.get(name) ?? { name, files: [] };
    group.files.push(file);
    groups.set(name, group);
  }
  return [...groups.values()];
}

// Includes the patch, because changes to the base can move line anchors without changing a file's blob SHA.
export function reviewFileFingerprint(file: DiffFile) {
  // A compact, deterministic cache key, not a security hash. Two independent
  // accumulators avoid persisting entire patches with every draft keystroke.
  const value = JSON.stringify([file.sha, file.status, file.previousFilename, file.patch]);
  let first = 2166136261;
  let second = 5381;
  for (let i = 0; i < value.length; i++) {
    first = Math.imul(first ^ value.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ value.charCodeAt(i);
  }
  return `${file.sha}:${value.length}:${first >>> 0}:${second >>> 0}`;
}

export function reconcileReviewDocument(
  doc: ReviewDocument,
  snapshot: ReviewSnapshot,
): ReviewDocument {
  const fingerprints = Object.fromEntries(
    snapshot.files.map((f) => [f.filename, reviewFileFingerprint(f)]),
  );
  const unchanged = (path: string) =>
    fingerprints[path] !== undefined && fingerprints[path] === doc.fingerprints[path];
  return {
    ...doc,
    headSha: snapshot.pr.headSha ?? '',
    baseSha: snapshot.baseSha,
    fingerprints,
    reviewed: doc.reviewed.filter(unchanged),
    comments: doc.comments.map((c) => ({ ...c, outdated: c.outdated || !unchanged(c.path) })),
    step: doc.step && fingerprints[doc.step] !== undefined ? doc.step : null,
  };
}

export function reviewLineAnchor(line: DiffLine): { line: number; side: 'LEFT' | 'RIGHT' } | null {
  if (line.type === 'hunk-header') return null;
  const number = line.type === 'delete' ? line.oldLineNumber : line.newLineNumber;
  return number == null ? null : { line: number, side: line.type === 'delete' ? 'LEFT' : 'RIGHT' };
}

export async function loadReviewSnapshot(
  client: GitHubClient,
  pr: PullRequest,
): Promise<ReviewSnapshot> {
  const before = await getPRReviewDetails(client, pr.repoOwner, pr.repoName, pr.number);
  const files = await getPRFiles(client, pr.repoOwner, pr.repoName, pr.number);
  const after = await getPRReviewDetails(client, pr.repoOwner, pr.repoName, pr.number);
  if (
    !before.pr.headSha ||
    before.pr.headSha !== after.pr.headSha ||
    before.baseSha !== after.baseSha
  )
    throw new Error('This PR changed while loading. Reload to review the latest changes.');
  if (files.length !== after.pr.changedFiles)
    throw new Error(
      'GitHub did not return every changed file. Reload or review this PR on GitHub.',
    );
  const groups = groupReviewFiles(files);
  return { pr: after.pr, baseSha: after.baseSha, groups, files: groups.flatMap((g) => g.files) };
}
