import { describe, expect, it, vi } from 'vitest';
import { makePr } from '@/components/focus/__tests__/helpers';
import type { GitHubClient } from '../github/client';
import { getPRFiles, getPRReviewDetails } from '../github/pulls';
import {
  emptyReviewDocument,
  groupReviewFiles,
  isGeneratedPath,
  loadReviewSnapshot,
  markGeneratedReviewed,
  normalizeReviewDocument,
  type ReviewSnapshot,
  reconcileReviewDocument,
  reviewDocumentKey,
  reviewFileCategory,
  reviewFolderSummary,
  reviewLineAnchor,
  reviewProgress,
  unreviewedLabel,
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

describe('Generated files', () => {
  it.each([
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'src/BorgDock.Tauri/package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'Cargo.lock',
    'src-tauri/Cargo.lock',
    'api.generated.ts',
    'Models/Order.g.cs',
    'lib/models/order.g.dart',
    'src/api/client.g.ts',
    'src/generated/changelog.ts',
    'src/generated/deep/nested/file.ts',
    'src\\generated\\changelog.ts',
    'src/__snapshots__/Row.test.tsx.snap',
    'public/vendor/lib.min.js',
    'dist/app.js.map',
    'public/styles.css.map',
    'dist/app.js',
    'obj/Debug/App.dll',
    'App.Api/obj/Debug/App.dll',
    'site/dist/index.html',
  ])('%s is generated', (path) => expect(isGeneratedPath(path)).toBe(true));

  it.each([
    'src/services/quick-review.ts',
    'src/components/pr/PrRow.tsx',
    'src-tauri/src/bin/main.rs',
    'docs/generated-code.md',
    'src/generatedHelpers.ts',
    'src/lockfile.ts',
    'package.json',
    'Cargo.toml',
    'src/min.js',
    'src/map.ts',
    'src/roadmap.map',
    'src/data/world.map',
    'src/Order.g.json',
    'src/obj/Order.cs',
    'src/app/dist/index.ts',
    'packages/web/src/dist/x.ts',
    'CHANGELOG.md',
  ])('%s is not generated', (path) => expect(isGeneratedPath(path)).toBe(false));

  it('groups generated files with the lockfiles', () => {
    expect(reviewFileCategory('src/generated/changelog.ts')).toBe('generated');
    expect(reviewFileCategory('public/lib.min.js')).toBe('generated');
    // Tests stay tests, even when a snapshot is also skippable.
    expect(reviewFileCategory('src/__tests__/__snapshots__/a.snap')).toBe('tests');
    expect(isGeneratedPath('src/__tests__/__snapshots__/a.snap')).toBe(true);
  });
});

describe('Review progress', () => {
  const paths = [
    'src/services/a.ts',
    'src/services/b.ts',
    'src/components/pr/Row.tsx',
    'README.md',
    'bun.lock',
    'src/generated/changelog.ts',
  ];

  it('counts files per folder, biggest first, generated pooled last', () => {
    expect(reviewFolderSummary(paths)).toEqual([
      { folder: 'src/services', count: 2, generated: false },
      { folder: '/', count: 1, generated: false },
      { folder: 'src/components/pr', count: 1, generated: false },
      { folder: 'generated', count: 2, generated: true },
    ]);
  });

  it('leaves generated files out of what is left to review', () => {
    expect(reviewProgress(paths, [])).toEqual({
      total: 6,
      reviewed: 0,
      generated: 2,
      toReview: 4,
      left: 4,
      generatedLeft: 2,
    });
    expect(reviewProgress(paths, ['src/services/a.ts', 'bun.lock', 'gone/file.ts'])).toMatchObject({
      reviewed: 2,
      left: 3,
      generatedLeft: 1,
    });
  });

  it('Skip generated marks exactly the generated paths, keeping what was reviewed', () => {
    const doc = { ...emptyReviewDocument, reviewed: ['src/services/a.ts'] };
    const next = markGeneratedReviewed(doc, paths);
    expect(next.reviewed).toEqual(['src/services/a.ts', 'bun.lock', 'src/generated/changelog.ts']);
    expect(reviewProgress(paths, next.reviewed)).toMatchObject({ left: 3, generatedLeft: 0 });
    // Nothing to do the second time: the same document comes back.
    expect(markGeneratedReviewed(next, paths)).toBe(next);
  });

  it('labels the files left', () => {
    expect(unreviewedLabel(1)).toBe('1 file not reviewed yet');
    expect(unreviewedLabel(3)).toBe('3 files not reviewed yet');
  });

  it('loads documents saved before the walked flag existed', () => {
    const { walked: _walked, ...old } = { ...emptyReviewDocument, reviewed: ['a.ts'] };
    expect(normalizeReviewDocument(old)).toEqual({
      ...emptyReviewDocument,
      reviewed: ['a.ts'],
      walked: false,
    });
    expect(normalizeReviewDocument(undefined)).toBe(emptyReviewDocument);
  });
});
