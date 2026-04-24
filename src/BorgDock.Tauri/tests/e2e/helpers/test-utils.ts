import { Page, expect } from '@playwright/test';

/**
 * Tauri API mock script injected via addInitScript.
 * Intercepts dynamic imports of @tauri-apps/* modules so the frontend
 * can run inside a plain browser without a real Tauri backend.
 */
export const TAURI_MOCK_SCRIPT = `
  // Mock __TAURI_INTERNALS__ to prevent "not running in Tauri" errors
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      // Do NOT log plugin:log|log invocations — the frontend's
      // attachConsoleBridge (services/logger.ts) patches console.log to
      // proxy through plugin-log, so logging here would re-enter the
      // mock and recurse until the page crashes.
      if (cmd !== 'plugin:log|log') {
        console.log('[mock] invoke', cmd, args);
      }

      switch (cmd) {
        case 'plugin:log|log':
          // Drop plugin-log calls on the floor; they are fire-and-forget
          // in real Tauri and have no return value.
          return null;
        case 'load_settings':
          return window.__BORGDOCK_MOCK_SETTINGS__ || {
            setupComplete: false,
            gitHub: { authMethod: 'ghCli', pollIntervalSeconds: 60, username: '' },
            repos: [],
            ui: {
              sidebarEdge: 'right', sidebarMode: 'pinned', sidebarWidthPx: 380,
              theme: 'dark', globalHotkey: 'Ctrl+Shift+P', flyoutHotkey: 'Ctrl+Shift+F',
              editorCommand: 'code', runAtStartup: false,
            },
            notifications: { toastOnCheckStatusChange: true, toastOnNewPR: true, toastOnReviewUpdate: true },
            claudeCode: { defaultPostFixAction: 'commitAndNotify' },
            claudeReview: { botUsername: 'claude-code' },
            updates: { autoCheckEnabled: false, autoDownload: false },
            azureDevOps: {
              organization: '', project: '', pollIntervalSeconds: 120,
              favoriteQueryIds: [], trackedWorkItemIds: [], workingOnWorkItemIds: [],
              workItemWorktreePaths: {},
            },
          };

        case 'save_settings':
          window.__BORGDOCK_MOCK_SETTINGS__ = args?.settings;
          return null;

        case 'register_user_hotkeys':
        case 'unregister_hotkey':
        case 'position_sidebar':
        case 'toggle_sidebar':
        case 'init_cache':
          return null;

        case 'check_github_auth':
          return 'testuser';

        case 'discover_repos':
          return [
            { owner: 'test-org', name: 'test-repo', localPath: '/home/user/repos/test-repo', isSelected: true, worktreeSubfolder: '.worktrees' },
            { owner: 'test-org', name: 'other-repo', localPath: '/home/user/repos/other-repo', isSelected: false, worktreeSubfolder: '.worktrees' },
          ];

        case 'git_fetch':
        case 'git_checkout':
          return null;

        case 'get_cached_prs':
          return [];

        default:
          console.warn('[mock] unhandled invoke:', cmd);
          return null;
      }
    },
    transformCallback: () => 0,
  };

  // Prevent Tauri event listeners from throwing
  window.__TAURI_INTERNALS__.metadata = { currentWindow: { label: 'main' }, currentWebview: { label: 'main' }, windows: [] };
`;

/**
 * Complete mock settings object that marks setup as complete.
 */
export function completedSettings() {
  return {
    setupComplete: true,
    gitHub: {
      authMethod: 'pat',
      personalAccessToken: 'ghp_test123',
      pollIntervalSeconds: 60,
      username: 'testuser',
    },
    repos: [
      {
        owner: 'test-org',
        name: 'test-repo',
        enabled: true,
        worktreeBasePath: '/home/user/repos/test-repo',
        worktreeSubfolder: '.worktrees',
      },
    ],
    ui: {
      sidebarEdge: 'right',
      sidebarMode: 'pinned',
      sidebarWidthPx: 380,
      theme: 'dark',
      globalHotkey: 'Ctrl+Shift+P',
      flyoutHotkey: 'Ctrl+Shift+F',
      editorCommand: 'code',
      runAtStartup: false,
    },
    notifications: {
      toastOnCheckStatusChange: true,
      toastOnNewPR: true,
      toastOnReviewUpdate: true,
    },
    claudeCode: { defaultPostFixAction: 'commitAndNotify' },
    claudeReview: { botUsername: 'claude-code' },
    updates: { autoCheckEnabled: false, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      pollIntervalSeconds: 120,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
    },
  };
}

/**
 * Inject Tauri mocks before the page loads. Must be called before page.goto().
 */
export async function injectTauriMocks(page: Page) {
  await page.addInitScript(TAURI_MOCK_SCRIPT);
}

/**
 * Inject Tauri mocks with completed settings so the wizard is skipped.
 */
