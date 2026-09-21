import { expect, test } from '@playwright/test';
import { SAMPLE_PRS } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * In-page hotkeys.
 *
 * BorgDock's "open palette" / "toggle flyout" hotkeys are OS-level via
 * `register_user_hotkeys` (see App.tsx ~line 200) — they don't fire from
 * a Playwright `page.keyboard.press`. The hotkeys we CAN exercise here
 * are the ones the React tree wires up directly via document keydown
 * listeners, see `src/hooks/useKeyboardNav.ts`:
 *
 *   - ArrowDown/Up + j/k step through the PR list (shifts which row
 *     gets `data-selected="true"`).
 *   - Escape clears the selection (`selectedPrNumber → null`).
 *
 * If a hotkey ever lands inside the React tree (e.g. Mod+P opening a
 * palette inline), extend this spec; until then the OS-level path can't
 * be asserted from Vite-only Playwright.
 */

test('ArrowDown selects the next PR', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await page.getByRole('tab', { name: 'PRs' }).click();
  // Ensure both cards rendered before pressing arrow keys.
  await expect(page.locator('[data-pr-row][data-pr-number="42"]')).toHaveCount(1);
  await expect(page.locator('[data-pr-row][data-pr-number="43"]')).toHaveCount(1);
  // useKeyboardNav listens on document, but only when focus isn't in an
  // input/textarea — make sure the body has focus first.
  await page.locator('body').click();
  await page.keyboard.press('ArrowDown');
  // ArrowDown bumps focusedIndexRef from 0 to 1 → selectPr(43).
  await expect(page.locator('[data-pr-row][data-pr-number="43"]')).toHaveAttribute(
    'data-selected',
    'true',
  );
});

test('Escape clears the PR selection', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await page.getByRole('tab', { name: 'PRs' }).click();
  await page.locator('body').click();
  // Select via ArrowDown, then Esc to clear.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-pr-row][data-pr-number="43"]')).toHaveAttribute(
    'data-selected',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-pr-row][data-selected="true"]')).toHaveCount(0);
});
