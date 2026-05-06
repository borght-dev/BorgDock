// src/components/settings/ClaudeApiSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClaudeApiSection } from './ClaudeApiSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { ClaudeApiSettings } from '@/types/settings';

const meta: Meta<typeof ClaudeApiSection> = {
  title: 'Settings/ClaudeApiSection',
  component: ClaudeApiSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof ClaudeApiSection>;

const noKey: ClaudeApiSettings = { ...configuredSettings.claudeApi };

const withKey: ClaudeApiSettings = {
  ...configuredSettings.claudeApi,
  apiKey: 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghij',
};

export const NoApiKey: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { claudeApi: noKey, onChange: () => {} },
};

export const ApiKeySet: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { claudeApi: withKey, onChange: () => {} },
};
