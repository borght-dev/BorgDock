// src/components/settings/UpdateSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { type UpdateStatus, useUpdateStore } from '@/stores/update-store';
import { configuredSettings, SectionFrame, withSettings } from './__fixtures__/settings-data';
import { UpdateSection } from './UpdateSection';

const meta: Meta<typeof UpdateSection> = {
  title: 'Settings/UpdateSection',
  component: UpdateSection,
  decorators: [
    (Story) => (
      <SectionFrame>
        <Story />
      </SectionFrame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof UpdateSection>;

const baseArgs = { updates: configuredSettings.updates, onChange: () => {} };
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const checked: UpdateStatus = {
  phase: 'idle',
  currentVersion: '4.16.0',
  version: null,
  progress: 0,
  lastCheckedAt: minutesAgo(12),
  lastError: null,
};

// UpdateSection reads the update store, which Rust fills in the app: each story seeds it.
function withStatus(status: Partial<UpdateStatus>, restarting = false): Story['decorators'] {
  return [
    withSettings(configuredSettings),
    (Story) => {
      useUpdateStore.setState({ ...checked, ...status, restarting });
      return <Story />;
    },
  ];
}

export const UpToDate: Story = { decorators: withStatus({}), args: baseArgs };

export const NotCheckedYet: Story = {
  decorators: withStatus({ lastCheckedAt: null }),
  args: baseArgs,
};

export const Checking: Story = { decorators: withStatus({ phase: 'checking' }), args: baseArgs };

export const CheckFailed: Story = {
  decorators: withStatus({
    lastCheckedAt: minutesAgo(3),
    lastError:
      'Check failed: error sending request for url (https://github.com/borght-dev/BorgDock/releases/latest/download/latest.json)',
  }),
  args: baseArgs,
};

export const UpdateAvailable: Story = {
  decorators: withStatus({ phase: 'available', version: '4.17.0', lastCheckedAt: minutesAgo(1) }),
  args: { ...baseArgs, updates: { ...configuredSettings.updates, autoDownload: false } },
};

export const Downloading: Story = {
  decorators: withStatus({
    phase: 'downloading',
    version: '4.17.0',
    progress: 42,
    lastCheckedAt: minutesAgo(1),
  }),
  args: baseArgs,
};

export const ReadyToRestart: Story = {
  decorators: withStatus({
    phase: 'ready',
    version: '4.17.0',
    progress: 100,
    lastCheckedAt: minutesAgo(4),
  }),
  args: baseArgs,
};

export const Restarting: Story = {
  decorators: withStatus(
    { phase: 'ready', version: '4.17.0', progress: 100, lastCheckedAt: minutesAgo(4) },
    true,
  ),
  args: baseArgs,
};
