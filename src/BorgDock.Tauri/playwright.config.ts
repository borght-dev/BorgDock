import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for BorgDock e2e.
 *
 * - Single project (chromium) on a Linux-friendly viewport.
 * - Single webserver: `bun run dev` (pure Vite, Tauri IPC mocked in-page).
 * - workers: 1 because tests share one Vite origin and seeded Zustand
 *   state — parallel workers would race.
 * - testMatch is the default (.spec.ts / .test.ts under testDir); we no
 *   longer co-locate vitest tests inside tests/e2e/, so no exclusion
 *   workaround is needed.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
