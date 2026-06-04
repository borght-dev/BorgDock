import type { MockHandlers } from './mock-tauri';

/**
 * Named state scenarios for seeding the app via mock IPC overrides.
 * Each scenario returns a MockHandlers map merged into DEFAULT_HANDLERS
 * by installMockTauri.
 */
export type Scenario =
  | 'empty'
  | 'happy-path'
  | 'failing-checks'
  | 'merged-pr-celebration'
  | 'palette-loaded'
  | 'first-run';

/**
 * Mirror of AppSettings (src/types/settings.ts) — full shape so the
 * settings store hydrates without TypeError on nested property access.
 * Keep in sync with `defaultSettings` in `stores/settings-store.ts`.
 */
const HAPPY_SETTINGS = {
  setupComplete: true,
  gitHub: {
    authMethod: 'ghCli',
    pollIntervalSeconds: 60,
    username: 'test-user',
    personalAccessToken: 'ghp_test_token',
  },
  repos: [
    {
      owner: 'test-org',
      name: 'borgdock',
      enabled: true,
      worktreeBasePath: '/tmp/worktrees',
      worktreeSubfolder: '',
    },
  ],
  ui: {
    theme: 'light',
    globalHotkey: 'Ctrl+Win+Shift+G',
    flyoutHotkey: 'Alt+Space',
    editorCommand: 'code',
    runAtStartup: false,
    quickReviewHotkey: '',
    startMinimizedToTray: false,
    restoreLastSelection: true,
  },
  notifications: {
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    onlyMyPRs: false,
    playMergeSound: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
    channels: { tray: true, system: true, sound: true, emailDigest: false },
  },
  claudeCode: { defaultPostFixAction: 'commitAndNotify' },
  claudeApi: {
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
    prSummaryEnabled: true,
    diffExplanationsEnabled: true,
    reviewNudgePhrasingEnabled: false,
    commitMessageSuggestionsEnabled: false,
  },
  claudeReview: { botUsername: 'claude[bot]' },
  updates: { autoCheckEnabled: true, autoDownload: true },
  azureDevOps: {
    organization: 'test-org',
    project: 'test-project',
    authMethod: 'pat',
    authAutoDetected: true,
    pollIntervalSeconds: 120,
    favoriteQueryIds: [],
    trackedWorkItemIds: [],
    workingOnWorkItemIds: [],
    workItemWorktreePaths: {},
    recentWorkItemIds: [],
    linkMatchBy: 'branch',
    showWorkItemStateOnPrCard: true,
    updatePrStatusWhenWiDone: false,
    personalAccessToken: 'ado_test_pat',
  },
  sql: {
    connections: [],
    readOnlyByDefault: true,
    confirmDestructiveWithoutWhere: true,
  },
  repoPriority: {},
};

const EMPTY_SETTINGS = {
  ...HAPPY_SETTINGS,
  setupComplete: false,
  gitHub: { ...HAPPY_SETTINGS.gitHub, username: '', personalAccessToken: '' },
  ui: { ...HAPPY_SETTINGS.ui, theme: 'system' },
  azureDevOps: {
    ...HAPPY_SETTINGS.azureDevOps,
    organization: '',
    project: '',
    personalAccessToken: '',
    authAutoDetected: false,
  },
};

/** Helper: build a `PullRequestWithChecks` shape — what cache_load_prs returns. */
function makePr(overrides: {
  number: number;
  title: string;
  state?: string;
  isDraft?: boolean;
  overallStatus?: 'red' | 'yellow' | 'green' | 'gray';
  mergedAt?: string;
}): unknown {
  const base = {
    number: overrides.number,
    title: overrides.title,
    headRef: `feature/${overrides.number}`,
    headSha: `sha${overrides.number}`,
    baseRef: 'master',
    authorLogin: 'test-user',
    authorAvatarUrl: '',
    state: overrides.state ?? 'open',
    createdAt: '2026-05-08T08:00:00Z',
    updatedAt: '2026-05-08T09:00:00Z',
    isDraft: overrides.isDraft ?? false,
    mergeable: true,
    htmlUrl: `https://github.com/test-org/borgdock/pull/${overrides.number}`,
    body: '',
    repoOwner: 'test-org',
    repoName: 'borgdock',
    reviewStatus: 'none',
    commentCount: 0,
    labels: [],
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    commitCount: 1,
    mergedAt: overrides.mergedAt,
    requestedReviewers: [],
  };
  return {
    pullRequest: base,
    overallStatus: overrides.overallStatus ?? 'green',
    failedCheckNames: overrides.overallStatus === 'red' ? ['ci'] : [],
    failedCheckSuiteIds: overrides.overallStatus === 'red' ? [1] : [],
    pendingCheckNames: [],
    passedCount: 1,
    skippedCount: 0,
    totalCheckCount: 1,
  };
}

