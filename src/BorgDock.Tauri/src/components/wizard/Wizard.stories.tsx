// src/components/wizard/Wizard.stories.tsx
//
// Setup-wizard stories for App.tsx — 3 stories covering the wizard gate:
// step 0 (auth), step 1 (repos), and the PAT-missing re-trigger path.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { getControl } from '../../../.storybook/mocks/control';
import { animation } from '../../../.storybook/screenshot';
import App from '../../App';
import { MainWindowFrame, withWizard } from '../main/__fixtures__/main-window-data';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const meta: Meta<typeof App> = {
  title: 'Main Window/App/Wizard',
  component: App,
  decorators: [
    (Story) => (
      <MainWindowFrame>
        <Story />
      </MainWindowFrame>
    ),
  ],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof App>;

// Wizard step 0 — Auth. settings.setupComplete=false, ghCli auth method, no token,
// no repos. App's needsSetup gate triggers and renders <SetupWizard /> at step 0.
export const WizardAuth: Story = {
  decorators: [withWizard({ authMethod: 'ghCli', hasToken: false, hasRepos: false })],
};

// Wizard step 1 — Repos. Same wizard gate; PAT auth with a valid token makes
// canGoNext=true on step 0 without requiring the async Verify Connection round-trip.
// The play function clicks Next to advance to RepoStep. discover_repos returns
// a pre-seeded list of repos so the step renders non-empty.
//
// Approach: Option A (play function) — PAT + token so the Next button is enabled
// immediately; discover_repos seeded via invokeResponses before the click.
export const WizardRepos: Story = {
  decorators: [
    (Story) => {
      // Seed discover_repos so RepoStep shows discovered repos after the click.
      const ctrl = getControl();
      ctrl.invokeResponses.discover_repos = [
        { owner: 'borght-dev', name: 'BorgDock', localPath: '/Users/dev/BorgDock' },
        { owner: 'borght-dev', name: 'borgdock-site', localPath: '/Users/dev/borgdock-site' },
      ];
      return <Story />;
    },
    withWizard({ authMethod: 'pat', hasToken: true, hasRepos: false }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // PAT auth + non-empty token → Next button is enabled on mount.
    // Click it to advance SetupWizard from step 0 (AuthStep) to step 1 (RepoStep).
    const next = await canvas.findByRole('button', { name: /next/i });
    await userEvent.click(next);
  },
};

// Wizard triggered by PAT auth method with no token. settings.setupComplete is true
// (prior setup was done) AND repos is non-empty, so App's needsSetup gate fires
// via the LAST branch (`authMethod === 'pat' && !personalAccessToken`) rather
// than the `!setupComplete` branch that WizardAuth uses. This is the re-trigger
// path: a user who previously completed setup with PAT auth but whose token
// was cleared / invalidated.
export const WizardPatMissing: Story = {
  decorators: [
    withWizard({
      authMethod: 'pat',
      hasToken: false,
      hasRepos: true,
      setupComplete: true,
    }),
  ],
};

// ── Animation: step through Auth → Repos ─────────────────────────────
//
// Starts on wizard step 0 (AuthStep) with PAT auth + token filled in so
// the Next button is enabled immediately. Clicks Next to advance to step 1
// (RepoStep). discover_repos is seeded to return two repos so the step
// renders non-empty after the async call lands.
// 5.5s @ 12fps = ~66 frames.
export const Anim_StepThrough: Story = {
  parameters: animation({
    output: 'site/public/anim/wizard-stepthrough.gif',
    width: 480,
    height: 900,
    fps: 12,
    duration: 5500,
  }),
  decorators: [
    (Story) => {
      const ctrl = getControl();
      ctrl.invokeResponses.discover_repos = [
        { owner: 'borght-dev', name: 'BorgDock', localPath: '/Users/dev/BorgDock' },
        { owner: 'borght-dev', name: 'borgdock-site', localPath: '/Users/dev/borgdock-site' },
      ];
      return <Story />;
    },
    withWizard({ authMethod: 'pat', hasToken: true, hasRepos: false }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await pause(700);
    const next = await canvas.findByRole('button', { name: /next/i });
    await userEvent.click(next);
    // Wait for discover_repos mock to settle and RepoStep to render.
    await pause(1500);
  },
};
