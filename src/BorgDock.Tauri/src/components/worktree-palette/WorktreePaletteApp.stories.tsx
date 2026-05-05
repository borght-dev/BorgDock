// src/components/worktree-palette/WorktreePaletteApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';

import { getControl } from '../../../.storybook/mocks/control';
import {
  fiveRepos,
  makeRepo,
  makeSettings,
  oneRepoFew,
  oneRepoMany,
  repoBorgDock,
  repoNoBasePath,
  repoWithFavs,
  twoReposBalanced,
  twoReposLopsided,
  wtDetached,
  wtFavoriteCandidate1,
  wtFavoriteCandidate2,
  wtFeature,
  wtLongBranch,
  wtLongPath,
  wtMain,
  type RepoTrees,
  type WorktreeEntry,
} from './__fixtures__/worktree-data';
import { WorktreePaletteApp } from './WorktreePaletteApp';

interface WorktreeStoryParams {
  /** AppSettings the load_settings invoke returns. */
  settings?: ReturnType<typeof makeSettings>;
  /** Static array OR fn (args) => entries[]. */
  listResponses?:
    | WorktreeEntry[]
    | ((args: { basePath: string }) => WorktreeEntry[] | Promise<WorktreeEntry[]>);
  /** When true, load_settings returns a never-resolving promise. */
  loadSettingsPending?: boolean;
  /** When true, load_settings rejects. */
  loadSettingsReject?: boolean;
  /** Override currentMonitor's response. */
  monitorState?: { size: { width: number; height: number }; scaleFactor: number } | null;
}

function buildRepoListResponses(
  history: RepoTrees[],
): (args: { basePath: string }) => WorktreeEntry[] {
  const map = new Map<string, WorktreeEntry[]>();
  for (const { repo, trees } of history) map.set(repo.worktreeBasePath, trees);
  return (args) => map.get(args.basePath) ?? [];
}

function settingsFromHistory(history: RepoTrees[]) {
  return makeSettings(history.map((h) => h.repo));
}

function WorktreeHarness({ params }: { params: WorktreeStoryParams }) {
  const ctrl = getControl();

  // Seed all control-surface state synchronously before render.
  if (params.loadSettingsPending) {
    ctrl.invokeResponses['load_settings'] = () => new Promise(() => {});
  } else if (params.loadSettingsReject) {
    ctrl.invokeResponses['load_settings'] = () => Promise.reject(new Error('settings unavailable'));
  } else if (params.settings) {
    ctrl.invokeResponses['load_settings'] = params.settings;
  }

  if (params.listResponses !== undefined) {
    ctrl.invokeResponses['list_worktrees_bare'] = params.listResponses;
  }

  // Log-only commands: no return value needed (mock returns undefined).
  ctrl.invokeResponses['save_settings'] = undefined;
  ctrl.invokeResponses['window_ready'] = undefined;
  ctrl.invokeResponses['open_in_terminal'] = undefined;
  ctrl.invokeResponses['reveal_in_file_manager'] = undefined;
  ctrl.invokeResponses['open_in_editor'] = undefined;

  if (params.monitorState !== undefined) ctrl.monitorState = params.monitorState;

  return <WorktreePaletteApp />;
}

const meta: Meta<typeof WorktreeHarness> = {
  title: 'Worktree/WorktreePaletteApp',
  component: WorktreeHarness,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof WorktreeHarness>;

function story(params: WorktreeStoryParams): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// 1. Loading axis
// ---------------------------------------------------------------------------

export const Loading = story({ loadSettingsPending: true });

export const Refreshing: Story = {
  args: {
    params: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const refresh = await canvas.findByRole('button', { name: /refresh/i });
    await userEvent.click(refresh);
  },
};

export const WindowReadyDeferred: Story = {
  args: {
    params: {
      settings: settingsFromHistory([{ repo: repoBorgDock, trees: oneRepoFew.trees }]),
      listResponses: oneRepoFew.trees,
    },
  },
  play: async () => {
    const { waitFor, expect } = await import('storybook/test');
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.invocations.some((i) => i.command === 'window_ready')).toBe(true);
    });
  },
};

// ---------------------------------------------------------------------------
// 2. Empty / no-data axis
// ---------------------------------------------------------------------------

export const NoReposConfigured = story({
  settings: makeSettings([]),
});

export const AllReposDisabled = story({
  settings: makeSettings([
    makeRepo({ owner: 'archived', name: 'old-repo', enabled: false }),
    makeRepo({ owner: 'archived', name: 'another-old-repo', enabled: false }),
  ]),
});

export const AllReposNoBasePath = story({
  settings: makeSettings([repoNoBasePath]),
});

// ---------------------------------------------------------------------------
// 3. Single-repo / list-shape axis
// ---------------------------------------------------------------------------

export const OneRepoMainOnly = story({
  settings: makeSettings([repoBorgDock]),
  listResponses: [wtMain],
});

export const OneRepoFewTrees = story({
  settings: settingsFromHistory([oneRepoFew]),
  listResponses: oneRepoFew.trees,
});

export const OneRepoManyTrees: Story = {
  args: {
    params: {
      settings: settingsFromHistory([oneRepoMany]),
      listResponses: oneRepoMany.trees,
    },
  },
  play: async () => {
    const { waitFor, expect } = await import('storybook/test');
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.invocations.some((i) => i.command === 'window_ready')).toBe(true);
    });
  },
};