export const SAMPLE_PRS = [
  makePr({ number: 42, title: 'Add cool feature' }),
  makePr({ number: 43, title: 'Fix bug', isDraft: true, overallStatus: 'yellow' }),
];

export const FAILING_PR = makePr({
  number: 44,
  title: 'WIP: red checks',
  overallStatus: 'red',
});

export const MERGED_PR = makePr({
  number: 45,
  title: 'Just merged',
  state: 'closed',
  mergedAt: '2026-05-08T09:30:00Z',
});

/**
 * Mirror of the ADO `WorkItem` shape (src/types/work-item.ts) with the
 * standard System.* / Microsoft.VSTS.* fields the components read.
 */
function makeWorkItem(id: number, title: string, type: string, state: string): unknown {
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/test-org/_apis/wit/workItems/${id}`,
    htmlUrl: `https://dev.azure.com/test-org/_workitems/edit/${id}`,
    relations: [],
    fields: {
      'System.Title': title,
      'System.State': state,
      'System.WorkItemType': type,
      'System.AssignedTo': { displayName: 'test-user', uniqueName: 'test-user@borgdock.test' },
      'System.AreaPath': 'test-org',
      'System.IterationPath': 'test-org',
      'System.CreatedDate': '2026-05-01T00:00:00Z',
      'System.ChangedDate': '2026-05-08T00:00:00Z',
      'Microsoft.VSTS.Common.Priority': 2,
    },
  };
}

export const SAMPLE_WORK_ITEMS = [
  makeWorkItem(9001, 'Bug 1', 'Bug', 'Active'),
  makeWorkItem(9002, 'Task 2', 'Task', 'New'),
];

export function seedScenario(scenario: Scenario): MockHandlers {
  switch (scenario) {
    case 'empty':
      return {
        load_settings: EMPTY_SETTINGS,
        check_github_auth: { authenticated: false, login: '' },
        cache_load_prs: [],
        get_flyout_data: { prs: [], workItems: [] },
      };

    case 'happy-path':
      return {
        load_settings: HAPPY_SETTINGS,
        check_github_auth: { authenticated: true, login: 'test-user' },
        ado_fetch: (args: Record<string, unknown>) => {
          // Lightweight ADO mock: any GET returns sample work items
          if (typeof args.path === 'string' && args.path.includes('workitems')) {
            return { value: SAMPLE_WORK_ITEMS };
          }
          return null;
        },
        // cache_load_prs is called per-repo with { repoOwner, repoName }; the
        // mock ignores the args and returns the sample list regardless.
        cache_load_prs: SAMPLE_PRS,
        get_flyout_data: { prs: SAMPLE_PRS, workItems: SAMPLE_WORK_ITEMS },
      };

    case 'failing-checks':
      return {
        load_settings: HAPPY_SETTINGS,
        check_github_auth: { authenticated: true, login: 'test-user' },
        cache_load_prs: [FAILING_PR, ...SAMPLE_PRS],
        get_flyout_data: { prs: [FAILING_PR, ...SAMPLE_PRS], workItems: [] },
      };

    case 'merged-pr-celebration':
      return {
        load_settings: HAPPY_SETTINGS,
        check_github_auth: { authenticated: true, login: 'test-user' },
        cache_load_prs: [MERGED_PR],
        get_flyout_data: { prs: [MERGED_PR], workItems: [] },
      };

    case 'palette-loaded':
      return {
        // Add a custom palette root so an activeRoot resolves and
        // list_root_files actually fires.
        load_settings: {
          ...HAPPY_SETTINGS,
          filePaletteRoots: [{ path: '/tmp/test-root', label: 'test-root' }],
          ui: { ...HAPPY_SETTINGS.ui, filePaletteActiveRootPath: '/tmp/test-root' },
        },
        check_github_auth: { authenticated: true, login: 'test-user' },
        list_root_files: {
          entries: Array.from({ length: 200 }, (_, i) => ({
            rel_path: `src/file-${i.toString().padStart(3, '0')}.ts`,
            size: 100,
          })),
          truncated: false,
        },
        cache_load_prs: SAMPLE_PRS,
      };

    case 'first-run':
      return {
        load_settings: EMPTY_SETTINGS,
        check_github_auth: { authenticated: false, login: '' },
        cache_load_prs: [],
        // Force the wizard to show
        show_setup_wizard: null,
      };
  }
}
