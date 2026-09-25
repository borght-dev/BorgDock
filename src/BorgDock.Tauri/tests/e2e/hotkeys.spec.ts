import { expect, type Page, test } from '@playwright/test';
import { SAMPLE_PRS } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * In-page hotkeys.
 *
 * BorgDock's "open palette" / "toggle flyout" hotkeys are OS-level via
 * `register_user_hotkeys` (see App.tsx) — they don't fire from a Playwright
 * `page.keyboard.press`. The hotkeys we CAN exercise here are the ones the
 * React tree wires up directly via document keydown listeners, see
 * `src/hooks/useKeyboardNav.ts`:
 *
 *   - ArrowDown/Up + j/k step through the PR rows as drawn (shifts which row
 *     gets `data-selected="true"`); with nothing selected the first key
 *     selects the first row.
 *   - Escape clears the selection.
 *
 * If a hotkey ever lands inside the React tree (e.g. Mod+P opening a
 * palette inline), extend this spec; until then the OS-level path can't
 * be asserted from Vite-only Playwright.
 */

const row = (page: Page, n: number) => page.locator(`.bd-wb-row[data-pr-number="${n}"]`);

async function bootPrList(page: Page) {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: /^Pull requests/ })
    .click();
  // Ensure both rows rendered before pressing arrow keys.
  await expect(row(page, 42)).toHaveCount(1);
  await expect(row(page, 43)).toHaveCount(1);
  // useKeyboardNav listens on document, but only when focus isn't in an
  // input/textarea: click the head row's title so the body has focus.
  await page.locator('.bd-wb-head__title').click();
}

/** The rows in the order the list draws them, by PR number. */
async function drawnOrder(page: Page): Promise<string[]> {
  return page
    .locator('.bd-wb-list .bd-wb-row[data-pr-number]')
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.prNumber ?? ''));
}

test('ArrowDown selects the first row, then the next one', async ({ page }) => {
  await bootPrList(page);
  const [first, second] = await drawnOrder(page);
  await page.keyboard.press('ArrowDown');
  await expect(row(page, Number(first))).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(row(page, Number(second))).toHaveAttribute('data-selected', 'true');
  await expect(row(page, Number(first))).not.toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('k');
  await expect(row(page, Number(first))).toHaveAttribute('data-selected', 'true');
});

test('Escape clears the PR selection', async ({ page }) => {
  await bootPrList(page);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.bd-wb-row[data-selected="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.bd-wb-row[data-selected="true"]')).toHaveCount(0);
});
