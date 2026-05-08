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
  repos: [],
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

const SAMPLE_PRS = [
  {
    id: 1001,
    number: 42,
    title: 'Add cool feature',
    state: 'open',
    repo: 'test-org/borgdock',
    headRef: 'feature/cool',
    baseRef: 'master',
    author: 'test-user',
    isDraft: false,
    mergeable: true,
    checksConclusion: 'success',
    updatedAt: '2026-05-08T09:00:00Z',
  },
  {
    id: 1002,
    number: 43,
    title: 'Fix bug',
    state: 'open',
    repo: 'test-org/borgdock',
    headRef: 'fix/bug',
    baseRef: 'master',
    author: 'test-user',
    isDraft: true,
    mergeable: true,
    checksConclusion: 'pending',
    updatedAt: '2026-05-08T08:00:00Z',
  },
];

const FAILING_PR = {
  ...SAMPLE_PRS[0],
  id: 1003,
  number: 44,
  title: 'WIP: red checks',
  checksConclusion: 'failure',
};

const MERGED_PR = {
  ...SAMPLE_PRS[0],
  id: 1004,
  number: 45,
  title: 'Just merged',
  state: 'closed',
  merged: true,
  mergedAt: '2026-05-08T09:30:00Z',
};

const SAMPLE_WORK_ITEMS = [
  { id: 9001, title: 'Bug 1', state: 'Active', type: 'Bug' },
  { id: 9002, title: 'Task 2', state: 'New', type: 'Task' },
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
        load_settings: HAPPY_SETTINGS,
        check_github_auth: { authenticated: true, login: 'test-user' },
        list_root_files: Array.from({ length: 200 }, (_, i) => ({
          path: `src/file-${i.toString().padStart(3, '0')}.ts`,
          name: `file-${i.toString().padStart(3, '0')}.ts`,
        })),
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
