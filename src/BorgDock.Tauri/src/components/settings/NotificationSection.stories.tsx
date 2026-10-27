// src/components/settings/NotificationSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NotificationSettings } from '@/types/settings';
import { configuredSettings, SectionFrame, withSettings } from './__fixtures__/settings-data';
import { NotificationSection } from './NotificationSection';

const meta: Meta<typeof NotificationSection> = {
  title: 'Settings/NotificationSection',
  component: NotificationSection,
  decorators: [
    (Story) => (
      <SectionFrame>
        <Story />
      </SectionFrame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof NotificationSection>;

const allOn: NotificationSettings = {
  ...configuredSettings.notifications,
  toastOnNewPR: true,
  onlyMyPRs: true,
  playMergeSound: true,
  reviewNudgeEnabled: true,
  reviewNudgeEscalation: true,
  channels: { sound: true },
};

const allOff: NotificationSettings = {
  ...configuredSettings.notifications,
  toastOnNewPR: false,
  onlyMyPRs: false,
  playMergeSound: false,
  reviewNudgeEnabled: false,
  reviewNudgeEscalation: false,
  channels: { sound: false },
};

const mixed: NotificationSettings = {
  ...configuredSettings.notifications,
  toastOnNewPR: false,
  onlyMyPRs: true,
  channels: { sound: true },
};

export const AllEnabled: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { notifications: allOn, onChange: () => {} },
};

export const AllDisabled: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { notifications: allOff, onChange: () => {} },
};

export const Mixed: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { notifications: mixed, onChange: () => {} },
};
