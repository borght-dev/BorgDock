// src/components/settings/RepoSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { RemoteWorktreeRepoSettings, RepoSettings } from '@/types/settings';
import {
  configuredSettings,
  repoCandidates,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import { RepoSection } from './RepoSection';

const meta: Meta<typeof RepoSection> = {
  title: 'Settings/RepoSection',
  component: RepoSection,
  decorators: [
    (Story) => (
      <SectionFrame>
        <Story />
      </SectionFrame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof RepoSection>;

const oneRepo: RepoSettings[] = [configuredSettings.repos[0]!];

const manyRepos: RepoSettings[] = Array.from({ length: 6 }, (_, i) => ({
  owner: 'borght-dev',
  name: `repo-${i + 1}`,
  enabled: i % 2 === 0,
  worktreeBasePath: '/Users/koenvdb/projects',
  worktreeSubfolder: `repo-${i + 1}`,
  githubAccount: i % 2 === 0 ? 'borght-dev' : 'koenvdb-work',
}));

const baseDecorator = withSettings(configuredSettings, {
  invokeResponses: {
    scan_repos_under: repoCandidates,
    gh_cli_accounts: [
      { login: 'borght-dev', active: true },
      { login: 'koenvdb-work', active: false },
    ],
  },
});

export const Empty: Story = {
  decorators: [baseDecorator],
  args: { repos: [], onChange: () => {} },
};

export const OneRepo: Story = {
  decorators: [baseDecorator],
  args: { repos: oneRepo, onChange: () => {} },
};

const macFspHorizon: RemoteWorktreeRepoSettings = {
  id: 'mac-mini-fsp-horizon',
  label: 'Mac mini',
  owner: 'Gomocha-FSP',
  name: 'fsp-horizon',
  sshTarget: 'koenvdb@100.88.82.41',
  identityFile: 'C:/Users/KoenvanderBorghtGomo/.ssh/id_ed25519',
  basePath: '/Users/koenvdb/Dev/fsp-horizon',
  enabled: true,
};

export const WithRemoteWorktrees: Story = {
  decorators: [baseDecorator],
  args: {
    repos: oneRepo,
    onChange: () => {},
    remoteWorktreeRepos: [macFspHorizon],
    onRemoteWorktreeReposChange: () => {},
  },
};

export const ManyRepos: Story = {
  decorators: [baseDecorator],
  args: { repos: manyRepos, onChange: () => {} },
};

export const ScanDialogOpen: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        // Never resolves — dialog sits in scanning state.
        scan_repos_under: () => new Promise(() => {}),
      },
    }),
  ],
  args: { repos: manyRepos, onChange: () => {} },
  play: async () => {
    // Click the "Scan for repos" trigger if one is in the DOM. The exact
    // selector depends on the section's internals; fall through silently
    // if the implementation differs.
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('scan'),
    );
    btn?.click();
  },
};

export const ScanResultsWithCandidates: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        scan_repos_under: repoCandidates,
      },
    }),
  ],
  args: { repos: manyRepos, onChange: () => {} },
  play: async () => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('scan'),
    );
    btn?.click();
  },
};
