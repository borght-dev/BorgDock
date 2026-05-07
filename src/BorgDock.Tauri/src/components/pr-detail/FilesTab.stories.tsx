// src/components/pr-detail/FilesTab.stories.tsx
//
// 6 stories covering the primary axes:
//   SmallDiff         — small set of modified files with real patches
//   BigDiffOverflow   — 50 files, exercises file-tree + count display
//   BinaryFile        — no patch, no additions/deletions (png)
//   Renamed           — status="renamed" with previousFilename
//   Deleted           — status="removed"
//   WithInlineThread  — smallDiffFiles + a seeded review thread on one line
//
// Data path: FilesTab calls getPRFiles (via useCachedTabData → fetchPrFiles)
// plus getPRCommits and getReviewThreads. All three are served from the mock
// aliases (@/services/github/pulls → services-github-pulls.ts and
// @/services/github/reviewThreads → services-github-reviewThreads.ts).
// @/services/github/singleton is also aliased to a mock that always returns a
// non-null dummy client so the `if (!client) throw` guards pass.
//
// NOTE: useCachedTabData first attempts to load from the SQLite cache via
// invoke('cache_tab_data_load', ...). In Storybook, invoke returns undefined by
// default (no cache hit), so the component proceeds straight to the API fetch.
// If cache_tab_data_load is stubbed via invokeResponses and returns a hit, the
// API fetch is skipped entirely and the seeded files would not be used — keep
// the invokeResponses map empty (the default) so control always flows to the mock.

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReviewThread } from '@/types';
import { FilesTab } from './FilesTab';
import {
  bigDiffPr,
  makePr,
  openPr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof FilesTab> = {
  title: 'PR Detail/FilesTab',
  component: FilesTab,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof FilesTab>;

// ── Shared file fixtures ───────────────────────────────────────

const smallDiffFiles = [
  {
    filename: 'src/util.ts',
    status: 'modified',
    additions: 12,
    deletions: 3,
    sha: 'aaa111',
    patch:
      '@@ -10,7 +10,16 @@\n const a = 1;\n-const b = 2;\n+const b = 22;\n+const c = 3;',
  },
];

// 50 files — exercises the file-tree scrollable list and "N files changed" display.
const bigDiffFiles = Array.from({ length: 50 }).map((_, i) => ({
  filename: `src/big/${String(i).padStart(2, '0')}.ts`,
  status: 'modified',
  additions: (i * 7 + 12) % 80,
  deletions: (i * 3 + 5) % 40,
  sha: `sha${String(i).padStart(3, '0')}`,
  patch: '@@ -1 +1 @@\n-old\n+new',
}));

const binaryFiles = [
  {
    filename: 'docs/screenshot.png',
    status: 'modified',
    additions: 0,
    deletions: 0,
    sha: 'bbb222',
    // no patch — toDiffFile() detects isBinary when patch is absent and
    // additions + deletions are both 0.
  },
];

const renamedFiles = [
  {
    filename: 'src/renamed.ts',
    previousFilename: 'src/old-name.ts',
    status: 'renamed',
    additions: 0,
    deletions: 0,
    sha: 'ccc333',
  },
];

const deletedFiles = [
  {
    filename: 'src/legacy.ts',
    status: 'removed',
    additions: 0,
    deletions: 84,
    sha: 'ddd444',
    patch:
      '@@ -1,84 +0,0 @@\n-// legacy module\n-export function doThing() {\n-  return 42;\n-}',
  },
];

// A minimal review thread anchored to line 12 of src/util.ts — the same file
// used in smallDiffFiles. FilesTab passes threads + openThreadIds to each
// DiffFileSection; the section renders inline comment bubbles when a thread's
// path and line match.
const inlineThread: ReviewThread = {
  id: 'thread_001',
  filePath: 'src/util.ts',
  line: 12,
  isResolved: false,
  comments: [
    {
      id: 'comment_001',
      databaseId: 1001,
      author: 'reviewer-bot',
      authorIsBot: false,
      body: 'Should this be 22 or 23? Looks like an off-by-one.',
      createdAt: '2026-05-07T09:00:00Z',
      severity: 'suggestion',
    },
  ],
  snippet: [],
};

// ── Shared base args ───────────────────────────────────────────

const baseArgs = {
  prNumber: openPr.pullRequest.number,
  repoOwner: openPr.pullRequest.repoOwner,
  repoName: openPr.pullRequest.repoName,
  htmlUrl: openPr.pullRequest.htmlUrl,
  prUpdatedAt: openPr.pullRequest.updatedAt,
};

// ── Stories ────────────────────────────────────────────────────

export const SmallDiff: Story = {
  name: 'SmallDiff',
  decorators: [
    withPrDetail(openPr, {
      githubResponses: { getPRFiles: smallDiffFiles },
    }),
  ],
  args: baseArgs,
};

export const BigDiffOverflow: Story = {
  name: 'BigDiffOverflow (50 files)',
  decorators: [
    withPrDetail(bigDiffPr, {
      githubResponses: { getPRFiles: bigDiffFiles },
    }),
  ],
  args: {
    prNumber: bigDiffPr.pullRequest.number,
    repoOwner: bigDiffPr.pullRequest.repoOwner,
    repoName: bigDiffPr.pullRequest.repoName,
    htmlUrl: bigDiffPr.pullRequest.htmlUrl,
    prUpdatedAt: bigDiffPr.pullRequest.updatedAt,
  },
};

export const BinaryFile: Story = {
  name: 'BinaryFile',
  decorators: [
    withPrDetail(openPr, {
      githubResponses: { getPRFiles: binaryFiles },
    }),
  ],
  args: baseArgs,
};

export const Renamed: Story = {
  name: 'Renamed',
  decorators: [
    withPrDetail(openPr, {
      githubResponses: { getPRFiles: renamedFiles },
    }),
  ],
  args: baseArgs,
};

export const Deleted: Story = {
  name: 'Deleted',
  decorators: [
    withPrDetail(openPr, {
      githubResponses: { getPRFiles: deletedFiles },
    }),
  ],
  args: baseArgs,
};

// WithInlineThread seeds one review thread on src/util.ts:12. The thread
// renders as an inline comment bubble beneath the diff line in the DiffFileSection.
// If the diff viewer hasn't expanded to that line yet (all files are expanded by
// default — allExpanded=true), the bubble should be visible without interaction.
// This story is visually distinct from SmallDiff only when the inline thread
// rendering path in DiffFileSection is active.
const inlineThreadPr = makePr({ pullRequest: { commentCount: 1 } });

export const WithInlineThread: Story = {
  name: 'WithInlineThread',
  decorators: [
    withPrDetail(inlineThreadPr, {
      githubResponses: {
        getPRFiles: smallDiffFiles,
        getReviewThreads: [inlineThread],
      },
    }),
  ],
  args: {
    prNumber: inlineThreadPr.pullRequest.number,
    repoOwner: inlineThreadPr.pullRequest.repoOwner,
    repoName: inlineThreadPr.pullRequest.repoName,
    htmlUrl: inlineThreadPr.pullRequest.htmlUrl,
    prUpdatedAt: inlineThreadPr.pullRequest.updatedAt,
  },
};
