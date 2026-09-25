import { expect, type Page, test } from '@playwright/test';
import { SAMPLE_WORK_ITEMS } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * Work items (plans/ui-overhaul-workbench.md, phase 5): the rows render grouped by state, a row
 * click pushes the full-screen work item view (header with Back, AB#id,
 * type, state line and title, then the tabs), Back returns to the list with
 * the row still selected, and J / K / Enter move and open.
 *
 * The seeded items are AB#9001 "Bug 1" (Bug, Active) and AB#9002 "Task 2"
 * (Task, New); the happy-path `ado_fetch` answers the detail's refetch.
 */

async function bootWorkItems(page: Page) {
  await bootApp(page, '', 'happy-path');
  await seedMainWindow(page, { workItems: SAMPLE_WORK_ITEMS });
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('button', { name: /^Work items/ })
    .click();
  await expect(page.locator('.bd-wi-wb')).toBeVisible();
}

function row(page: Page, id: number) {
  return page.locator(`.bd-wi-wb-row[data-wi-id="${id}"]`);
}

const viewstack = (page: Page) => page.locator('.bd-viewstack');

test('rows render as Workbench rows grouped by state', async ({ page }) => {
  await bootWorkItems(page);
  await expect(page.locator('.bd-wi-wb-row')).toHaveCount(2);
  await expect(page.locator('.bd-wb-group__label')).toHaveText(['Active', 'New']);

  const bug = row(page, 9001);
  await expect(bug.locator('.bd-wi-type')).toHaveText('Bug');
  await expect(bug.locator('.bd-wi-type')).toHaveAttribute('data-type-tone', 'bug');
  await expect(bug.locator('.bd-wi-wb-row__id')).toHaveText('AB#9001');
  await expect(bug.locator('.bd-wi-wb-row__state')).toHaveText('Active, P2');
  await expect(row(page, 9002).locator('.bd-wi-type')).toHaveAttribute('data-type-tone', 'task');
  // Rows only: no queries rail | list | detail panes.
  await expect(page.locator('.bd-workitems__detail')).toHaveCount(0);
  await expect(page.locator('.bd-statusbar')).toContainText(
    '/ search · R refresh · J K move · Enter open',
  );
  await page.screenshot({ path: test.info().outputPath('work-items-list.png') });
});

test('a row click opens the full-screen detail and Back returns with the row selected', async ({
  page,
}) => {
  await bootWorkItems(page);
  await row(page, 9001).click();

  await expect(viewstack(page)).toHaveAttribute('data-view', 'work-item-detail');
  await expect(viewstack(page)).toHaveAttribute('data-depth', '2');
  const detail = page.getByRole('article', { name: 'Work item AB#9001' });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('heading', { level: 1, name: 'Bug 1' })).toBeVisible();
  await expect(detail.locator('.bd-wi-detail__id')).toHaveText('AB#9001');
  await expect(detail.locator('.bd-wi-type')).toHaveText('Bug');
  await expect(detail.getByRole('tablist')).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Open in ADO' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('work-items-detail.png') });

  // Tabs switch with the sliding underline.
  await detail.getByRole('tab', { name: /Links/ }).click();
  await expect(detail.getByRole('tab', { name: /Links/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await detail.getByRole('button', { name: 'Back' }).click();
  await expect(viewstack(page)).toHaveAttribute('data-depth', '1');
  await expect(row(page, 9001)).toHaveAttribute('data-selected', 'true');
  await expect(row(page, 9002)).not.toHaveAttribute('data-selected', 'true');
});

test('Esc goes back from the detail view', async ({ page }) => {
  await bootWorkItems(page);
  await row(page, 9002).click();
  await expect(page.getByRole('article', { name: 'Work item AB#9002' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewstack(page)).toHaveAttribute('data-depth', '1');
  await expect(row(page, 9002)).toHaveAttribute('data-selected', 'true');
});

test('J / K move the selection and Enter opens the selected item', async ({ page }) => {
  await bootWorkItems(page);
  // Keys go to the list, not to the search box.
  await page.locator('.bd-wb-head__title').click();

  await page.keyboard.press('j');
  await expect(row(page, 9001)).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('j');
  await expect(row(page, 9002)).toHaveAttribute('data-selected', 'true');
  await expect(row(page, 9001)).not.toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('k');
  await expect(row(page, 9001)).toHaveAttribute('data-selected', 'true');

  await page.keyboard.press('Enter');
  await expect(viewstack(page)).toHaveAttribute('data-depth', '2');
  await expect(page.getByRole('article', { name: 'Work item AB#9001' })).toBeVisible();

  // J / K now step through the detail view's tabs.
  const tabs = page.getByRole('article', { name: 'Work item AB#9001' }).getByRole('tablist');
  const first = await tabs.getByRole('tab').first().textContent();
  await page.keyboard.press('j');
  await expect(tabs.getByRole('tab', { selected: true })).not.toHaveText(first ?? '');
});

test('work items list renders seeded items', async ({ page }) => {
  await bootWorkItems(page);
  await expect(page.getByText('Bug 1')).toBeVisible();
  await expect(page.getByText('Task 2')).toBeVisible();
});
