// src/components/settings/ClaudeSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClaudeSection } from './ClaudeSection';
import {
  configuredSettings,
  makeSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { ClaudeCodeSettings } from '@/types/settings';

const meta: Meta<typeof ClaudeSection> = {
  title: 'Settings/ClaudeSection',
  component: ClaudeSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof ClaudeSection>;

const defaultClaude: ClaudeCodeSettings = configuredSettings.claudeCode;

const customClaude: ClaudeCodeSettings = {
  defaultPostFixAction: 'commitOnly',
  claudeCodePath: '/opt/homebrew/bin/claude',
};

export const Default: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { claudeCode: defaultClaude, onChange: () => {} },
};

export const Configured: Story = {
  decorators: [
    withSettings(makeSettings({ claudeCode: customClaude })),
  ],
  args: { claudeCode: customClaude, onChange: () => {} },
};
