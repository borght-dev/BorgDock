import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for BorgDock e2e.
 *
 * - Two OS projects (`webview-mac`, `webview-win`) so visual baselines
 *   are captured and compared per-platform.
 * - Auto-starts `npm run dev` (pure Vite, no Tauri) so CI does not
 *   require a second shell.
 * - Snapshot paths include {projectName} so mac/win baselines sit in
 *   separate folders under __screenshots__/.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // app is a single dev server — no parallelism gain
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{projectName}/{testFileDir}/{testFileName}/{arg}{ext}',
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
