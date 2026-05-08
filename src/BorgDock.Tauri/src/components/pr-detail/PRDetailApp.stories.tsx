// src/components/pr-detail/PRDetailApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { animation, screenshot } from '../../../.storybook/screenshot';
import { openPr, PanelFrame, SETTINGS_BASELINE, withPrDetail } from './__fixtures__/pr-detail-data';
import { PrDetailApp } from './PRDetailApp';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const meta: Meta<typeof PrDetailApp> = {
  title: 'PR Detail/PRDetailApp',
  component: PrDetailApp,
  decorators: [
    (Story) => (
      <PanelFrame>
        <Story />
      </PanelFrame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PrDetailApp>;

const baseInvokes = {
  load_settings: SETTINGS_BASELINE,
  cache_init: undefined,
  window_ready: undefined,
};

export const Default: Story = {
  parameters: screenshot({
    output: 'site/public/screenshots/pr-detail.png',
    width: 800,
    height: 900,
  }),
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
};

export const LoadingNetwork: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: () => new Promise(() => {}),
      },
    }),
  ],
};

export const MissingParams: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      injectedPrParams: null,
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
};

export const PrNotFound: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: [],
      },
    }),
  ],
};

export const LoadSettingsRejects: Story = {
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: {
        ...baseInvokes,
        load_settings: '__throw__',
      },
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
};

// ── Animation: open checkout panel ───────────────────────────
//
// Clicks the "Checkout" button in the ActionBar to slide open the
// checkout panel. Pauses 2500ms after the click so the panel transition
// and content render are fully visible in the GIF.
export const Anim_OpenCheckoutPanel: Story = {
  parameters: animation({
    output: 'site/public/anim/pr-detail-checkout.gif',
    width: 800,
    height: 900,
    fps: 12,
    duration: 5500,
  }),
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await pause(700);
    const checkoutBtn = await c.findByRole('button', { name: /checkout/i });
    await userEvent.click(checkoutBtn);
    await pause(2500);
  },
};

// ── Animation: tab carousel ───────────────────────────────────
//
// Cycles through Overview → Files → Checks → Discussion. Pauses 900ms
// on each tab so the GIF reads as deliberate. Total duration ~5.5s at
// 12 fps = ~66 frames, encoded GIF ~150-300 KB.
export const Anim_TabCarousel: Story = {
  parameters: animation({
    output: 'site/public/anim/pr-detail-tabs.gif',
    width: 800,
    height: 900,
    fps: 12,
    duration: 6500,
  }),
  decorators: [
    withPrDetail(openPr, {
      invokeResponses: baseInvokes,
      githubResponses: {
        getOpenPRs: [openPr.pullRequest],
        getCheckRunsForRef: openPr.checks,
      },
    }),
  ],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // Initial state shows Overview. Wait a beat so the GIF starts on
    // the loaded panel rather than mid-mount.
    await pause(700);

    const click = async (name: RegExp) => {
      const tab = await c.findByRole('tab', { name });
      await userEvent.click(tab);
      await pause(900);
    };

    await click(/^files$/i);
    await click(/^checks$/i);
    await click(/^discussion$/i);
    await click(/^overview$/i);
  },
};
