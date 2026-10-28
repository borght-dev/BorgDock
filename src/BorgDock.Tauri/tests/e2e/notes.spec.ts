import { expect, type Page, test } from '@playwright/test';
import { bootApp } from './helpers/test-utils';

/**
 * Notes: the vault is the in-page folder `window.__notes` (mock-tauri.ts),
 * written with the same rule as the Rust storage. Each spec seeds it before
 * boot, works in the Notes section and reads the files back.
 */

const VAULT: Record<string, string> = {
  'Plan.md': '# Plan\n\nShip the export fix. See [[Spec]].\n\n- [ ] Ask QA\n',
  'Projects/Spec.md': '# Spec\n\nThe writer keeps the last column.\n',
  'Templates/Daily.md': '# {{title}}\n\n## Notes\n',
};

async function seedVault(page: Page, notes: Record<string, string> = VAULT) {
  await page.addInitScript((seed) => {
    const w = window as unknown as { __notes?: Record<string, { text: string; modifiedMs: number }> };
    w.__notes = Object.fromEntries(
      Object.entries(seed).map(([path, text], i) => [path, { text, modifiedMs: i + 1 }]),
    );
  }, notes);
}

async function vaultText(page: Page, path: string): Promise<string | null> {
  return page.evaluate(
    (p) =>
      (window as unknown as { __notes?: Record<string, { text: string }> }).__notes?.[p]?.text ??
      null,
    path,
  );
}

async function openNotes(page: Page) {
  await page.getByRole('button', { name: /^Notes/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Notes', level: 1 })).toBeVisible();
}

test('opens a note from the tree and saves what you type to its file', async ({ page }) => {
  await seedVault(page);
  await bootApp(page);
  await openNotes(page);

  await page.getByRole('navigation', { name: 'Notes' }).getByRole('button', { name: 'Plan' }).click();
  const editor = page.getByRole('textbox', { name: /Plan, note text/ });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nSaved from BorgDock.');
  await expect.poll(() => vaultText(page, 'Plan.md')).toContain('Saved from BorgDock.');
});

test('a [[link]] opens the note it names, and lists the linking note', async ({ page }) => {
  await seedVault(page);
  await bootApp(page);
  await openNotes(page);
  await page.getByRole('navigation', { name: 'Notes' }).getByRole('button', { name: 'Spec' }).click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Spec');
  // Spec's linked mentions name Plan, which links to it.
  const mentions = page.getByRole('complementary', { name: 'About this note' });
  await mentions.locator('.bd-notes-mention', { hasText: 'Plan' }).click();
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Plan');
});

test('Ctrl+O opens a note by title, and creates one nobody has', async ({ page }) => {
  await seedVault(page);
  await bootApp(page);
  await openNotes(page);
  await page.keyboard.press('Control+o');
  const dialog = page.getByRole('dialog', { name: 'Open a note' });
  await dialog.getByRole('textbox').fill('spe');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Spec');

  await page.keyboard.press('Control+o');
  await page.getByRole('dialog', { name: 'Open a note' }).getByRole('textbox').fill('Retro notes');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Retro notes');
  await expect.poll(() => vaultText(page, 'Retro notes.md')).toBe('');
});

test('tasks across notes are ticked in their files', async ({ page }) => {
  await seedVault(page);
  await bootApp(page);
  await openNotes(page);
  await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: /Tasks/ }).click();
  await page.getByRole('checkbox', { name: 'Ask QA' }).click();
  await expect.poll(() => vaultText(page, 'Plan.md')).toContain('- [x] Ask QA');
});

test("Today makes today's note from the Daily template", async ({ page }) => {
  await seedVault(page);
  await bootApp(page);
  await openNotes(page);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const daily = await page.evaluate(() =>
    Object.keys(
      (window as unknown as { __notes: Record<string, unknown> }).__notes,
    ).find((p) => p.startsWith('Daily/')),
  );
  expect(daily).toMatch(/^Daily\/\d{4}-\d{2}-\d{2}\.md$/);
  await expect.poll(() => vaultText(page, daily!)).toContain('## Notes');
});

test('the quick note window appends to today’s note', async ({ page }) => {
  await seedVault(page);
  await bootApp(page, 'note-capture.html');
  const input = page.getByRole('textbox', { name: 'Quick note' });
  await expect(input).toBeEnabled();
  await input.fill('Call the customer back');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Saved.');
  const daily = await page.evaluate(() =>
    Object.entries((window as unknown as { __notes: Record<string, { text: string }> }).__notes).find(
      ([p]) => p.startsWith('Daily/'),
    ),
  );
  expect(daily?.[1].text).toMatch(/## Captured\n- \d{2}:\d{2} Call the customer back/);
});
