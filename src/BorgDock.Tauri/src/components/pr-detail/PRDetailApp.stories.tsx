// src/components/pr-detail/PRDetailApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { screenshot } from '../../../.storybook/screenshot';
import { openPr, PanelFrame, SETTINGS_BASELINE, withPrDetail } from './__fixtures__/pr-detail-data';
import { PrDetailApp } from './PRDetailApp';

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
