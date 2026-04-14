/**
 * Window rendering smoke tests — verify that every secondary window
 * loads its HTML, executes JS, mounts React, and renders non-empty
 * content. These catch the class of bugs where a window opens but
 * shows a blank white/transparent pane.
 */
import { test, expect } from '@playwright/test';
import { TAURI_MOCK_SCRIPT } from './helpers/test-utils';

/**
 * Extended Tauri mock that also handles invoke commands used by
 * secondary windows (worktree list, settings, cache, etc.).
 */
const SECONDARY_WINDOW_MOCKS = `
  ${TAURI_MOCK_SCRIPT}

  // Override invoke with additional commands for secondary windows
  const _baseInvoke = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    switch (cmd) {
      case 'load_settings':
        return {
          setupComplete: true,
          gitHub: {
            authMethod: 'pat',
            personalAccessToken: 'ghp_test',
            pollIntervalSeconds: 60,
            username: 'testuser',
          },
          repos: [{
            owner: 'org', name: 'repo', enabled: true,
            worktreeBasePath: '/home/user/repo',
            worktreeSubfolder: '.worktrees',
          }],
          ui: { theme: 'dark', sidebarEdge: 'right', sidebarMode: 'pinned',
                sidebarWidthPx: 380, globalHotkey: 'Ctrl+Shift+P',
                editorCommand: 'code', badgeStyle: 'GlassCapsule',
                indicatorStyle: 'SegmentRing' },
          notifications: { toastOnCheckStatusChange: true, toastOnNewPR: true, toastOnReviewUpdate: true },
          azureDevOps: {
            organization: 'org', project: 'proj', personalAccessToken: 'pat',
            recentWorkItemIds: [], workingOnWorkItemIds: [],
            favoriteQueryIds: [], trackedWorkItemIds: [],
            workItemWorktreePaths: {},
          },
          claudeCode: { defaultPostFixAction: 'commitAndNotify' },
          claudeReview: { botUsername: 'claude-code' },
          updates: { autoCheckEnabled: false, autoDownload: false },
          sql: {
            connections: [
              { name: 'DevDB', server: 'localhost', port: 1433,
                database: 'test', authentication: 'sql',
                trustServerCertificate: true },
            ],
            lastUsedConnection: 'DevDB',
          },
        };

      case 'list_worktrees_bare':
        return [
          { path: '/home/user/repo', branchName: 'main', isMainWorktree: true },
          { path: '/home/user/repo/.worktrees/feat', branchName: 'feat', isMainWorktree: false },
        ];

      case 'cache_init':
      case 'get_cached_prs':
      case 'save_settings':
      case 'register_hotkey':
      case 'unregister_hotkey':
      case 'position_sidebar':
      case 'open_in_terminal':
      case 'open_in_editor':
      case 'execute_sql_query':
        return null;

      case 'check_github_auth':
        return 'testuser';

      default:
        console.warn('[mock] unhandled invoke:', cmd, args);
        return null;
    }
  };

  // Mock event listener for badge/flyout windows
  window.__TAURI_INTERNALS__.__listeners = {};
  window.__TAURI_INTERNALS__.transformCallback = (fn) => {
    const id = Math.random().toString(36).slice(2);
    window['_' + id] = fn;
    return Number(id) || 0;
  };
`;

// ── Test definitions ─────────────────────────────────────────────────
// Each entry: URL to navigate to, what to check for non-blank rendering.

interface WindowSpec {
  name: string;
  url: string;
  /** CSS selector that must be visible to prove the window rendered */
  contentSelector: string;
  /** Optional: text that must be present */
  expectedText?: string | RegExp;
  /** Optional: additional assertions */
  noJsErrors?: boolean;
}

// The main sidebar (index.html) has a complex boot sequence with logging,
// focus management, and a splash screen. It is covered by the other E2E
// specs (pr-list, settings, etc.) — this suite focuses on secondary windows
// that are created dynamically and are more likely to render blank.
const WINDOWS: WindowSpec[] = [
  {
    name: 'Badge (badge.html)',
    url: '/badge.html',
    contentSelector: '#root',
    noJsErrors: true,
  },
  {
    name: 'Command Palette (palette.html)',
    url: '/palette.html',
    contentSelector: 'input',
    expectedText: /search/i,
  },
  {
    name: 'Worktree Palette (worktree.html)',
    url: '/worktree.html',
    contentSelector: '#root',
    expectedText: /worktree/i,
  },
  {
    name: 'SQL Window (sql.html)',
    url: '/sql.html',
    contentSelector: '#root',
    expectedText: /sql/i,
  },
  {
    name: 'PR Detail (pr-detail.html)',
    url: '/pr-detail.html?owner=test&repo=app&number=42',
    contentSelector: '#root',
    // Should show at least a title bar or loading spinner or error
    expectedText: /PR #42|Pull Request|Loading|Missing/i,
  },
  {
    name: 'Work Item Detail (workitem-detail.html)',
    url: '/workitem-detail.html',
    contentSelector: '#root',
  },
  {
    name: 'Flyout (flyout.html)',
    url: '/flyout.html',
    contentSelector: '#root',
  },
];

