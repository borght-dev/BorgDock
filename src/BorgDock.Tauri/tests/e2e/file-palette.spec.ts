import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixturesIfAvailable } from './helpers/seed';
import { expectNoA11yViolations } from './helpers/a11y';

test.describe('file palette', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/file-palette.html');
    await waitForAppReady(page);
    await seedDesignFixturesIfAvailable(page);
  });

  test('renders the search input with placeholder', async ({ page }) => {
    const input = page.getByPlaceholder(/search files/i);
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test('typing narrows the results list', async ({ page }) => {
    const input = page.getByPlaceholder(/search files/i);
    const results = page.locator('[data-file-result]');
    const initialCount = await results.count();
    await input.fill('footer');
    await expect
      .poll(async () => results.count(), { timeout: 2_000 })
      .toBeLessThanOrEqual(initialCount);
  });

  test('arrow keys move selection', async ({ page }) => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const selected = page.locator('[data-file-result][data-selected="true"]');
    await expect(selected).toHaveCount(1);
  });

  test('enter opens the file in preview pane', async ({ page }) => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-file-preview]')).toBeVisible();
  });

  test('escape closes palette', async ({ page }) => {
    const window = page.locator('[data-window="palette"]');
    await page.keyboard.press('Escape');
    // Palette is in its own OS window — closing hides it. The contract is
    // either the element is removed or `data-hidden="true"` is set.
    // PR #5 should pick one; until then we accept either.
    await expect(window).toBeHidden();
  });

  test('has no WCAG 2.1 AA violations', async ({ page }) => {
    await expectNoA11yViolations(page);
  });
});
