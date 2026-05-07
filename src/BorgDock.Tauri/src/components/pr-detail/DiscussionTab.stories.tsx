// src/components/pr-detail/DiscussionTab.stories.tsx
//
// 5 stories covering the primary axes of DiscussionTab:
//   Empty                      — no reviews, comments, or threads
//   MixedThreadsResolvedAndOpen — general comments + open/resolved code threads
//   CodeThreadOnly             — only code review threads, no general comments
//   GeneralCommentsOnly        — only issue-level comments, no code threads
//   ComposerActive             — play function focuses the composer textarea
//
// Data path: DiscussionTab calls getReviews, getAllComments, getReviewThreads
// (all via useCachedTabData). It also imports postComment / submitReview from
// @/services/github/mutations. All four modules are aliased to mocks in
// .storybook/main.ts. Reviews and comments are seeded via githubResponses in
// the control surface.
//
// NOTE: useCachedTabData first attempts to load from the SQLite cache via
// invoke('cache_tab_data_load', ...). In Storybook, invoke returns undefined by
// default (no cache hit), so the component proceeds to the API fetch which hits
// our mocks. Keep invokeResponses empty (the default) so control flows to mocks.

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ClaudeReviewComment } from '@/types';
import type { RawReview } from '../../../.storybook/mocks/control';
import type { ReviewThread, ReviewThreadComment, ReviewThreadSnippetLine } from '@/types';
import { DiscussionTab } from './DiscussionTab';
import {
  PanelFrame,
  richDiscussionPr,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof DiscussionTab> = {
  title: 'PR Detail/DiscussionTab',
  component: DiscussionTab,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof DiscussionTab>;

// ── Shared args ────────────────────────────────────────────────

const baseArgs = {
  prNumber: richDiscussionPr.pullRequest.number,
  repoOwner: richDiscussionPr.pullRequest.repoOwner,
  repoName: richDiscussionPr.pullRequest.repoName,
  prUpdatedAt: richDiscussionPr.pullRequest.updatedAt,
  onJumpToFile: () => {},
};

// ── Synthetic fixture helpers ──────────────────────────────────

function makeComment(id: string, author: string, body: string, filePath?: string): ClaudeReviewComment {
  return {
    id,
    author,
    body,
    filePath,
    severity: 'unknown',
    createdAt: `2026-05-05T10:${id.padStart(2, '0')}:00Z`,
    htmlUrl: `https://github.com/borght-dev/BorgDock/pull/42#issuecomment-${id}`,
  };
}

function makeReview(
  id: number,
  login: string,
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED',
  body: string | null,
): RawReview {
  return {
    id,
    state,
    body,
    submitted_at: `2026-05-06T09:${String(id).padStart(2, '0')}:00Z`,
    user: { login },
  };
}

function makeSnippet(anchorText: string): ReviewThreadSnippetLine[] {
  return [
    { lineNumber: 11, marker: ' ', text: '// context above', isAnchor: false },
    { lineNumber: 12, marker: '+', text: anchorText, isAnchor: true },
    { lineNumber: 13, marker: ' ', text: '// context below', isAnchor: false },
  ];
}

function makeThreadComment(id: string, author: string, body: string): ReviewThreadComment {
  return {
    id,
    databaseId: Number(id),
    author,
    authorIsBot: author.endsWith('[bot]') || author.endsWith('-bot'),
    body,
    createdAt: `2026-05-05T11:${id.padStart(2, '0')}:00Z`,
  };
}

function makeThread(
  id: string,
  filePath: string,
  line: number,
  anchorText: string,
  commentBodies: string[],
  isResolved = false,
): ReviewThread {
  return {
    id,
    filePath,
    line,
    isResolved,
    resolvedBy: isResolved ? 'borght-dev' : undefined,
    snippet: makeSnippet(anchorText),
    comments: commentBodies.map((body, i) =>
      makeThreadComment(`${id}-${i + 1}`, i === 0 ? 'reviewer-bot' : 'borght-dev', body),
    ),
  };
}

// ── Stories ────────────────────────────────────────────────────

export const Empty: Story = {
  decorators: [
    withPrDetail(richDiscussionPr, {
      githubResponses: {
        getAllComments: [],
        getReviewThreads: [],
        getReviews: [],
      },
    }),
  ],
  args: baseArgs,
};

export const MixedThreadsResolvedAndOpen: Story = {
  decorators: [
    withPrDetail(richDiscussionPr, {
      githubResponses: {
        getAllComments: [
          makeComment('1', 'koen', 'Overall LGTM — nice cleanup throughout.'),
          makeComment('2', 'reviewer-bot', 'One minor ask before merge.'),
        ],
        getReviewThreads: [
          makeThread(
            'thread-10',
            'src/util.ts',
            12,
            '+const result = compute(a, b);',
            ['Why not `const` here? Looks like it should be immutable.', 'Good catch, fixed.'],
            false,
          ),
          makeThread(
            'thread-11',
            'src/util.ts',
            30,
            '+export function helper() {',
            ['Naming nit: prefer `helperFn` to match the naming convention.', 'Renamed.'],
            true,
          ),
        ],
        getReviews: [
          makeReview(201, 'reviewer-bot', 'CHANGES_REQUESTED', 'Please address the naming nit.'),
        ],
      },
    }),
  ],
  args: baseArgs,
};

export const CodeThreadOnly: Story = {
  decorators: [
    withPrDetail(richDiscussionPr, {
      githubResponses: {
        getAllComments: [],
        getReviewThreads: [
          makeThread(
            'thread-20',
            'src/components/Button.tsx',
            5,
            '+import React from "react";',
            ['This import is redundant with the new JSX transform.'],
            false,
          ),
          makeThread(
            'thread-21',
            'src/hooks/useData.ts',
            99,
            '+}, [dep1, dep2]);',
            ['Missing `dep3` in the dependency array — stale closure risk.'],
            false,
          ),
        ],
        getReviews: [],
      },
    }),
  ],
  args: baseArgs,
};

export const GeneralCommentsOnly: Story = {
  decorators: [
    withPrDetail(richDiscussionPr, {
      githubResponses: {
        getAllComments: [
          makeComment('30', 'koen', 'Thoughts on splitting this into two PRs for easier review?'),
          makeComment('31', 'reviewer-bot', 'Alternatively we could keep it as-is if the diff stays under 500 lines.'),
          makeComment('32', 'koen', 'Agreed, keeping it. The changes are cohesive.'),
        ],
        getReviewThreads: [],
        getReviews: [
          makeReview(301, 'reviewer-bot', 'COMMENTED', null),
        ],
      },
    }),
  ],
  args: baseArgs,
};

export const ComposerActive: Story = {
  decorators: [
    withPrDetail(richDiscussionPr, {
      githubResponses: {
        getAllComments: [
          makeComment('40', 'borght-dev', 'CI is green. Ready for final approval.'),
        ],
        getReviewThreads: [],
        getReviews: [],
      },
    }),
  ],
  args: baseArgs,
  play: async () => {
    // Wait briefly for the panel to render, then click the first composer
    // trigger button (the "Comment" or "Review" CTA) to open the composer.
    await new Promise<void>((r) => setTimeout(r, 150));
    const trigger = document.querySelector<HTMLElement>('button[data-composer], [data-testid="compose-comment"]');
    if (trigger) {
      trigger.click();
      await new Promise<void>((r) => setTimeout(r, 100));
    }
    // Focus the first available textarea or contenteditable as a fallback.
    const composer = document.querySelector<HTMLElement>('textarea, [role="textbox"]');
    composer?.focus();
  },
};
