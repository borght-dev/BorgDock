// src/components/pr/Pr.stories.tsx
//
// PR section stories — 6 stories exercising the main window PRs view with
// various PR set shapes: canonical, empty, many repos, failures, merge
// conflicts, and rate-limited.

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { userEvent } from 'storybook/test';
import { usePrStore } from '@/stores/pr-store';
import { animation } from '../../../.storybook/screenshot';
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

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// ── G. Animation: hover PR card → action pills reveal ──────────
//
// Hovers over the first PR card so the HoverActionPillBar fades in,
// then moves to the second card to show the reveal is per-card.
// The pill bar uses CSS group-hover opacity; userEvent.hover triggers
// the CSS :hover pseudo-class so the bar becomes visible.
export const Anim_PrCardHoverActions: Story = {
  parameters: animation({
    output: 'site/public/anim/pr-card-hover.gif',
    width: 720,
    height: 700,
    fps: 12,
    duration: 5000,
  }),
  decorators: [
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
    }),
  ],
  play: async ({ canvasElement }) => {
    await pause(800);
    // Find PR cards by their data attribute — each card is a [data-pr-card] div.
    const cards = canvasElement.querySelectorAll('[data-pr-card]');
    if (cards.length > 0) {
      await userEvent.hover(cards[0] as HTMLElement);
      await pause(1500);
    }
    if (cards.length > 1) {
      await userEvent.hover(cards[1] as HTMLElement);
      await pause(1500);
    }
  },
};
