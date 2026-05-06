// Synthetic fixtures for WorktreePaletteApp stories.
//
// `WorktreeEntry` mirrors the local interface inside WorktreePaletteApp.tsx
// (the production interface is not exported). If the production interface
// changes shape, stories will fail to type-check at the call site —
// caught by `npm run lint` / `npm run test`.

import type { AppSettings, RepoSettings, UiSettings } from '@/types/settings';

export interface WorktreeEntry {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
}

// ── Factory helpers ──────────────────────────────────────────────────

export function makeRepo(overrides?: Partial<RepoSettings>): RepoSettings {
  return {
    owner: 'borght-dev',
    name: 'BorgDock',
    enabled: true,
    worktreeBasePath: '/Users/dev/worktrees/borgdock',
    worktreeSubfolder: '',
    ...overrides,
  };
}

export function makeWorktree(overrides?: Partial<WorktreeEntry>): WorktreeEntry {
  return {
    path: '/Users/dev/worktrees/borgdock/feature-branch',
    branchName: 'feature-branch',
    isMainWorktree: false,
    ...overrides,
  };
}

const BASE_UI: UiSettings = {
  theme: 'system',
  globalHotkey: 'CommandOrControl+Shift+B',
  flyoutHotkey: 'CommandOrControl+Shift+F',
  editorCommand: 'code',
  runAtStartup: false,
  quickReviewHotkey: 'CommandOrControl+Shift+R',
  startMinimizedToTray: false,
  restoreLastSelection: true,
};

export function makeSettings(repos: RepoSettings[], ui?: Partial<UiSettings>): AppSettings {
  return {
    setupComplete: true,
    gitHub: {
      authMethod: 'ghCli',
      pollIntervalSeconds: 30,
      username: 'storybook',
    },
    repos,
    ui: { ...BASE_UI, ...ui },
    notifications: {
      toastOnCheckStatusChange: false,
      toastOnNewPR: false,
      toastOnReviewUpdate: false,
      toastOnMergeable: false,
      onlyMyPRs: true,
      playMergeSound: false,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 30,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
      channels: { tray: true, system: false, sound: false, emailDigest: false },
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: {
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
      prSummaryEnabled: false,
      diffExplanationsEnabled: false,
      reviewNudgePhrasingEnabled: false,
      commitMessageSuggestionsEnabled: false,
    },
    claudeReview: { botUsername: 'claude[bot]' },
    updates: { autoCheckEnabled: false, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      authMethod: 'azCli',
      authAutoDetected: false,
      pollIntervalSeconds: 30,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      linkMatchBy: 'branch',
      showWorkItemStateOnPrCard: false,
      updatePrStatusWhenWiDone: false,
    },
    sql: {
      connections: [],
      readOnlyByDefault: true,
      confirmDestructiveWithoutWhere: true,
    },
    repoPriority: {},
  };
}

// ── Curated repo fixtures ────────────────────────────────────────────

export const repoBorgDock: RepoSettings = makeRepo({
  owner: 'borght-dev',
  name: 'BorgDock',
  worktreeBasePath: '/Users/dev/worktrees/borgdock',
});

export const repoFspHorizon: RepoSettings = makeRepo({
  owner: 'gomocha',
  name: 'fsp-horizon',
  worktreeBasePath: 'C:\\Dev\\fsp-horizon-worktrees',
});

export const repoLongName: RepoSettings = makeRepo({
  owner: 'very-long-organization-name',
  name: 'and-an-equally-long-repository-name-that-overflows',
  worktreeBasePath: '/very/deeply/nested/path/that/is/quite/long/worktrees',
});

export const repoNoBasePath: RepoSettings = makeRepo({
  owner: 'orphan',
  name: 'no-base',
  worktreeBasePath: '',
});

export const repoDisabled: RepoSettings = makeRepo({
  owner: 'archived',
  name: 'old-repo',
  enabled: false,
  worktreeBasePath: '/Users/dev/worktrees/archived',
});

export const repoWithFavs: RepoSettings = makeRepo({
  owner: 'borght-dev',
  name: 'BorgDock',
  worktreeBasePath: '/Users/dev/worktrees/borgdock',
  favoriteWorktreePaths: [
    '/Users/dev/worktrees/borgdock/feature-favorite-a',
    '/Users/dev/worktrees/borgdock/feature-favorite-b',
  ],
});

// ── Curated worktree fixtures ────────────────────────────────────────

export const wtMain: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/main',
  branchName: 'master',
  isMainWorktree: true,
});

export const wtFeature: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/feature-storybook',
  branchName: 'feature/storybook-rollout',
});

export const wtDetached: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/detached-abc123',
  branchName: '',
});

export const wtLongBranch: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/long-branch',
  branchName: 'feature/an-extremely-long-branch-name-that-tests-overflow-and-truncation-behavior-in-the-row',
});

export const wtLongPath: WorktreeEntry = makeWorktree({
  path: '/Users/dev/projects/some/deeply/nested/parent/folders/borgdock/long-path-feature',
  branchName: 'feature/long-path',
});

