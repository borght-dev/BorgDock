// src/components/settings/SettingsApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import {
  configuredSettings,
  firstLaunchSettings,
  withSettings,
} from './__fixtures__/settings-data';
import { SettingsApp } from './SettingsApp';

const meta: Meta<typeof SettingsApp> = {
  title: 'Settings/SettingsApp',
  component: SettingsApp,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof SettingsApp>;

const githubAuthOk = { authenticated: true, login: 'borght-dev' };

export const Default: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        check_github_auth: githubAuthOk,
        az_cli_available: true,
        get_cache_size: 1024 * 1024 * 24,
        agent_provider_availability: { claude: true, codex: true },
        t3_probe: { running: true, paired: true },
        gh_cli_accounts: [
          { login: 'borght-dev', active: true },
          { login: 'koenvdb-work', active: false },
        ],
      },
    }),
  ],
};

export const FirstLaunch: Story = {
  decorators: [
    withSettings(firstLaunchSettings, {
      invokeResponses: {
        check_github_auth: { authenticated: false },
        az_cli_available: false,
        get_cache_size: 0,
        agent_overview_status: { enabled: false },
      },
    }),
  ],
};

export const LoadingSplash: Story = {
  decorators: [
    withSettings(configuredSettings, {
      hasLoaded: false,
      invokeResponses: {
        check_github_auth: githubAuthOk,
        az_cli_available: true,
      },
    }),
  ],
};

// Pre-populates the search input via a tiny presentational wrapper so the
// rail renders the search-results panel without a play function.
function WithSearch({ query }: { query: string }) {
  useEffect(() => {
    // The rail's search input is uncontrolled from outside, but RailSearchInput
    // exposes the query via state inside SettingsApp. We drive the same flow
    // by simulating a user typing: focus + dispatch input event.
    const el = document.querySelector<HTMLInputElement>('input[placeholder*="Search" i]');
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(el, query);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, [query]);
  return null;
}

export const RailSearchActive: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        check_github_auth: githubAuthOk,
        az_cli_available: true,
      },
    }),
    (Story) => (
      <>
        <Story />
        <WithSearch query="repo" />
      </>
    ),
  ],
};

export const RailSearchNoResults: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        check_github_auth: githubAuthOk,
      },
    }),
    (Story) => (
      <>
        <Story />
        <WithSearch query="zzzz" />
      </>
    ),
  ],
};

export const DeepLinkArrival: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        check_github_auth: githubAuthOk,
        az_cli_available: true,
      },
    }),
  ],
  play: async () => {
    // Wait one frame for the listener registration in SettingsApp's useEffect.
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    getControl().emit('settings:deep-link', 'ado');
  },
};
