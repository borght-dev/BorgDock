// src/components/settings/UpdateSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { UpdateSection } from './UpdateSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import { useUpdateStore } from '@/stores/update-store';

const meta: Meta<typeof UpdateSection> = {
  title: 'Settings/UpdateSection',
  component: UpdateSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof UpdateSection>;

const baseArgs = { updates: configuredSettings.updates, onChange: () => {} };

// UpdateSection reads from useUpdateStore directly, so each story seeds it.
function seedUpdateStore(state: Partial<ReturnType<typeof useUpdateStore.getState>>) {
  return () => {
    useUpdateStore.setState(state);
  };
}

export const UpToDate: Story = {
  decorators: [
    withSettings(configuredSettings),
    (Story) => {
      seedUpdateStore({
        checking: false,
        downloading: false,
        progress: 0,
        available: false,
        version: null,
        statusText: 'You are on the latest version.',
        currentVersion: '2.0.5',
      })();
      return <Story />;
    },
  ],
  args: baseArgs,
};

export const UpdateAvailable: Story = {
  decorators: [
    withSettings(configuredSettings),
    (Story) => {
      seedUpdateStore({
        checking: false,
        downloading: false,
        progress: 0,
        available: true,
        version: '2.1.0',
        statusText: 'Update 2.1.0 available.',
        currentVersion: '2.0.5',
      })();
      return <Story />;
    },
  ],
  args: baseArgs,
};

export const Checking: Story = {
  decorators: [
    withSettings(configuredSettings),
    (Story) => {
      seedUpdateStore({
        checking: true,
        downloading: false,
        progress: 0,
        available: false,
        version: null,
        statusText: 'Checking for updates…',
        currentVersion: '2.0.5',
      })();
      return <Story />;
    },
  ],
  args: baseArgs,
};
