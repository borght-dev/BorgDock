// src/components/settings/GitHubSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { GitHubSection } from './GitHubSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof GitHubSection> = {
  title: 'Settings/GitHubSection',
  component: GitHubSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof GitHubSection>;

const baseArgs = {
  github: configuredSettings.gitHub,
  onChange: () => {},
};

export const NotAuthenticated: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { check_github_auth: { authenticated: false } },
    }),
  ],
  args: baseArgs,
};

export const Authenticated: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        check_github_auth: { authenticated: true, login: 'borght-dev' },
      },
    }),
  ],
  args: baseArgs,
};

export const AuthCheckPending: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        // Never resolves — keeps the section in pending state.
        check_github_auth: () => new Promise(() => {}),
      },
    }),
  ],
  args: baseArgs,
};
