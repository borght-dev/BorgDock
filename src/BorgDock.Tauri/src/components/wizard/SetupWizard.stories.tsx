// src/components/wizard/SetupWizard.stories.tsx
//
// The first-run setup wizard, one story per step in both themes. The wizard
// renders inside the main window (App.tsx, `?wizard=force`), so the stories
// mount it on its own over the window background. Steps after the first are
// reached the way a user reaches them: the play function picks the access
// token method, types a token and presses Next, with `discover_repos` mocked.

import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { useSettingsStore } from '@/stores/settings-store';
import { getControl } from '../../../.storybook/mocks/control';
import { SetupWizard } from './SetupWizard';

const DISCOVERED = [
  {
    owner: 'borght-dev',
    name: 'borgdock',
    localPath: 'D:\\repos\\borgdock',
    isSelected: true,
    worktreeSubfolder: '.worktrees',
  },
  {
    owner: 'borght-dev',
    name: 'fsp-horizon',
    localPath: 'D:\\repos\\fsp-horizon',
    isSelected: true,
    worktreeSubfolder: '.worktrees',
  },
  {
    owner: 'gomocha',
    name: 'field-service-portal',
    localPath: 'D:\\repos\\fsp',
    isSelected: true,
    worktreeSubfolder: '.worktrees',
  },
];

/** A fresh first-run store and the IPC answers the wizard asks for. */
const firstRun: Decorator = (Story) => {
  const ctrl = getControl();
  ctrl.invokeResponses.discover_repos = DISCOVERED;
  ctrl.invokeResponses.check_github_auth = 'borght-dev';
  const { settings } = useSettingsStore.getState();
  useSettingsStore.setState({
    settings: {
      ...settings,
      setupComplete: false,
      gitHub: { ...settings.gitHub, authMethod: 'ghCli', username: '' },
    },
  });
  return <Story />;
};

const meta: Meta<typeof SetupWizard> = {
  title: 'Wizard/SetupWizard',
  component: SetupWizard,
  parameters: { layout: 'fullscreen' },
  decorators: [firstRun],
};
export default meta;
type Story = StoryObj<typeof SetupWizard>;

async function toRepositories(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  // The method cards ignore pointer events; the button around each takes the click.
  const patMethod = canvasElement.querySelector<HTMLButtonElement>('[data-auth-method="pat"]');
  if (!patMethod) throw new Error('access token method not rendered');
  await userEvent.click(patMethod);
  await userEvent.type(canvas.getByPlaceholderText('ghp_...'), 'ghp_storybook');
  await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
  await expect(await canvas.findByText('borght-dev/borgdock')).toBeInTheDocument();
}

async function toLook(canvasElement: HTMLElement) {
  await toRepositories(canvasElement);
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
  await expect(await canvas.findByText('Pick your look')).toBeInTheDocument();
}

// ── Step 1: connect to GitHub ────────────────────────────────────────

export const Connect: Story = { globals: { theme: 'light' } };
export const ConnectDark: Story = { globals: { theme: 'dark' } };

// ── Step 2: pick the repositories ────────────────────────────────────

export const Repositories: Story = {
  globals: { theme: 'light' },
  play: ({ canvasElement }) => toRepositories(canvasElement),
};
export const RepositoriesDark: Story = { ...Repositories, globals: { theme: 'dark' } };

// ── Step 3: pick a look ──────────────────────────────────────────────

export const Look: Story = {
  globals: { theme: 'light' },
  play: ({ canvasElement }) => toLook(canvasElement),
};
export const LookDark: Story = { ...Look, globals: { theme: 'dark' } };
