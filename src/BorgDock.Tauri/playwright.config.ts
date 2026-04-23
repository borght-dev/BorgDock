import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    // Tauri webview testing — the app must be running separately
    // We connect to the dev server URL
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Don't start the dev server automatically since Tauri must be started separately
  // webServer: { command: 'npm run dev', port: 1420, reuseExistingServer: true },
  projects: [
    {
      name: 'webview',
      use: {},
    },
  ],
});