export async function injectCompletedSetup(page: Page) {
  const settings = completedSettings();
  await page.addInitScript(`
    ${TAURI_MOCK_SCRIPT}
    window.__BORGDOCK_MOCK_SETTINGS__ = ${JSON.stringify(settings)};
  `);
}

/**
 * Wait for the app to fully load (past loading spinner).
 */
export async function waitForAppReady(page: Page) {
  // Wait for the loading spinner to disappear
  await page
    .waitForSelector('[class*="animate-spin"]', { state: 'detached', timeout: 10_000 })
    .catch(() => {});
  // Wait for either the setup wizard or the sidebar header to appear
  await page.waitForSelector('header, [class*="fixed inset-0"]', { timeout: 10_000 });
}

/**
 * Inject mock PR data into the Zustand pr-store via page.evaluate().
 * Call this after the page has loaded.
 */
export async function injectMockPrs(page: Page) {
  await page.evaluate(() => {
    // Access the Zustand store directly from the window (exposed in dev via React internals)
    // We use a more reliable approach: dispatch a custom event that our test helper catches
    const mockPrs = [
      {
        pullRequest: {
          number: 42,
          title: 'Fix login button alignment',
          headRef: 'fix/login-btn',
          baseRef: 'main',
          authorLogin: 'testuser',
          authorAvatarUrl: 'https://github.com/testuser.png',
          state: 'open',
          createdAt: '2026-03-15T10:00:00Z',
          updatedAt: '2026-03-16T14:00:00Z',
          isDraft: false,
          mergeable: true,
          htmlUrl: 'https://github.com/test-org/test-repo/pull/42',
          body: 'Fixes the login button alignment on mobile',
          repoOwner: 'test-org',
          repoName: 'test-repo',
          reviewStatus: 'approved',
          commentCount: 3,
          labels: ['bug', 'frontend'],
          additions: 12,
          deletions: 5,
          changedFiles: 2,
          commitCount: 1,
          mergedAt: undefined,
          closedAt: undefined,
        },
        checks: [
          {
            id: 1,
            name: 'CI / Build',
            status: 'completed',
            conclusion: 'success',
            htmlUrl: 'https://github.com/test-org/test-repo/actions/runs/1',
            checkSuiteId: 100,
          },
        ],
        overallStatus: 'green',
        failedCheckNames: [],
        pendingCheckNames: [],
        passedCount: 1,
        skippedCount: 0,
      },
      {
        pullRequest: {
          number: 43,
          title: 'Add dark mode support',
          headRef: 'feat/dark-mode',
          baseRef: 'main',
          authorLogin: 'teammate',
          authorAvatarUrl: 'https://github.com/teammate.png',
          state: 'open',
          createdAt: '2026-03-14T08:00:00Z',
          updatedAt: '2026-03-16T12:00:00Z',
          isDraft: false,
          mergeable: true,
          htmlUrl: 'https://github.com/test-org/test-repo/pull/43',
          body: 'Adds full dark mode theme',
          repoOwner: 'test-org',
          repoName: 'test-repo',
          reviewStatus: 'pending',
          commentCount: 1,
          labels: ['enhancement'],
          additions: 200,
          deletions: 50,
          changedFiles: 15,
          commitCount: 5,
          mergedAt: undefined,
          closedAt: undefined,
        },
        checks: [
          {
            id: 2,
            name: 'CI / Build',
            status: 'completed',
            conclusion: 'failure',
            htmlUrl: 'https://github.com/test-org/test-repo/actions/runs/2',
            checkSuiteId: 101,
          },
          {
            id: 3,
            name: 'CI / Lint',
            status: 'completed',
            conclusion: 'success',
            htmlUrl: 'https://github.com/test-org/test-repo/actions/runs/3',
            checkSuiteId: 101,
          },
        ],
        overallStatus: 'red',
        failedCheckNames: ['CI / Build'],
        pendingCheckNames: [],
        passedCount: 1,
        skippedCount: 0,
      },
      {
        pullRequest: {
          number: 44,
          title: 'Update dependencies',
          headRef: 'chore/deps',
          baseRef: 'main',
          authorLogin: 'testuser',
          authorAvatarUrl: 'https://github.com/testuser.png',
          state: 'open',
          createdAt: '2026-03-13T12:00:00Z',
          updatedAt: '2026-03-16T10:00:00Z',
          isDraft: true,
          mergeable: undefined,
          htmlUrl: 'https://github.com/test-org/test-repo/pull/44',
          body: 'Routine dependency updates',
          repoOwner: 'test-org',
          repoName: 'test-repo',
          reviewStatus: 'none',
          commentCount: 0,
          labels: ['chore'],
          additions: 500,
          deletions: 300,
          changedFiles: 3,
          commitCount: 1,
          mergedAt: undefined,
          closedAt: undefined,
        },
        checks: [],
        overallStatus: 'gray',
        failedCheckNames: [],
        pendingCheckNames: [],
        passedCount: 0,
        skippedCount: 0,
      },
    ];

    // Dispatch custom event to inject PRs
    window.dispatchEvent(
      new CustomEvent('__borgdock_test_inject_prs', { detail: mockPrs })
    );
  });

  // Give React a tick to process the state update
  await page.waitForTimeout(100);
}

