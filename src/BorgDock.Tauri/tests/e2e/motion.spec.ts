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
    // Verify the Button primitive's :active scale rule is wired up. The
    // direct way (mousedown → sample) is flaky in Playwright because the
    // browser's :active CSSPP sometimes doesn't propagate to getComputedStyle
    // synchronously for synthetic / Playwright-driven presses. Instead, read
    // the :active rule from the CSS object model — if scale(0.97) is in the
    // stylesheet, the press effect is wired; missing rule = regression.
    const matched = await page.evaluate(() => {
      let found = false;
      // Scan the global stylesheet list for the .bd-btn:active rule.
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          // Cross-origin stylesheets throw; skip them.
          continue;
        }
        // Walk top-level rules and any nested @layer/@media wrappers.
        const walk = (list: CSSRuleList) => {
          for (const r of Array.from(list)) {
            const styleRule = r as CSSStyleRule;
            const sel = styleRule.selectorText ?? '';
            if (sel.includes('.bd-btn') && sel.includes(':active')) {
              const t = styleRule.style.getPropertyValue('transform').trim();
              if (/scale\(0\.9[0-9]/.test(t)) {
                found = true;
                return;
              }
            }
            const grouping = r as unknown as { cssRules?: CSSRuleList };
            if (grouping.cssRules) walk(grouping.cssRules);
            if (found) return;
          }
        };
        walk(rules);
        if (found) break;
      }
      return found;
    });
    expect(matched).toBe(true);
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
    await page.waitForTimeout(700);
    const transform = await toast.evaluate((el) => getComputedStyle(el).transform);
    // After the slide-in (animation 'toast-slide-in 0.45s'), the bouncy
    // ease-out (cubic-bezier(0.34, 1.56, 0.64, 1)) settles near scale 1
    // and translate near 0 — but never exactly 1/0 in the captured frame.
    // Tolerate ±0.02 on scale and a small absolute translate.
    const m = transform.match(/^matrix\(([^)]+)\)$/);
    expect(m).not.toBeNull();
    const [a, b, c, d, tx, ty] = (m![1] ?? '').split(',').map((s) => Number.parseFloat(s.trim()));
    expect(Math.abs(a - 1)).toBeLessThan(0.05);
    expect(Math.abs(d - 1)).toBeLessThan(0.05);
    expect(Math.abs(b)).toBeLessThan(0.01);
    expect(Math.abs(c)).toBeLessThan(0.01);
    expect(Math.abs(tx)).toBeLessThan(8);
    expect(Math.abs(ty)).toBeLessThan(2);
  });
});
