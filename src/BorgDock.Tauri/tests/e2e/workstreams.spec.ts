import { expect, type Page, test } from '@playwright/test';
import type { MockHandlers } from './helpers/mock-tauri';
import { SAMPLE_PRS } from './helpers/seed';
import { bootApp, seedMainWindow } from './helpers/test-utils';

/**
 * Workstreams: create one, add a pull request by pasting its address, and
 * find it again after a restart. The workstream folder lives in
 * sessionStorage here, so it survives `page.reload()` the way the files
 * survive an app restart; the write keeps the storage's revision rule.
 */

function folderHandlers(): MockHandlers {
  return {
    workstreams_list: () => {
      const files = JSON.parse(sessionStorage.getItem('e2e-ws') ?? '{}') as Record<string, { contents: string; modifiedMs: number }>;
      return Object.entries(files).map(([fileName, file]) => ({
        id: fileName.slice(0, 36),
        fileName,
        modifiedMs: file.modifiedMs,
        size: file.contents.length,
        conflictCopy: false,
      }));
    },
    workstreams_read: (args: Record<string, unknown>) => {
      const files = JSON.parse(sessionStorage.getItem('e2e-ws') ?? '{}') as Record<string, { contents: string }>;
      const file = files[args.fileName as string];
      if (!file) throw 'missing';
      return file.contents;
    },
    workstreams_write: (args: Record<string, unknown>) => {
      const files = JSON.parse(sessionStorage.getItem('e2e-ws') ?? '{}') as Record<string, { contents: string; modifiedMs: number }>;
      const name = `${args.id as string}.json`;
      const disk = files[name];
      if (disk) {
        const revision = (JSON.parse(disk.contents) as { revision?: number }).revision;
        if (args.expectedRevision === null || revision !== args.expectedRevision) {
          return { status: 'conflict', disk: disk.contents };
        }
      } else if (args.expectedRevision !== null) {
        throw "The workstream's file is gone.";
      }
      files[name] = { contents: args.contents as string, modifiedMs: Date.now() + Math.random() };
      sessionStorage.setItem('e2e-ws', JSON.stringify(files));
      return { status: 'written' };
    },
  };
}

function rail(page: Page, name: RegExp) {
  return page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name });
}

async function boot(page: Page) {
  await bootApp(page, '', 'happy-path', folderHandlers());
  await seedMainWindow(page, { prs: SAMPLE_PRS });
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
}

test('a workstream is created, takes a pasted pull request and survives a restart', async ({ page }) => {
  await boot(page);
  await rail(page, /^Workstreams/).click();
  await expect(page.getByRole('heading', { name: 'Group the work behind one goal' })).toBeVisible();

  await page.getByRole('button', { name: 'New workstream' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'New workstream' });
  await sheet.getByRole('textbox', { name: 'Title' }).fill('Checkout in one step');
  await sheet.getByRole('textbox', { name: 'Goal' }).fill('Customers pay without leaving the cart.');
  await sheet.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('heading', { name: 'Checkout in one step' })).toBeVisible();
  await page.getByRole('button', { name: 'Add records' }).first().click();
  const picker = page.getByRole('dialog', { name: 'Add records' });
  const input = picker.getByRole('textbox', { name: 'Paste an address or search' });
  await input.fill('https://github.com/test-org/borgdock/pull/42');
  await input.press('Enter');
  await picker.getByRole('button', { name: 'Add 1 record' }).click();

  await page.getByRole('tab', { name: /Members/ }).click();
  await expect(page.getByRole('button', { name: 'test-org/borgdock#42', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
  await rail(page, /^Workstreams/).click();
  const card = page.getByRole('article', { name: 'Checkout in one step' });
  await expect(card).toBeVisible();
  await expect(card.getByText('1 PR')).toBeVisible();
});

test('N starts a new workstream from the list and Esc closes the sheet', async ({ page }) => {
  await boot(page);
  await rail(page, /^Workstreams/).click();
  await page.locator('body').click();
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog', { name: 'New workstream' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'New workstream' })).toHaveCount(0);
  await expect(rail(page, /^Workstreams/)).toHaveAttribute('aria-current', 'page');
});
