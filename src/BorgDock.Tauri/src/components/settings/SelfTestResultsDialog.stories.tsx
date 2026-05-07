// src/components/settings/SelfTestResultsDialog.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { SelfTestResultsDialog } from './SelfTestResultsDialog';
import {
  configuredSettings,
  selfTestResults,
  selfTestMixed,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof SelfTestResultsDialog> = {
  title: 'Settings/Dialogs/SelfTestResultsDialog',
  component: SelfTestResultsDialog,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof SelfTestResultsDialog>;

export const AllPassed: Story = {
  decorators: [withSettings(configuredSettings)],
  args: {
    isOpen: true,
    results: selfTestResults,
    onClose: () => {},
  },
};

export const MixedResults: Story = {
  decorators: [withSettings(configuredSettings)],
  args: {
    isOpen: true,
    results: selfTestMixed,
    onClose: () => {},
  },
};