export const OneRepoMixedDetached = story({
  settings: makeSettings([repoBorgDock]),
  listResponses: [wtMain, wtFeature, wtDetached, wtLongBranch, wtLongPath],
});

// ---------------------------------------------------------------------------
// 4. Multi-repo grouping axis
// ---------------------------------------------------------------------------

export const TwoReposBalanced = story({
  settings: settingsFromHistory(twoReposBalanced),
  listResponses: buildRepoListResponses(twoReposBalanced),
});

export const TwoReposLopsided = story({
  settings: settingsFromHistory(twoReposLopsided),
  listResponses: buildRepoListResponses(twoReposLopsided),
});

export const FiveRepos = story({
  settings: settingsFromHistory(fiveRepos),
  listResponses: buildRepoListResponses(fiveRepos),
});

// ---------------------------------------------------------------------------
// 5. Error axis
// ---------------------------------------------------------------------------

export const OneRepoErrored: Story = {
  args: {
    params: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: (args: { basePath: string }) => {
        if (args.basePath === repoBorgDock.worktreeBasePath) {
          return Promise.reject(new Error('git: not a git repository'));
        }
        return buildRepoListResponses(twoReposBalanced)(args);
      },
    },
  },
};

export const AllReposErrored: Story = {
  args: {
    params: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: () => Promise.reject(new Error('spawn git: ENOENT')),
    },
  },
};

export const MixedSuccessAndError: Story = {
  args: {
    params: (() => {
      const repoA = makeRepo({
        owner: 'borght-dev',
        name: 'BorgDock',
        worktreeBasePath: '/Users/dev/worktrees/borgdock',
      });
      const repoB = makeRepo({
        owner: 'gomocha',
        name: 'fsp-horizon',
        worktreeBasePath: '/Users/dev/worktrees/fsp-horizon',
      });
      const repoC = makeRepo({
        owner: 'borght-dev',
        name: 'PRDock',
        worktreeBasePath: '/Users/dev/worktrees/prdock',
      });
      return {
        settings: makeSettings([repoA, repoB, repoC]),
        listResponses: (args: { basePath: string }) => {
          if (args.basePath === repoA.worktreeBasePath) return [wtMain, wtFeature];
          if (args.basePath === repoB.worktreeBasePath)
            return Promise.reject(new Error('spawn git: EACCES'));
          return [] as WorktreeEntry[];
        },
      };
    })(),
  },
};

export const SettingsLoadFailed = story({ loadSettingsReject: true });

// ---------------------------------------------------------------------------
// 6. Filter / favorites axis
// ---------------------------------------------------------------------------

export const FilterMatchingByBranch: Story = {
  args: {
    params: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    await userEvent.type(input, 'feature');
  },
};

export const FilterMatchingByFolder: Story = {
  args: {
    params: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    await userEvent.type(input, 'storybook');
  },
};

export const FilterMatchingByRepo: Story = {
  args: {
    params: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    await userEvent.type(input, 'borgdock');
  },
};

export const FilterNoMatch: Story = {
  args: {
    params: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    await userEvent.type(input, 'zzz');
  },
};

export const FavoritesOnlyEmpty = story({
  settings: makeSettings([repoBorgDock], { worktreePaletteFavoritesOnly: true }),
  listResponses: [wtMain, wtFeature],
});

export const FavoritesOnlyWithMix = story({
  settings: makeSettings([repoWithFavs], { worktreePaletteFavoritesOnly: true }),
  listResponses: [
    wtMain,
    wtFavoriteCandidate1,
    wtFavoriteCandidate2,
    wtFeature,
  ],
});

// ---------------------------------------------------------------------------
// 7. Selection / keyboard axis
// ---------------------------------------------------------------------------

export const FirstRowSelected = story({
  settings: settingsFromHistory(twoReposBalanced),
  listResponses: buildRepoListResponses(twoReposBalanced),
});

export const MidListSelected: Story = {
  args: {
    params: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    input.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}');
  },
};

export const EnterOpensTerminal: Story = {
  args: {
    params: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/filter by branch/i);
    input.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.invocations.some((i) => i.command === 'open_in_terminal')).toBe(true);
    });
  },
};

// ---------------------------------------------------------------------------
// 8. Interaction axis
// ---------------------------------------------------------------------------

export const ToggleFavoriteOptimistic: Story = {
  args: {
    params: {
      settings: settingsFromHistory([oneRepoFew]),
      listResponses: oneRepoFew.trees,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    const starBtn = await canvas.findByRole('button', { name: /mark as favorite/i });
    await userEvent.click(starBtn);
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.invocations.some((i) => i.command === 'save_settings')).toBe(true);
    });
  },
};

export const PaletteReshown: Story = {
  args: {
    params: {
      settings: settingsFromHistory(twoReposBalanced),
      listResponses: buildRepoListResponses(twoReposBalanced),
    },
  },
  play: async () => {
    const { waitFor, expect } = await import('storybook/test');
    // Wait for the first load_settings to land.
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.invocations.some((i) => i.command === 'load_settings')).toBe(true);
    });
    // Simulate the window being re-shown via the Rust toggle.
    getControl().emit('palette-shown', null);
    // A second load_settings should fire.
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.invocations.filter((i) => i.command === 'load_settings').length).toBeGreaterThanOrEqual(2);
    });
  },
};
