// src/components/focus/Focus.stories.tsx
//
// Focus section stories — 4 stories exercising the main window focus view,
// including the QuickReview overlay and MergeToast global trigger.

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import App from '../../App';
import {
  MainWindowFrame,
  PRS_CANONICAL,
  PRS_EMPTY,
  withMainWindow,
} from '../main/__fixtures__/main-window-data';

const frame: Decorator = (Story) => (
  <MainWindowFrame>
    <Story />
  </MainWindowFrame>
);

const meta: Meta<typeof App> = {
  title: 'Main Window/App/Focus',
  component: App,
  decorators: [frame],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof App>;

function reposSettings() {
  return {
    setupComplete: true,
    repos: [
      {
        owner: 'borght-dev',
        name: 'BorgDock',
        enabled: true,
        worktreeBasePath: '',
        worktreeSubfolder: '',
      },
    ],
  };
}

// ── A. Canonical ───────────────────────────────────────────────

// Fully loaded focus section with a typical set of open PRs.
export const FocusCanonical: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'focus' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
    }),
  ],
};

// ── B. Empty ───────────────────────────────────────────────────

// Focus section with zero open PRs — shows empty state UI.
export const FocusEmpty: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'focus' },
      pullRequests: PRS_EMPTY,
      settings: reposSettings(),
    }),
  ],
};

// ── C. Quick review overlay ────────────────────────────────────

// Focus section with the QuickReview overlay open. The store is seeded to
// state='reviewing' with PRS_CANONICAL[0] in the queue so the overlay renders
// its full card UI on top of the focus list.
export const FocusWithQuickReview: Story = {
  decorators: [
    (Story) => {
      const pr = PRS_CANONICAL[0]!;
      useQuickReviewStore.setState({
        state: 'reviewing',
        queue: [pr],
        currentIndex: 0,
        decisions: new Map(),
        error: null,
      });
      return <Story />;
    },
    withMainWindow({
      ui: { activeSection: 'focus' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
    }),
  ],
};

// ── D. Merge toast ─────────────────────────────────────────────

// Focus section with a merge toast visible. MergeToast installs
// window.__borgdockQueueMerge in a useEffect on mount. The play function waits
// one tick so the effect has run before calling it.
export const FocusWithMergeToast: Story = {
  decorators: [
    withMainWindow({
      ui: { activeSection: 'focus' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
    }),
  ],
  play: async () => {
    // Wait one tick for MergeToast's useEffect to install __borgdockQueueMerge.
    await new Promise<void>((r) => setTimeout(r, 0));
    const fn = (
      window as unknown as {
        __borgdockQueueMerge?: (owner: string, repo: string, prNumber: number) => void;
      }
    ).__borgdockQueueMerge;
    if (fn) fn('borght-dev', 'BorgDock', 42);
  },
};