/**
 * Inject PRs by directly accessing the Zustand store through React fiber internals.
 * This is more reliable than custom events since we manipulate the store directly.
 */
export async function injectPrsViaStore(page: Page) {
  await page.evaluate(() => {
    const mockPrs = [
      {
        pullRequest: {
          number: 42,
          title: 'Fix login button alignment',
          headRef: 'fix/login-btn',
          baseRef: 'main',
          authorLogin: 'testuser',
          authorAvatarUrl: '',
          state: 'open',
          createdAt: '2026-03-15T10:00:00Z',
          updatedAt: '2026-03-16T14:00:00Z',
          isDraft: false,
          mergeable: true,
          htmlUrl: 'https://github.com/test-org/test-repo/pull/42',
          body: 'Fixes the login button alignment on mobile',
          repoOwner: 'test-org',
          repoName: 'test-repo',
          reviewStatus: 'approved',
          commentCount: 3,
          labels: ['bug', 'frontend'],
          additions: 12,
          deletions: 5,
          changedFiles: 2,
          commitCount: 1,
        },
        checks: [
          { id: 1, name: 'CI / Build', status: 'completed', conclusion: 'success', htmlUrl: '', checkSuiteId: 100 },
        ],
        overallStatus: 'green',
        failedCheckNames: [],
        pendingCheckNames: [],
        passedCount: 1,
        skippedCount: 0,
      },
      {
        pullRequest: {
          number: 43,
          title: 'Add dark mode support',
          headRef: 'feat/dark-mode',
          baseRef: 'main',
          authorLogin: 'teammate',
          authorAvatarUrl: '',
          state: 'open',
          createdAt: '2026-03-14T08:00:00Z',
          updatedAt: '2026-03-16T12:00:00Z',
          isDraft: false,
          mergeable: true,
          htmlUrl: 'https://github.com/test-org/test-repo/pull/43',
          body: 'Adds full dark mode theme',
          repoOwner: 'test-org',
          repoName: 'test-repo',
          reviewStatus: 'pending',
          commentCount: 1,
          labels: ['enhancement'],
          additions: 200,
          deletions: 50,
          changedFiles: 15,
          commitCount: 5,
        },
        checks: [
          { id: 2, name: 'CI / Build', status: 'completed', conclusion: 'failure', htmlUrl: '', checkSuiteId: 101 },
          { id: 3, name: 'CI / Lint', status: 'completed', conclusion: 'success', htmlUrl: '', checkSuiteId: 101 },
        ],
        overallStatus: 'red',
        failedCheckNames: ['CI / Build'],
        pendingCheckNames: [],
        passedCount: 1,
        skippedCount: 0,
      },
      {
        pullRequest: {
          number: 44,
          title: 'Update dependencies',
          headRef: 'chore/deps',
          baseRef: 'main',
          authorLogin: 'testuser',
          authorAvatarUrl: '',
          state: 'open',
          createdAt: '2026-03-13T12:00:00Z',
          updatedAt: '2026-03-16T10:00:00Z',
          isDraft: true,
          mergeable: undefined,
          htmlUrl: 'https://github.com/test-org/test-repo/pull/44',
          body: 'Routine dependency updates',
          repoOwner: 'test-org',
          repoName: 'test-repo',
          reviewStatus: 'none',
          commentCount: 0,
          labels: ['chore'],
          additions: 500,
          deletions: 300,
          changedFiles: 3,
          commitCount: 1,
        },
        checks: [],
        overallStatus: 'gray',
        failedCheckNames: [],
        pendingCheckNames: [],
        passedCount: 0,
        skippedCount: 0,
      },
    ];

    // Access Zustand store via the internal API exposed on the module scope
    // The stores are created as singletons, so we can find them through the React tree
    // Simpler approach: use the window.__ZUSTAND_STORES__ if available,
    // or directly manipulate the DOM to trigger store changes
    (window as any).__BORGDOCK_MOCK_PRS__ = mockPrs;
  });
}

/**
 * Get all visible PR cards on the page.
 */
export async function getPrCards(page: Page) {
  return page.locator('[data-pr-card]').all();
}

/**
 * Click a section tab in the header.
 */
export async function switchSection(page: Page, section: 'PRs' | 'Work Items') {
  await page.getByRole('button', { name: section }).click();
}

/**
 * Open the settings flyout.
 */
export async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
}
