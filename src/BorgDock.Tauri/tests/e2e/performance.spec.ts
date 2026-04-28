import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixturesIfAvailable } from './helpers/seed';
import { PERF_BUDGETS } from './perf-budgets';

function budgetForProject(projectName: string) {
  const b = PERF_BUDGETS[projectName];
  if (!b) throw new Error(`No perf budget defined for project "${projectName}"`);
  return b;
}

test.describe('performance', () => {
  test('initial main-window paint under budget', async ({ page }, testInfo) => {
    const budget = budgetForProject(testInfo.project.name);
    await injectCompletedSetup(page);
    const start = Date.now();
    await page.goto('/');
    await page.locator('header').waitFor({ state: 'visible' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(budget.initialPaintMs);
  });

  test('ControlOrMeta+K opens command palette under budget', async ({ page }, testInfo) => {
    const budget = budgetForProject(testInfo.project.name);
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixturesIfAvailable(page);

    const start = await page.evaluate(() => performance.now());
    await page.keyboard.press('ControlOrMeta+K');
    await page.locator('[data-command-palette]').waitFor({ state: 'visible' });
    const end = await page.evaluate(() => performance.now());
    expect(end - start).toBeLessThan(budget.commandPaletteOpenMs);
  });

  test('PR card click to detail render under budget', async ({ page, context }, testInfo) => {
    const budget = budgetForProject(testInfo.project.name);
    await injectCompletedSetup(page);
    await page.goto('/');
    await waitForAppReady(page);
    await seedDesignFixturesIfAvailable(page);

    const start = Date.now();
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('[data-pr-card]').first().click(),
    ]);
    await popup.locator('[data-window="pr-detail"]').waitFor({ state: 'visible' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(budget.prClickToDetailMs);
  });

  test('file palette keystroke to first result under budget', async ({ page }, testInfo) => {
    const budget = budgetForProject(testInfo.project.name);
    await injectCompletedSetup(page);
    await page.goto('/file-palette.html');
    await waitForAppReady(page);
    await seedDesignFixturesIfAvailable(page);

    const input = page.getByPlaceholder(/search files/i);
    const start = Date.now();
    await input.fill('f');
    await page.locator('[data-file-result]').first().waitFor({ state: 'visible' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(budget.filePaletteKeystrokeMs);
  });

  test('PR detail tab switch under budget', async ({ page }, testInfo) => {
    const budget = budgetForProject(testInfo.project.name);
    await injectCompletedSetup(page);
    await page.goto('/pr-detail.html?number=714&tab=overview');
    await waitForAppReady(page);
    await seedDesignFixturesIfAvailable(page);

    const start = Date.now();
    await page.getByRole('tab', { name: /files/i }).click();
    await page.locator('[data-diff-file]').first().waitFor({ state: 'visible' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(budget.prDetailTabSwitchMs);
  });
});
