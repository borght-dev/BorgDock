import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for BorgDock e2e.
 *
 * - Two OS projects (`webview-mac`, `webview-win`) so visual baselines
 *   are captured and compared per-platform.
 * - Both projects run Playwright's bundled Chromium. This is a proxy
 *   for WebView2 (Windows) / WKWebView (macOS) — we're catching
 *   OS-level font rasterization differences, not WebView-engine
 *   differences. Running the real WebView would require driving a
 *   packaged Tauri build through WebDriver, which is out of scope.
 * - Auto-starts `npm run dev` (pure Vite, no Tauri) so CI does not
 *   require a second shell. If `npm run tauri dev` is already running
 *   locally, `reuseExistingServer: !process.env.CI` reuses its
 *   bundled Vite at 1420 instead of starting a new one.
 * - Snapshot paths include {projectName} so mac/win baselines sit in
 *   separate folders under __screenshots__/.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Playwright specs are `.spec.ts`. The sibling `fixtures/__tests__/*.test.ts`
  // files are vitest unit tests that happen to live under tests/e2e/ and
  // import from `vitest` — loading them into Playwright crashes the whole run
  // with "Cannot redefine property: Symbol($$jest-matchers-object)" before any
  // test executes. Restricting testMatch to `.spec.ts` keeps the two runners
  // cleanly separated.
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker: tests share one Vite origin + Zustand store via __borgdock_test_seed, so parallel workers would race on shared state.
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:1420',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Static server for the vendored design bundle. The bundle's HTML
      // loads sibling `.jsx` files via <script type="text/babel" src>.
      // Babel's in-browser transformer needs http(s) to fetch them;
      // file:// navigation fails with CORS (only chrome/data/http/https
      // schemes are allowed by Chromium). Serving over http unblocks it.
      command: 'npx http-server tests/e2e/design-bundle -p 1421 -s --cors -c-1 -d false',
      url: 'http://localhost:1421',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
  /**
   * Snapshots are shared across every spec so the capture spec
   * (tests/e2e/scripts/capture-design-baselines.spec.ts) and consumer
   * specs (tests/e2e/visual.spec.ts, Tasks 10-18 behavioral specs) all
   * reach the same baselines at `__screenshots__/<project>/design/…`.
   *
   * CONVENTION for behavioral specs: pass `toHaveScreenshot` a TUPLE
   * whose first element is the spec's own directory, e.g.
   * `['behavioral/<spec-name>', 'scroll-state.png']`. The string form
   * `'behavioral/<spec-name>/scroll-state.png'` DOES NOT WORK —
   * Playwright sanitizes the `/` to `-`, collapsing the namespace.
   */
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  projects: [
    {
      name: 'webview-mac',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      metadata: { os: 'mac' },
    },
    {
      name: 'webview-win',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      metadata: { os: 'win' },
    },
  ],
});
