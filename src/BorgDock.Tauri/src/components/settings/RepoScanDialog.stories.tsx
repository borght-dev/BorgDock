// src/components/settings/RepoScanDialog.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { RepoScanDialog } from './RepoScanDialog';
import {
  configuredSettings,
  repoCandidates,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof RepoScanDialog> = {
  title: 'Settings/Dialogs/RepoScanDialog',
  component: RepoScanDialog,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof RepoScanDialog>;

const baseArgs = {
  isOpen: true,
  parentPath: '/Users/koenvdb/projects',
  onClose: () => {},
  onAdd: () => {},
};

export const Scanning: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        scan_repos_under: () => new Promise(() => {}),
      },
    }),
  ],
  args: baseArgs,
};

export const ResultsEmpty: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { scan_repos_under: [] },
    }),
  ],
  args: baseArgs,
};

export const ResultsWithCandidates: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { scan_repos_under: repoCandidates },
    }),
  ],
  args: baseArgs,
};
