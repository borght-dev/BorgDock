// src/components/settings/AgentOverviewSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentOverviewSection } from './AgentOverviewSection';
import {
  configuredSettings,
  otelStatus,
  otelStatusError,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof AgentOverviewSection> = {
  title: 'Settings/AgentOverviewSection',
  component: AgentOverviewSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof AgentOverviewSection>;

export const Disabled: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        agent_overview_status: otelStatusError,
        set_agent_overview_enabled: undefined,
      },
    }),
  ],
};

export const EnabledRunning: Story = {
  decorators: [
    withSettings(
      { ...configuredSettings, agentOverview: { enabled: true } },
      {
        invokeResponses: {
          agent_overview_status: otelStatus,
        },
      },
    ),
  ],
};

export const EnabledError: Story = {
  decorators: [
    withSettings(
      { ...configuredSettings, agentOverview: { enabled: true } },
      {
        invokeResponses: {
          agent_overview_status: otelStatusError,
        },
      },
    ),
  ],
};
