import type { Page } from '@playwright/test';
import { installMockTauri, getInvokeLog, type MockHandlers } from './mock-tauri';
import { renderSmoke } from './render-smoke';
import { seedScenario, type Scenario } from './seed';

/**
 * Frozen clock for deterministic captures. All tests see this date.
 */
const FROZEN_CLOCK_ISO = '2026-05-08T10:00:00Z';

/**
 * Inject Date / performance.now overrides at page-init time.
 */
export async function freezeClock(
  page: Page,
  iso: string = FROZEN_CLOCK_ISO,
): Promise<void> {
  const ms = new Date(iso).getTime();
  await page.addInitScript((frozenMs: number) => {
    const OriginalDate = Date;
    class FrozenDate extends OriginalDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(frozenMs);
        } else {
          // @ts-expect-error -- delegating to OriginalDate constructor
          super(...args);
        }
      }
      static now(): number {
        return frozenMs;
      }
    }
    (window as unknown as { Date: unknown }).Date = FrozenDate;
    const originalPerfNow = performance.now.bind(performance);
    let perfStart = originalPerfNow();
    performance.now = () => originalPerfNow() - perfStart;
    perfStart = 0;
  }, ms);
}

/**
 * Disable all CSS animations & transitions globally for stability.
 */
export async function disableAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `;
    // Insert ASAP — DOM may not exist yet.
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    }
  });
}

/**
 * Compose the standard boot sequence: install mocks (with scenario
 * overrides), freeze clock, disable animations, navigate to the
 * window's HTML entry, run renderSmoke. Every spec calls this.
 *
 * @param page  Playwright page
 * @param entry HTML entry path (without leading slash) — '' for the main window
 * @param scenario Named state scenario (default 'happy-path')
 * @param extraHandlers Per-test handler overrides merged on top of scenario
 */
export async function bootApp(
  page: Page,
  entry: string = '',
  scenario: Scenario = 'happy-path',
  extraHandlers: MockHandlers = {},
): Promise<void> {
  const handlers = { ...seedScenario(scenario), ...extraHandlers };
  await freezeClock(page);
  await disableAnimations(page);
  // Block real network egress to api.github.com / dev.azure.com — tests
  // that need PR data seed via mock IPC (cache_load_prs). Returning an
  // empty list keeps callers like getOpenPRs from blowing up, and the
  // background API refresh just no-ops.
  await page.route(
    /(api\.github\.com|dev\.azure\.com|vsaex\.dev\.azure\.com)/,
    (route) => {
      const url = route.request().url();
      // /user is hit for username detection — return a user object so the
      // optional `.login` read doesn't 401-error in the console.
      if (url.endsWith('/user')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ login: 'test-user' }),
        });
      }
      // Default: empty list (most GitHub endpoints expect arrays).
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    },
  );
  await installMockTauri(page, handlers);
  const path = entry === '' ? '/' : `/${entry}`;
  await page.goto(path);

  // Some windows wait on a Tauri event (e.g. flyout's `init-complete`) that
  // never fires in a pure-Vite test. Each such window exposes a test-seed
  // function on `window.__borgdock_test_*_seed` from a DEV-only useEffect;
  // we call it after the effect has had a tick to run so the reducer leaves
  // its initializing state and `data-app-ready` flips to true.
  if (entry === 'flyout.html') {
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __borgdock_test_flyout_seed?: unknown })
          .__borgdock_test_flyout_seed === 'function',
      { timeout: 5_000 },
    );
    await page.evaluate(() => {
      (
        window as unknown as {
          __borgdock_test_flyout_seed: (p: { mode: 'glance' }) => void;
        }
      ).__borgdock_test_flyout_seed({ mode: 'glance' });
    });
  }

  await renderSmoke(page);
}

/**
 * Push fixtures directly into the main window's Zustand stores via the
 * dev-only `window.__borgdock_test_seed` hook (see `src/test-support/test-seed.ts`).
 *
 * The init sequence's background API refresh would otherwise overwrite the
 * mock IPC's `cache_load_prs` payload with whatever the routed network mock
 * returns, so anything that needs PRs visible after boot has to seed via
 * this side-channel.
 */
export async function seedMainWindow(
  page: Page,
  payload: {
    prs?: unknown[];
    workItems?: unknown[];
    settings?: Record<string, unknown>;
  },
): Promise<void> {
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __borgdock_test_seed?: unknown })
        .__borgdock_test_seed === 'function',
    { timeout: 5_000 },
  );
  await page.evaluate(
    (p) => {
      (
        window as unknown as {
          __borgdock_test_seed: (p: unknown) => void;
        }
      ).__borgdock_test_seed(p);
    },
    payload,
  );
}

/**
 * Synthesize a hotkey press. Translates 'Mod' to Meta on darwin,
 * Control elsewhere — CI runs Linux so it gets Control.
 */
export async function pressHotkey(page: Page, combo: string): Promise<void> {
  const isMac = process.platform === 'darwin';
  const translated = combo.replace(/\bMod\b/g, isMac ? 'Meta' : 'Control');
  await page.keyboard.press(translated);
}

/**
 * Wait for a specific invoke command to appear in the mock log.
 * Polls every 50ms up to timeout.
 */
export async function waitForInvoke(
  page: Page,
  cmd: string,
  timeout: number = 5000,
): Promise<{ cmd: string; args: unknown }> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const log = await getInvokeLog(page);
    const found = log.find((e) => e.cmd === cmd);
    if (found) return found;
    await page.waitForTimeout(50);
  }
  throw new Error(`waitForInvoke: "${cmd}" not seen within ${timeout}ms`);
}

/**
 * Assert a specific invoke command was called (with optional args predicate).
 */
export async function expectInvoked(
  page: Page,
  cmd: string,
  argsPredicate?: (args: unknown) => boolean,
): Promise<void> {
  const log = await getInvokeLog(page);
  const matches = log.filter((e) => e.cmd === cmd);
  if (matches.length === 0) {
    throw new Error(
      `expectInvoked: "${cmd}" not in invokeLog. Log: ${JSON.stringify(log.map((e) => e.cmd))}`,
    );
  }
  if (argsPredicate && !matches.some((m) => argsPredicate(m.args))) {
    throw new Error(
      `expectInvoked: "${cmd}" was called but args predicate failed. Args: ${JSON.stringify(matches.map((m) => m.args))}`,
    );
  }
}
