// src/components/settings/NotificationSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { NotificationSection } from './NotificationSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { NotificationSettings } from '@/types/settings';

const meta: Meta<typeof NotificationSection> = {
  title: 'Settings/NotificationSection',
  component: NotificationSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof NotificationSection>;

const allOn: NotificationSettings = {
  ...configuredSettings.notifications,
  toastOnCheckStatusChange: true,
  toastOnNewPR: true,
  toastOnReviewUpdate: true,
  toastOnMergeable: true,
  onlyMyPRs: true,
  playMergeSound: true,
  reviewNudgeEnabled: true,
  reviewNudgeEscalation: true,
  channels: { tray: true, system: true, sound: true, emailDigest: true },
};

const allOff: NotificationSettings = {
  ...configuredSettings.notifications,
  toastOnCheckStatusChange: false,
  toastOnNewPR: false,
  toastOnReviewUpdate: false,
  toastOnMergeable: false,
  onlyMyPRs: false,
  playMergeSound: false,
  reviewNudgeEnabled: false,
  reviewNudgeEscalation: false,
  channels: { tray: false, system: false, sound: false, emailDigest: false },
};

const mixed: NotificationSettings = {
  ...configuredSettings.notifications,
  toastOnCheckStatusChange: true,
  toastOnNewPR: false,
  toastOnReviewUpdate: true,
  toastOnMergeable: false,
  onlyMyPRs: true,
  channels: { tray: true, system: false, sound: true, emailDigest: false },
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
