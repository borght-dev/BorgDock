// src/components/settings/SettingsApp.stories.tsx

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { type ReactElement, useEffect } from 'react';
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

const configuredInvokes = {
  check_github_auth: githubAuthOk,
  az_cli_available: true,
  get_cache_size: 1024 * 1024 * 24,
  agent_provider_availability: { claude: true, codex: true },
  t3_probe: { running: true, paired: true },
  gh_cli_accounts: [
    { login: 'borght-dev', active: true },
    { login: 'koenvdb-work', active: false },
  ],
};

export const Default: Story = {
  decorators: [withSettings(configuredSettings, { invokeResponses: configuredInvokes })],
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

export const Agents: Story = {
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#field-t3-pairing')?.scrollIntoView({ block: 'start' });
    const panel = canvasElement.querySelector('main');
    if (panel) panel.scrollTop -= 24;
  },
  decorators: [
    ...(Default.decorators as Decorator[]),
    (Story) => {
      localStorage.setItem('settings.lastSection', 'agents');
      history.replaceState(null, '', '#section=agents');
      return <Story />;
    },
  ],
};

/** T3 Code as the agent provider: Fix, Resolve and Monitor start T3 threads. */
export const AgentsWithT3: Story = {
  decorators: [
    withSettings(
      {
        ...configuredSettings,
        agents: {
          defaultProvider: 't3',
          defaultPostFixAction: 'commitAndNotify',
          t3Model: 'claude-fable-5',
          t3ModelInstance: 'claudeAgent',
        },
      },
      { invokeResponses: configuredInvokes },
    ),
    (Story) => {
      localStorage.setItem('settings.lastSection', 'agents');
      history.replaceState(null, '', '#section=agents');
      return <Story />;
    },
  ],
};

/** Summaries on Codex: effort, fast mode, and the review guide's instructions and skipped files. */
export const AgentsCodexSummaries: Story = {
  play: ({ canvasElement }) => {
    canvasElement.querySelector('#field-guide-instructions')?.scrollIntoView({ block: 'center' });
  },
  decorators: [
    withSettings(
      {
        ...configuredSettings,
        summaries: {
          enabled: true,
          provider: 'codex',
          model: '',
          effort: 'high',
          fast: true,
          autoReviewGuide: true,
          backgroundReviewGuides: true,
          guideInstructions: 'Call out every new translation key and every migration.',
          guideSkip: ['plans/**/*.html'],
        },
      },
      { invokeResponses: configuredInvokes },
    ),
    (Story) => {
      localStorage.setItem('settings.lastSection', 'agents');
      history.replaceState(null, '', '#section=agents');
      return <Story />;
    },
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

// ---------------------------------------------------------------------------
// Both themes (plans/ui-overhaul-workbench.md, phase 6): the window on
// porcelain and on graphite, for the tool-window screenshots.
// ---------------------------------------------------------------------------

/** Opens the window on the Appearance panel (theme, motion and layout in one place). */
function onAppearance(Story: () => ReactElement) {
  localStorage.setItem('settings.lastSection', 'appearance');
  history.replaceState(null, '', '#section=appearance');
  return <Story />;
}

export const ThemeLight: Story = {
  decorators: [...(Default.decorators as Decorator[]), onAppearance],
  globals: { theme: 'light' },
};
export const ThemeDark: Story = {
  decorators: [...(Default.decorators as Decorator[]), onAppearance],
  globals: { theme: 'dark' },
};