// ── Tests ────────────────────────────────────────────────────────────

test.describe('Window rendering smoke tests', () => {
  for (const win of WINDOWS) {
    test.describe(win.name, () => {
      test('mounts React into #root (not blank)', async ({ page }) => {
        const jsErrors: string[] = [];
        page.on('pageerror', (err) => jsErrors.push(err.message));

        await page.addInitScript(SECONDARY_WINDOW_MOCKS);
        await page.goto(win.url);

        // Wait for React to mount — #root should have child elements
        const root = page.locator('#root');
        await expect(root).toBeVisible({ timeout: 10_000 });

        // The critical check: #root must contain rendered content,
        // not just be an empty div.
        await expect(async () => {
          const childCount = await root.evaluate(
            (el) => el.children.length,
          );
          expect(childCount).toBeGreaterThan(0);
        }).toPass({ timeout: 10_000 });
      });

      test('renders visible content (not invisible/transparent)', async ({ page }) => {
        await page.addInitScript(SECONDARY_WINDOW_MOCKS);
        await page.goto(win.url);

        const content = page.locator(win.contentSelector);
        await expect(content.first()).toBeVisible({ timeout: 10_000 });

        // Verify the page has actual visible text (not just empty containers)
        const bodyText = await page.locator('body').innerText({ timeout: 10_000 });
        expect(bodyText.trim().length).toBeGreaterThan(0);
      });

      if (win.expectedText) {
        test(`shows expected content: ${win.expectedText}`, async ({ page }) => {
          await page.addInitScript(SECONDARY_WINDOW_MOCKS);
          await page.goto(win.url);

          await expect(page.locator('body')).toContainText(win.expectedText!, {
            timeout: 10_000,
          });
        });
      }

      test('no uncaught JS errors during load', async ({ page }) => {
        const jsErrors: string[] = [];
        page.on('pageerror', (err) => jsErrors.push(err.message));

        await page.addInitScript(SECONDARY_WINDOW_MOCKS);
        await page.goto(win.url);

        // Give async effects time to fire
        await page.waitForTimeout(2000);

        // Filter out known Tauri mock limitations
        const realErrors = jsErrors.filter(
          (e) =>
            !e.includes('__TAURI') &&
            !e.includes('listen') &&
            !e.includes('event') &&
            !e.includes('plugin') &&
            !e.includes('not running in Tauri'),
        );

        expect(
          realErrors,
          `Uncaught JS errors in ${win.name}:\n${realErrors.join('\n')}`,
        ).toHaveLength(0);
      });

      test('CSS loads (has styled elements)', async ({ page }) => {
        await page.addInitScript(SECONDARY_WINDOW_MOCKS);
        await page.goto(win.url);

        // Wait for content
        await expect(page.locator('#root')).toBeVisible({ timeout: 10_000 });

        // Verify that CSS is loaded — check that at least one element
        // has non-default styling (background-color, font-family, etc.)
        const hasStyles = await page.evaluate(() => {
          const el =
            document.querySelector('#root > *') ??
            document.querySelector('#root');
          if (!el) return false;
          const styles = window.getComputedStyle(el);
          // If CSS didn't load, everything would be Times New Roman
          return !styles.fontFamily.includes('Times');
        });

        expect(hasStyles, `CSS not loaded in ${win.name}`).toBe(true);
      });

      test('no ErrorBoundary crash screen', async ({ page }) => {
        await page.addInitScript(SECONDARY_WINDOW_MOCKS);
        await page.goto(win.url);

        // Give React time to mount and effects to fire
        await page.waitForTimeout(2000);

        // The ErrorBoundary "Something went wrong" fallback should never show.
        // This catches crashes that are invisible (white text on white bg).
        const rootHtml = await page.locator('#root').innerHTML();
        expect(
          rootHtml,
          `${win.name} hit the ErrorBoundary crash screen`,
        ).not.toContain('Something went wrong');
      });
    });
  }
});