export const wtFavoriteCandidate1: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/feature-favorite-a',
  branchName: 'feature/favorite-a',
});

export const wtFavoriteCandidate2: WorktreeEntry = makeWorktree({
  path: '/Users/dev/worktrees/borgdock/feature-favorite-b',
  branchName: 'feature/favorite-b',
});

// ── Curated histories ────────────────────────────────────────────────

export interface RepoTrees {
  repo: RepoSettings;
  trees: WorktreeEntry[];
}

export const oneRepoFew: RepoTrees = {
  repo: repoBorgDock,
  trees: [
    { ...wtMain },
    { ...wtFeature },
    makeWorktree({
      path: '/Users/dev/worktrees/borgdock/bugfix-toast',
      branchName: 'bugfix/toast-reposition',
    }),
  ],
};

export const oneRepoMany: RepoTrees = {
  repo: repoBorgDock,
  trees: [
    { ...wtMain },
    ...Array.from({ length: 29 }, (_, i) =>
      makeWorktree({
        path: `/Users/dev/worktrees/borgdock/feature-${String(i).padStart(2, '0')}`,
        branchName: `feature/branch-${String(i).padStart(2, '0')}`,
      }),
    ),
  ],
};

export const twoReposBalanced: RepoTrees[] = [
  {
    repo: repoBorgDock,
    trees: [
      { ...wtMain },
      { ...wtFeature },
      makeWorktree({
        path: '/Users/dev/worktrees/borgdock/refactor-mocks',
        branchName: 'refactor/storybook-mocks',
      }),
      makeWorktree({
        path: '/Users/dev/worktrees/borgdock/docs-update',
        branchName: 'docs/readme-update',
      }),
    ],
  },
  {
    repo: repoFspHorizon,
    trees: [
      makeWorktree({
        path: 'C:\\Dev\\fsp-horizon-worktrees\\main',
        branchName: 'main',
        isMainWorktree: true,
      }),
      makeWorktree({
        path: 'C:\\Dev\\fsp-horizon-worktrees\\feature-mobile-api',
        branchName: 'feature/mobile-api',
      }),
      makeWorktree({
        path: 'C:\\Dev\\fsp-horizon-worktrees\\bugfix-receive',
        branchName: 'bugfix/receive-handler',
      }),
      makeWorktree({
        path: 'C:\\Dev\\fsp-horizon-worktrees\\spike-mappers',
        branchName: 'spike/mappers',
      }),
    ],
  },
];

export const twoReposLopsided: RepoTrees[] = [
  {
    repo: repoBorgDock,
    trees: [{ ...wtMain }],
  },
  {
    repo: repoFspHorizon,
    trees: [
      makeWorktree({
        path: 'C:\\Dev\\fsp-horizon-worktrees\\main',
        branchName: 'main',
        isMainWorktree: true,
      }),
      ...Array.from({ length: 24 }, (_, i) =>
        makeWorktree({
          path: `C:\\Dev\\fsp-horizon-worktrees\\feature-${String(i).padStart(2, '0')}`,
          branchName: `feature/branch-${String(i).padStart(2, '0')}`,
        }),
      ),
    ],
  },
];

const [borgDockTrees, fspHorizonTrees] = twoReposBalanced as [RepoTrees, RepoTrees];

export const fiveRepos: RepoTrees[] = [
  borgDockTrees,
  fspHorizonTrees,
  {
    repo: makeRepo({
      owner: 'gomocha',
      name: 'cosmetic-tracker',
      worktreeBasePath: '/Users/dev/worktrees/cosmetic-tracker',
    }),
    trees: [
      makeWorktree({
        path: '/Users/dev/worktrees/cosmetic-tracker/master',
        branchName: 'master',
        isMainWorktree: true,
      }),
      makeWorktree({
        path: '/Users/dev/worktrees/cosmetic-tracker/feature-supabase',
        branchName: 'feature/supabase-migration',
      }),
    ],
  },
  {
    repo: makeRepo({
      owner: 'borght-dev',
      name: 'PRDock',
      worktreeBasePath: '/Users/dev/worktrees/prdock',
    }),
    trees: [
      makeWorktree({
        path: '/Users/dev/worktrees/prdock/master',
        branchName: 'master',
        isMainWorktree: true,
      }),
    ],
  },
  {
    repo: makeRepo({
      owner: 'borght-dev',
      name: 'pluim',
      worktreeBasePath: '/Users/dev/worktrees/pluim',
    }),
    trees: [
      makeWorktree({
        path: '/Users/dev/worktrees/pluim/master',
        branchName: 'master',
        isMainWorktree: true,
      }),
      makeWorktree({
        path: '/Users/dev/worktrees/pluim/feature-stripe',
        branchName: 'feature/stripe-checkout',
      }),
      makeWorktree({
        path: '/Users/dev/worktrees/pluim/feature-messagebird',
        branchName: 'feature/messagebird-sms',
      }),
    ],
  },
];
