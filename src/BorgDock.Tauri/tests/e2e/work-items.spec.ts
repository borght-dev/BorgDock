import { expect, test } from '@playwright/test';
import { SAMPLE_WORK_ITEMS } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * Main-window Work Items section. Items are surfaced after navigating
 * to the Work Items tab and seeding through `__borgdock_test_seed`.
 *
 * The list rows are role=button (see WorkItemRow.tsx line 40); the title
 * is rendered as flowing text inside `.bd-wi-row__title`. Detail pane
 * appears in the third column once a row is clicked.
 */

test('work items list renders seeded items', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { workItems: SAMPLE_WORK_ITEMS });
  await page.getByRole('tab', { name: 'Work Items' }).click();
  await expect(page.getByText('Bug 1')).toBeVisible();
  await expect(page.getByText('Task 2')).toBeVisible();
});

test('selecting a work item updates detail pane', async ({ page }) => {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { workItems: SAMPLE_WORK_ITEMS });
  await page.getByRole('tab', { name: 'Work Items' }).click();
  // The list row is role=button containing the title text.
  await page.getByRole('button', { name: /Bug 1/ }).first().click();
  // Detail pane shows the work item id (AB#9001) + title — the title
  // appears in multiple places (row + detail header), so just count >0.
  await expect(page.getByText('AB#9001').first()).toBeVisible();
});
