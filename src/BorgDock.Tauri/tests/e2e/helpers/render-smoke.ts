import { expect, type Page } from '@playwright/test';

/**
 * Per-window render smoke check. Asserts:
 *   - page.goto resolved
 *   - [data-app-ready] mounted (set by each window's App.tsx after the
 *     first IPC roundtrip resolves)
 *   - no console.error fired during boot
 *   - no unhandled page errors (uncaught exceptions, rejected promises)
 *
 * `allowConsoleErrors`: optional regex allowlist for noisy known errors.
 * Use sparingly — each entry is a code-review red flag.
 */
export async function renderSmoke(
  page: Page,
  opts: { allowConsoleErrors?: RegExp[]; readyTimeout?: number } = {},
): Promise<void> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const allow = opts.allowConsoleErrors ?? [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (allow.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  // 'attached' (not 'visible') because some App roots set the attribute on
  // a `display: contents` wrapper — the element renders no visible box itself.
  await page.waitForSelector('[data-app-ready="true"]', {
    state: 'attached',
    timeout: opts.readyTimeout ?? 10_000,
  });

  // Tiny settle for any error firing on the same tick as ready.
  await page.waitForTimeout(50);

  expect(consoleErrors, 'console.error during boot').toEqual([]);
  expect(pageErrors, 'unhandled page errors during boot').toEqual([]);
}
