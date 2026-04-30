/**
 * Tray-first boot smoke tests — verify that the App.tsx tray-first useEffect
 * fires the correct invoke command depending on whether setup is needed.
 *
 * Task 16 introduced the "tray-first" boot model: on launch the Rust side parks
 * the main window 1×1 off-screen. The frontend mirrors this by immediately
 * invoking `hide_sidebar` when setup is complete, and `show_setup_wizard` when
 * it is not. These tests assert that invariant at the frontend level without
 * needing a real Tauri backend.
 *
 * Harness notes:
 *  - We use `page.addInitScript` (a string) to install the Tauri mock before
 *    any page JS runs — same pattern as window-rendering.spec.ts and test-utils.ts.
 *  - `TAURI_MOCK_SCRIPT` from test-utils already stubs __TAURI_INTERNALS__.invoke.
 *  - We extend it inline to (a) override load_settings with `setupComplete: true`
 *    and (b) wrap the invoke function so every command name is appended to
 *    `window.__invokedCommands` for later retrieval by `page.evaluate`.
 *  - The `waitForFunction` poll runs in the page context, so it can observe the
 *    array as it fills up without a fixed sleep.
 *
 * TODO: These tests are skipped because `page.goto('/')` (the main sidebar
 * window / index.html) times out when `npm run tauri dev` is running alongside
 * Playwright. The same pre-existing issue affects the `pr-list` and
 * `settings` specs — navigating to the main window while the Tauri WebView2
 * process holds it open causes Playwright's Chromium instance to hang on
 * "load". Secondary windows (work-item-palette.html, sql.html, etc.) are unaffected
 * because no live Tauri window holds them open.
 *
 * To run these tests manually:
 *   1. Stop any running `tauri dev` process.
 *   2. Start Vite standalone: `npm run dev` (serves http://localhost:1420).
 *   3. Run: `npm run test:e2e -- tray-first`
 *
 * The skip can be removed once the E2E harness is configured to run against a
 * dedicated Vite-only preview server (not the live Tauri dev window).
 */
import { expect, test } from '@playwright/test';
import { TAURI_MOCK_SCRIPT } from './helpers/test-utils';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Build the init-script string for a given setup state.
 * Wraps TAURI_MOCK_SCRIPT's invoke so all command names accumulate in
 * `window.__invokedCommands`.
 */
function buildTrayFirstInitScript(setupComplete: boolean): string {
  const settings = {
    setupComplete,
    gitHub: {
      authMethod: 'ghCli',
      personalAccessToken: null,
      pollIntervalSeconds: 60,
      username: setupComplete ? 'testuser' : '',
    },
    repos: setupComplete
      ? [{ owner: 'org', name: 'repo', enabled: true, worktreeBasePath: '/home/user/repo', worktreeSubfolder: '.worktrees' }]
      : [],
    ui: {
      sidebarEdge: 'right',
      sidebarMode: 'pinned',
      sidebarWidthPx: 380,
      theme: 'dark',
      globalHotkey: 'Ctrl+Shift+P',
      flyoutHotkey: 'Ctrl+Win+Shift+F',
      editorCommand: 'code',
      runAtStartup: false,
      worktreePaletteFavoritesOnly: false,
      filePaletteFavoritesOnly: false,
      filePaletteRootsCollapsed: false,
    },
    notifications: {
      toastOnCheckStatusChange: true,
      toastOnNewPr: false,
      toastOnReviewUpdate: true,
      toastOnMergeable: true,
      onlyMyPrs: false,
      reviewNudgeEnabled: true,
      reviewNudgeIntervalMinutes: 60,
      reviewNudgeEscalation: true,
      deduplicationWindowSeconds: 60,
    },
    claudeCode: { defaultPostFixAction: 'commitAndNotify', claudeCodePath: null },
    claudeReview: { botUsername: 'claude[bot]' },
    updates: { autoCheckEnabled: false, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      authMethod: 'azCli',
      authAutoDetected: false,
      personalAccessToken: null,
      pollIntervalSeconds: 120,
      favoriteQueryIds: [],
      lastSelectedQueryId: null,
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
    },
    sql: { connections: [], lastUsedConnection: null },
    claudeApi: { apiKey: null, model: 'claude-sonnet-4-6', maxTokens: 1024 },
    repoPriority: {},
  };

  return `
    ${TAURI_MOCK_SCRIPT}

    // Inject completed (or incomplete) settings so load_settings reflects the test scenario.
    window.__BORGDOCK_MOCK_SETTINGS__ = ${JSON.stringify(settings)};

    // Wrap the existing mock invoke to record every command name so tests can
    // assert which commands were (or were not) called by the frontend.
    window.__invokedCommands = [];
    const _origInvoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
      window.__invokedCommands.push(cmd);
      return _origInvoke(cmd, args);
    };
  `;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('tray-first boot', () => {
  // Skip reason: see file-level comment. Remove skip once the harness targets
  // a Vite-only server rather than the live tauri dev window.
  test.skip(true, 'page.goto("/") hangs when tauri dev is running; run manually against a Vite-only server');

  test('invokes hide_sidebar when setup is complete', async ({ page }) => {
    // Install mock before any page JS runs.
    await page.addInitScript(buildTrayFirstInitScript(true));
    await page.goto('/');

    // The App.tsx tray-first useEffect fires when `needsSetup` settles.
    // `needsSetup === false` when setupComplete=true AND repos.length > 0
    // AND (authMethod != 'pat' OR pat is set). Our mock satisfies all three.
    // Poll until hide_sidebar appears in the recorded command list (max 5 s).
    await page.waitForFunction(
      () => {
        const calls = (window as any).__invokedCommands as string[] | undefined;
        return Array.isArray(calls) && calls.includes('hide_sidebar');
      },
      { timeout: 5_000 },
    );

    const calls: string[] = await page.evaluate(
      () => (window as any).__invokedCommands ?? [],
    );

    // Core invariant: tray-first parks the main window via hide_sidebar.
    expect(calls).toContain('hide_sidebar');

    // Negative invariants: these commands must NOT be called when setup is done.
    expect(calls).not.toContain('show_setup_wizard');
    // Legacy notification command removed in the tray-first rewrite.
    expect(calls).not.toContain('send_notification');
  });

  test('invokes show_setup_wizard when setup is incomplete', async ({ page }) => {
    // setupComplete=false → needsSetup=true → show_setup_wizard must fire.
    await page.addInitScript(buildTrayFirstInitScript(false));
    await page.goto('/');

    await page.waitForFunction(
      () => {
        const calls = (window as any).__invokedCommands as string[] | undefined;
        return Array.isArray(calls) && calls.includes('show_setup_wizard');
      },
      { timeout: 5_000 },
    );

    const calls: string[] = await page.evaluate(
      () => (window as any).__invokedCommands ?? [],
    );

    expect(calls).toContain('show_setup_wizard');
    // The window must NOT be parked while setup is pending.
    expect(calls).not.toContain('hide_sidebar');
  });
});
