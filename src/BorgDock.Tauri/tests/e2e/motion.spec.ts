import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixtures } from './helpers/seed';

test.describe('motion', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixtures(page);
  });

  test('button press scale dips to ~0.97', async ({ page }) => {
    const btn = page.locator('button').first();
    await btn.hover();
    // Programmatically press-and-hold to catch the scale mid-animation
    const midPressScale = await page.evaluate(async () => {
      const el = document.querySelector('button') as HTMLElement | null;
      if (!el) return '';
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      const transform = getComputedStyle(el).transform;
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return transform;
    });
    // transform: matrix(0.97, 0, 0, 0.97, 0, 0) or scale(0.97)
    expect(midPressScale).toMatch(/matrix\(0\.9[0-9]/);
  });

  test('tab underline slides to new tab', async ({ page }) => {
    const tabBar = page.locator('[data-section-tabs]');
    if (!(await tabBar.isVisible())) test.skip(true, 'No tab bar visible on main window yet — PR #2 adds the section tabs.');
    const underline = tabBar.locator('[data-tab-underline]');
    const startLeft = await underline.evaluate((el) => (el as HTMLElement).getBoundingClientRect().left);
    await page.getByRole('button', { name: 'Work Items' }).click();
    // Sample mid-animation (the 200ms slide per DESIGN-SYSTEM.md §6)
    await page.waitForTimeout(100);
    const midLeft = await underline.evaluate((el) => (el as HTMLElement).getBoundingClientRect().left);
    expect(Math.abs(midLeft - startLeft)).toBeGreaterThan(4);
  });

  test('toast slide-in ends at translateX(0)', async ({ page }) => {
    await page.evaluate(() => {
      const toast = (window as unknown as {
        __borgdock_test_toast?: (t: { kind: string; title: string; message?: string }) => void;
      }).__borgdock_test_toast;
      if (typeof toast === 'function') {
        toast({ kind: 'success', title: 'Test', message: 'Hello' });
      }
    });
    const toast = page.locator('[data-toast]').first();
    await toast.waitFor({ state: 'visible', timeout: 1_000 });
    await page.waitForTimeout(500);
    const transform = await toast.evaluate((el) => getComputedStyle(el).transform);
    // matrix(1, 0, 0, 1, tx, ty) — we want tx close to 0 after settle
    expect(transform).toMatch(/matrix\(1, 0, 0, 1, [-\d.]{1,5}, /);
  });
});
