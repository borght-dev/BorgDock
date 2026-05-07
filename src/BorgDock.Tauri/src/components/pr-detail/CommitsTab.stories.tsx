// src/components/pr-detail/CommitsTab.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PullRequestCommit } from '@/types';
import { CommitsTab } from './CommitsTab';
import {
  commitsRichPr,
  makePr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof CommitsTab> = {
  title: 'PR Detail/CommitsTab',
  component: CommitsTab,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof CommitsTab>;

const oneCommit: PullRequestCommit[] = [
  {
    sha: '0000000000000000000000000000000000000001',
    message: 'feat: initial commit',
    authorLogin: 'borght-dev',
    authorAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
    date: '2026-05-01T12:00:00Z',
  },
];

const manyCommits: PullRequestCommit[] = Array.from({ length: 12 }).map((_, i) => ({
  sha: `${String(i).padStart(40, '0')}`,
  message: i === 0 ? 'feat: initial commit' : `commit ${i}`,
  authorLogin: i % 3 === 0 ? 'koen' : 'borght-dev',
  authorAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
  date: `2026-05-${String(((i % 6) + 1)).padStart(2, '0')}T12:00:00Z`,
}));

// MixedSignedUnsigned replaced with LongCommitMessages — PullRequestCommit has no
// `verified` field and CommitsTab renders no signed-commit indicator. Long messages
// exercise the `truncate` on the first-line paragraph.
const longMessageCommits: PullRequestCommit[] = [
  {
    sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    message:
      'refactor: extract all shared primitives into a dedicated design-system package so consuming apps no longer import from component internals\n\nMore detail in the body that the tab should not render.',
    authorLogin: 'borght-dev',
    authorAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
    date: '2026-05-05T09:00:00Z',
  },
  {
    sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    message:
      'fix: resolve race condition in useCachedTabData when two tabs fetch the same key simultaneously and the second fetch resolves first',
    authorLogin: 'koen',
    authorAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
    date: '2026-05-06T14:30:00Z',
  },
  {
    sha: 'cccccccccccccccccccccccccccccccccccccccc',
    message: 'chore: bump deps',
    authorLogin: 'borght-dev',
    authorAvatarUrl: 'https://avatars.githubusercontent.com/u/0?v=4',
    date: '2026-05-07T08:00:00Z',
  },
];

export const SingleCommit: Story = {
  decorators: [
    withPrDetail(makePr({ pullRequest: { commitCount: 1 } }), {
      githubResponses: { getPRCommits: oneCommit },
    }),
  ],
  args: {
    prNumber: 42,
    repoOwner: 'borght-dev',
    repoName: 'BorgDock',
    prUpdatedAt: '2026-05-01T12:00:00Z',
  },
};

export const ManyCommits: Story = {
  decorators: [
    withPrDetail(commitsRichPr, {
      githubResponses: { getPRCommits: manyCommits },
    }),
  ],
  args: {
    prNumber: 42,
    repoOwner: 'borght-dev',
    repoName: 'BorgDock',
    prUpdatedAt: '2026-05-07T08:00:00Z',
  },
};

export const LongCommitMessages: Story = {
  decorators: [
    withPrDetail(makePr({ pullRequest: { commitCount: 3 } }), {
      githubResponses: { getPRCommits: longMessageCommits },
    }),
  ],
  args: {
    prNumber: 42,
    repoOwner: 'borght-dev',
    repoName: 'BorgDock',
    prUpdatedAt: '2026-05-07T08:00:00Z',
  },
};
