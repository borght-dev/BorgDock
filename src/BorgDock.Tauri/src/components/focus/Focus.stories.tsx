// src/components/focus/Focus.stories.tsx
//
// Focus section stories — 4 stories exercising the main window focus view,
// including the QuickReview overlay and MergeToast global trigger.

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { getControl } from '../../../.storybook/mocks/control';
import { animation } from '../../../.storybook/screenshot';
import App from '../../App';
import {
  MainWindowFrame,
  PRS_CANONICAL,
  PRS_EMPTY,
  PRS_FOCUS_DEMO,
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
  title: 'Main Window/App/Focus',
  component: App,
  decorators: [frame],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof App>;

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
//
// MergeToast schedules a 3-second setTimeout that calls mergePr from
// @/services/pr-actions. The storybook alias for that module already returns
// Promise.resolve(true) by default, but we register an explicit no-op
// override here so the eventual auto-merge call is captured in
// ctrl.invocations and there is no ambiguity about what fires when the
// timer expires (story may still be visible in addon-vitest snapshot tests).
export const FocusWithMergeToast: Story = {
  decorators: [
    (Story) => {
      const ctrl = getControl();
      ctrl.prActionResponses.mergePr = () => Promise.resolve(true);
      return <Story />;
    },
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

// ── Animation: Start Quick Review ──────────────────────────────────────
//
// Loads the focus section with PRS_FOCUS_DEMO + username seeded so the
// priority list populates. Clicks the "Start Quick Review" button to open
// the QuickReview overlay.
// 5.5s @ 12fps = ~66 frames.
export const Anim_StartQuickReview: Story = {
  parameters: animation({
    output: 'site/public/anim/focus-quick-review.gif',
    width: 480,
    height: 800,
    fps: 12,
    duration: 5500,
  }),
  decorators: [
    withMainWindow({
      ui: { activeSection: 'focus' },
      pullRequests: PRS_FOCUS_DEMO,
      settings: {
        ...reposSettings(),
        gitHub: { username: 'borght-dev' },
      },
    }),
    (Story) => (
      <MainWindowFrame>
        <Story />
      </MainWindowFrame>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await pause(800);
    const btn = await canvas.findByRole('button', { name: /start quick review/i });
    await userEvent.click(btn);
    await pause(1800);
  },
};

// ── Animation: Merge toast countdown ──────────────────────────────────
//
// Uses FocusWithMergeToast's setup pattern (prActionResponses.mergePr seeded,
// MergeToast's __borgdockQueueMerge installed on mount). Triggers the toast,
// then waits 3.5s for the auto-merge timer to fire and the toast to disappear.
// 5s @ 12fps = ~60 frames.
export const Anim_MergeToastCountdown: Story = {
  parameters: animation({
    output: 'site/public/anim/merge-toast-countdown.gif',
    width: 480,
    height: 800,
    fps: 12,
    duration: 5000,
  }),
  decorators: [
    (Story) => {
      const ctrl = getControl();
      ctrl.prActionResponses.mergePr = () => Promise.resolve(true);
      return <Story />;
    },
    withMainWindow({
      ui: { activeSection: 'focus' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
    }),
    (Story) => (
      <MainWindowFrame>
        <Story />
      </MainWindowFrame>
    ),
  ],
  play: async () => {
    await pause(700);
    // Wait one tick for MergeToast's useEffect to install __borgdockQueueMerge.
    await new Promise<void>((r) => setTimeout(r, 0));
    const fn = (
      window as unknown as {
        __borgdockQueueMerge?: (owner: string, repo: string, prNumber: number) => void;
      }
    ).__borgdockQueueMerge;
    if (fn) fn('borght-dev', 'BorgDock', 42);
    // Wait for the 3-second countdown + fire + toast dismiss.
    await pause(3500);
  },
};
