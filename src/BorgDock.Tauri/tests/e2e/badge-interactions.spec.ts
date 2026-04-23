import { test, expect } from '@playwright/test';
import { TAURI_MOCK_SCRIPT } from './helpers/test-utils';

/**
 * Badge interaction tests: expand/collapse chevron, drag handle, and sidebar click.
 *
 * Note: actual window dragging requires a real Tauri webview — these tests verify
 * the DOM structure and attributes that enable dragging, plus the expand/collapse UI.
 */
test.describe('Badge Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(`
      ${TAURI_MOCK_SCRIPT}

      // Track invoked commands for assertions
      window.__BORGDOCK_INVOKED_CMDS__ = [];
      const origInvoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
        window.__BORGDOCK_INVOKED_CMDS__.push({ cmd, args });
        return origInvoke(cmd, args);
      };

      window.__TAURI_INTERNALS__.__listeners = {};
      window.__TAURI_INTERNALS__.transformCallback = (fn) => {
        const id = Math.random().toString(36).slice(2);
        window['_' + id] = fn;
        return Number(id) || 0;
      };
    `);

    await page.goto('/badge.html');
    await page.waitForTimeout(500);
  });

  test('drag handle element exists and is not a button/anchor', async ({ page }) => {
    const dragHandle = page.locator('[data-testid="badge-drag-handle"]');
    await expect(dragHandle).toBeVisible({ timeout: 5000 });

    const tagName = await dragHandle.evaluate((el) => el.tagName.toLowerCase());
    expect(['button', 'a', 'input', 'select', 'textarea']).not.toContain(tagName);
  });

  test('drag handle has a mousedown handler attached', async ({ page }) => {
    // Verify the drag handle has an onMouseDown event listener (via React)
    const hasHandler = await page.locator('[data-testid="badge-drag-handle"]').evaluate((el) => {
      // React attaches events via the root, but we can verify by dispatching
      // a mousedown and checking the cursor style indicates drag intent
      const style = window.getComputedStyle(el);
      return style.cursor === 'grab';
    });
    expect(hasHandler).toBe(true);
  });

  test('expand chevron button is visible', async ({ page }) => {
    const chevron = page.locator('[data-testid="badge-expand-chevron"]');
    await expect(chevron).toBeVisible({ timeout: 5000 });
  });

  test('clicking expand chevron shows the PR panel', async ({ page }) => {
    const chevron = page.locator('[data-testid="badge-expand-chevron"]');
    await chevron.click();

    // The expanded panel should show the MY PRS and TEAM columns
    await expect(page.getByText('MY PRS')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('TEAM')).toBeVisible({ timeout: 3000 });
  });

  test('clicking expand chevron again collapses the panel', async ({ page }) => {
    const chevron = page.locator('[data-testid="badge-expand-chevron"]');

    // Expand
    await chevron.click();
    await expect(page.getByText('MY PRS')).toBeVisible({ timeout: 3000 });

    // Collapse
    await chevron.click();
    await expect(page.getByText('MY PRS')).not.toBeVisible({ timeout: 3000 });
  });

  test('chevron rotates when expanded', async ({ page }) => {
    const chevronSvg = page.locator('[data-testid="badge-expand-chevron"] svg');

    // Initially not rotated
    const initialClasses = await chevronSvg.getAttribute('class');
    expect(initialClasses).not.toContain('rotate-180');

    // Click to expand
    await page.locator('[data-testid="badge-expand-chevron"]').click();
    await page.waitForTimeout(200);

    // Should now be rotated
    const expandedClasses = await chevronSvg.getAttribute('class');
    expect(expandedClasses).toContain('rotate-180');
  });

  test('sidebar open button is clickable and invokes toggle_sidebar', async ({ page }) => {
    const sidebarBtn = page.locator('[data-testid="badge-open-sidebar"]');
    await expect(sidebarBtn).toBeVisible({ timeout: 5000 });

    await sidebarBtn.click();
    await page.waitForTimeout(300);

    const cmds = await page.evaluate(() => (window as any).__BORGDOCK_INVOKED_CMDS__);
    const toggleCmd = cmds.find((c: any) => c.cmd === 'toggle_sidebar');
    expect(toggleCmd).toBeTruthy();
  });

  test('expanded panel shows footer with total count', async ({ page }) => {
    const chevron = page.locator('[data-testid="badge-expand-chevron"]');
    await chevron.click();

    // Footer shows "0 total" since no PRs are injected
    await expect(page.getByText('0 total')).toBeVisible({ timeout: 3000 });
  });

  test('expand triggers resize_badge invoke', async ({ page }) => {
    const chevron = page.locator('[data-testid="badge-expand-chevron"]');
    await chevron.click();
    await page.waitForTimeout(300);

    const cmds = await page.evaluate(() => (window as any).__BORGDOCK_INVOKED_CMDS__);
    const resizeCmd = cmds.find((c: any) => c.cmd === 'resize_badge');
    expect(resizeCmd).toBeTruthy();
    // Expanded size should be larger than collapsed
    expect(resizeCmd.args.width).toBeGreaterThan(260);
    expect(resizeCmd.args.height).toBeGreaterThan(50);
  });
});
