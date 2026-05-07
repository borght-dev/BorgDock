// src/components/pr/Pr.stories.tsx
//
// PR section stories — 6 stories exercising the main window PRs view with
// various PR set shapes: canonical, empty, many repos, failures, merge
// conflicts, and rate-limited.

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { usePrStore } from '@/stores/pr-store';
import App from '../../App';
import {
  MainWindowFrame,
  PRS_CANONICAL,
  PRS_EMPTY,
  PRS_MANY_REPOS,
  PRS_MERGE_CONFLICTS,
  PRS_WITH_FAILURES,
  reposSettings,
  withMainWindow,
} from '../main/__fixtures__/main-window-data';

const frame: Decorator = (Story) => (
  <MainWindowFrame>
    <Story />
  </MainWindowFrame>
);

const meta: Meta<typeof App> = {
  title: 'Main Window/App/PRs',
  component: App,
  decorators: [frame],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof App>;

// ── A. Canonical ───────────────────────────────────────────────

// PRs section with a typical mixed set of open PRs.
export const PrsCanonical: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
    }),
  ],
};

// ── B. Empty ───────────────────────────────────────────────────

// PRs section with no open PRs — empty state UI.
export const PrsEmpty: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_EMPTY,
      settings: reposSettings(),
    }),
  ],
};

// ── C. Many repos ──────────────────────────────────────────────

// PRs grouped across several repositories — exercises the repo-group
// expansion and per-repo header rendering.
export const PrsManyRepos: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_MANY_REPOS,
      settings: reposSettings(),
    }),
  ],
};

// ── D. With failures ───────────────────────────────────────────

// PRs section with CI failures — red status indicators visible.
export const PrsWithFailures: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_WITH_FAILURES,
      settings: reposSettings(),
    }),
  ],
};

// ── E. Merge conflicts ─────────────────────────────────────────

// PRs section with merge conflict indicators on each card.
export const PrsMergeConflicts: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_MERGE_CONFLICTS,
      settings: reposSettings(),
    }),
  ],
};

// ── F. Rate limited ────────────────────────────────────────────

// PRs section with the GitHub rate-limit banner visible. The rateLimit field
// is top-level on PrState; resetAt must be a Date object (not a number).
export const PrsRateLimited: Story = {
  decorators: [
    (Story) => {
      usePrStore.setState({
        rateLimit: {
          remaining: 0,
          limit: 5000,
          resetAt: new Date(Date.now() + 60_000),
        },
      });
      return <Story />;
    },
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
    }),
  ],
};
