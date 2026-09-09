import { describe, expect, it, vi } from 'vitest';
import { makePr } from '@/components/focus/__tests__/helpers';
import type { GitHubClient } from '../github/client';
import { getPRFiles, getPRReviewDetails } from '../github/pulls';
import {
  emptyReviewDocument,
  groupReviewFiles,
  loadReviewSnapshot,
  type ReviewSnapshot,
  reconcileReviewDocument,
  reviewDocumentKey,
  reviewFileCategory,
  reviewLineAnchor,
} from '../quick-review';

vi.mock('../github/pulls', () => ({ getPRFiles: vi.fn(), getPRReviewDetails: vi.fn() }));
describe('Review path', () => {
  it.each([
    'Domain.Tests/Orders/File.cs',
    'DOMAIN.TESTS/File.cs',
    'src/foo.test.tsx',
    'src/__tests__/foo.ts',
    'tests/foo.cs',
    'foo.spec.ts',
  ])('places %s last', (path) => expect(reviewFileCategory(path)).toBe('tests'));
  it('groups source directories and puts test files after documentation and generated files', () => {
    const names = [
      'A.Tests/test.cs',
      'src/Orders/B.ts',
      'docs/guide.md',
      'bun.lock',
      'src/Orders/A.ts',
      'src/foo.test.ts',
    ];
    const groups = groupReviewFiles(
      names.map((filename) => ({
        filename,
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: '@@ -0,0 +1 @@\n+line',
      })),
    );
    expect(groups.map((g) => g.name)).toEqual([
      'src/Orders',
      'Documentation',
      'Generated & lockfiles',
      'Tests',
    ]);
    expect(groups[0]!.files.map((f) => f.filename)).toEqual(['src/Orders/A.ts', 'src/Orders/B.ts']);
  });
  it('distinguishes binary, missing patch, and pure rename', () => {
    const files = groupReviewFiles([
      { filename: 'image.png', status: 'added', additions: 0, deletions: 0 },
      { filename: 'big.cs', status: 'modified', additions: 100, deletions: 20 },
      {
        filename: 'renamed.cs',
        previousFilename: 'old.cs',
        status: 'renamed',
        additions: 0,
        deletions: 0,
      },
    ]).flatMap((g) => g.files);
    expect(files.find((f) => f.filename === 'image.png')?.isBinary).toBe(true);
    expect(files.find((f) => f.filename === 'big.cs')?.isTruncated).toBe(true);
    expect(files.find((f) => f.filename === 'renamed.cs')).toMatchObject({
      isBinary: false,
      isTruncated: false,
      previousFilename: 'old.cs',
    });
  });
  it('anchors deletions on LEFT and context/additions on RIGHT', () => {
    expect(reviewLineAnchor({ type: 'delete', content: 'old', oldLineNumber: 8 })).toEqual({
      line: 8,
      side: 'LEFT',
    });
    expect(
      reviewLineAnchor({ type: 'context', content: 'same', oldLineNumber: 8, newLineNumber: 11 }),
    ).toEqual({ line: 11, side: 'RIGHT' });
    expect(reviewLineAnchor({ type: 'hunk-header', content: '@@' })).toBeNull();
  });
  it('keeps only unchanged reviewed files and retains outdated comments', () => {
    const groups = groupReviewFiles(
      ['a.cs', 'b.cs'].map((filename) => ({
        filename,
        sha: filename,
        status: 'modified',
        additions: 1,
        deletions: 1,
        patch: 'first',
      })),
    );
    const snapshot: ReviewSnapshot = {
      pr: makePr().pullRequest,
      baseSha: 'base',
      groups,
      files: groups.flatMap((g) => g.files),
    };
    let doc = reconcileReviewDocument(emptyReviewDocument, snapshot);
    doc = {
      ...doc,
      reviewed: ['a.cs', 'b.cs'],
      comments: [
        {
          id: 'one',
          path: 'a.cs',
          line: 1,
          side: 'RIGHT',
          body: 'Keep me',
          saved: true,
          outdated: false,
        },
      ],
    };
    const next = reconcileReviewDocument(doc, {
      ...snapshot,
      files: snapshot.files.map((f) => (f.filename === 'a.cs' ? { ...f, patch: 'changed' } : f)),
    });
    expect(next.reviewed).toEqual(['b.cs']);
    expect(next.comments[0]).toMatchObject({ body: 'Keep me', outdated: true });
  });
  it('separates repositories and GitHub accounts in draft keys', () => {
    const pr = makePr().pullRequest;
    expect(reviewDocumentKey(pr, 'a')).not.toBe(reviewDocumentKey(pr, 'b'));
    expect(reviewDocumentKey(pr, 'a')).not.toBe(
      reviewDocumentKey({ ...pr, repoName: 'other' }, 'a'),
    );
  });
  it('rejects a PR that moves while its files are loading', async () => {
    const pr = makePr({ changedFiles: 0 }).pullRequest;
    vi.mocked(getPRReviewDetails)
      .mockResolvedValueOnce({ pr, baseSha: 'base' })
      .mockResolvedValueOnce({ pr: { ...pr, headSha: 'changed' }, baseSha: 'base' });
    vi.mocked(getPRFiles).mockResolvedValueOnce([]);
    await expect(loadReviewSnapshot({} as GitHubClient, pr)).rejects.toThrow(
      'changed while loading',
    );
  });
  it('rejects an incomplete file list', async () => {
    const pr = makePr({ changedFiles: 1 }).pullRequest;
    vi.mocked(getPRReviewDetails).mockResolvedValue({ pr, baseSha: 'base' });
    vi.mocked(getPRFiles).mockResolvedValue([]);
    await expect(loadReviewSnapshot({} as GitHubClient, pr)).rejects.toThrow('every changed file');
  });
});
