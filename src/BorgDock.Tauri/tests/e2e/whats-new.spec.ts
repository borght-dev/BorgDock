import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { expectNoA11yViolations } from './helpers/a11y';

test.describe('whats new', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    // Pin the expanded release to one that has multiple highlight kinds so the
    // [data-highlight-kind="new"|"improved"|"fixed"] assertions can find them.
    // The newest release ('1.1.0') has empty highlights; '1.0.15' has both
    // 'new' and 'improved'.
    await page.addInitScript(() => {
      (window as unknown as { __BORGDOCK_WHATS_NEW__: { version: string } }).__BORGDOCK_WHATS_NEW__ = {
        version: '1.0.15',
      };
    });
    await page.goto('/whats-new.html');
    await waitForAppReady(page);
  });

  test('renders release header', async ({ page }) => {
    await expect(page.locator('[data-release-version]').first()).toBeVisible();
  });

  test('highlight types render distinct pills', async ({ page }) => {
    const newPill = page.locator('[data-highlight-kind="new"]').first();
    const improvedPill = page.locator('[data-highlight-kind="improved"]').first();
    const fixedPill = page.locator('[data-highlight-kind="fixed"]').first();
    // At least two of three should be present across releases
    const visible = [
      await newPill.count(),
      await improvedPill.count(),
      await fixedPill.count(),
    ].filter((c) => c > 0).length;
    expect(visible).toBeGreaterThanOrEqual(2);
  });

  test('accordion expands/collapses', async ({ page }) => {
    const accordion = page.locator('[data-fixed-accordion]').first();
    await expect(accordion).toBeVisible();
    const headerBtn = accordion.locator('button').first();
    const isOpen = await accordion.getAttribute('data-open');
    await headerBtn.click();
    const afterOpen = await accordion.getAttribute('data-open');
    expect(afterOpen).not.toBe(isOpen);
  });

  test('has no WCAG 2.1 AA violations', async ({ page }) => {
    await expectNoA11yViolations(page);
  });
});
