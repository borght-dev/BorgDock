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
  await expect(page.getByRole('status')).toContainText('Saved.');
  const daily = await page.evaluate(() =>
    Object.entries((window as unknown as { __notes: Record<string, { text: string }> }).__notes).find(
      ([p]) => p.startsWith('Daily/'),
    ),
  );
  expect(daily?.[1].text).toContain('Call the customer back');
});

test('quick capture formats code live and updates one saved capture', async ({ page }) => {
  await seedVault(page);
  await bootApp(page, 'note-capture.html');
  const input = page.getByRole('textbox', { name: 'Quick note' });
  await expect(input).toBeEditable();
  await input.fill('Initial draft');
  await expect(page.getByRole('status')).toHaveText('Saved.');
  await input.fill('```\nHello\n```\n\n```sql\nSELECT * FROM Tests\n```\n');
  await expect(page.locator('.bd-note-codeblock', { hasText: 'Hello' })).toBeVisible();
  await expect(page.locator('.bd-note-keyword', { hasText: 'SELECT' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  const dailyPath = 'Daily/2026-05-08.md';
  const text = await vaultText(page, dailyPath);
  expect(text).toContain('SELECT * FROM Tests');
  expect(text).not.toContain('Initial draft');
  expect(text?.match(/<!-- borgdock:capture /g)).toHaveLength(1);
  await input.press('Control+End');
  await input.press('Enter');
  await page.keyboard.type('Next line');
  await expect.poll(() => vaultText(page, dailyPath)).toContain('Next line');
  await page.setViewportSize({ width: 760, height: 420 });
  await page.screenshot({ path: 'test-results/quick-note-live-formatting.png' });
  await page.setViewportSize({ width: 420, height: 200 });
  await expect(page.getByRole('button', { name: 'New note', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/quick-note-compact.png' });
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await expect(input).toHaveText('');
  await input.fill('Second capture');
  await expect.poll(() => vaultText(page, dailyPath)).toContain('Second capture');
  const final = await vaultText(page, dailyPath);
  expect(final).toContain('Next line');
  expect(final?.match(/<!-- borgdock:capture /g)).toHaveLength(2);
});


test('quick capture previews Markdown as typed and highlights multiple languages', async ({ page }) => {
  test.setTimeout(90_000);
  await seedVault(page);
  await bootApp(page, 'note-capture.html');
  await page.setViewportSize({ width: 760, height: 650 });
  const input = page.getByRole('textbox', { name: 'Quick note' });
  await expect(input).toBeEditable();
  await input.click();
  await page.keyboard.type('# Hello');
  const heading = input.locator('.bd-note-h1', { hasText: 'Hello' });
  await expect(heading).toBeVisible();
  expect(await heading.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThan(20);
  await input.press('Enter');
  await page.keyboard.type('**Bold** and *italic*');
  await input.press('Enter');
  await input.press('Enter');
  await expect(input.locator('.bd-note-strong')).toHaveText('Bold');
  await expect(input.locator('.bd-note-em')).toHaveText('italic');
  await expect(input.locator('.bd-note-heading-1')).toHaveText('Hello');
  await page.keyboard.insertText('```typescript\nconst greeting: string = "Hello";\n```\n\n```python\ndef hello():\n    return "Hello"\n```\n\n```sql\nSELECT * FROM Tests\n```\n\n```\nPlain text\n```\n\n');
  await expect(input.locator('.bd-note-keyword', { hasText: 'const' })).toBeVisible();
  await expect(input.locator('.bd-note-type', { hasText: 'string' })).toBeVisible();
  await expect(input.locator('.bd-note-keyword', { hasText: 'return' })).toBeVisible();
  await expect(input.locator('.bd-note-keyword', { hasText: 'SELECT' })).toBeVisible();
  await expect(input.locator('.bd-note-codeblock', { hasText: 'Plain text' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Saved.');
  await page.screenshot({ path: 'test-results/quick-note-markdown-languages.png' });
});

test('quick capture renders tables and images and returns to Markdown for editing', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('https://example.com/note-image.svg', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160"><rect width="480" height="160" rx="12" fill="#e8e5ff"/><text x="24" y="86" font-size="24" fill="#352878">Embedded image preview</text></svg>',
  }));
  await seedVault(page);
  await bootApp(page, 'note-capture.html');
  await page.setViewportSize({ width: 760, height: 650 });
  const input = page.getByRole('textbox', { name: 'Quick note' });
  await expect(input).toBeEditable();
  const source = '# Release notes\n\n| Feature | Status | Count |\n| :--- | :---: | ---: |\n| **Tables** | Ready | 2 |\n| Images | *Ready* | 1 |\n\n![Example diagram](https://example.com/note-image.svg)\n\nText below the previews.\n';
  await input.fill(source);
  await input.press('Control+End');
  const table = input.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Feature' })).toBeVisible();
  await expect(table.locator('strong')).toHaveText('Tables');
  await expect(table.getByRole('columnheader', { name: 'Count' })).toHaveCSS('text-align', 'right');
  const image = input.getByRole('img', { name: 'Example diagram' });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(480);
  await expect(page.getByRole('status')).toHaveText('Saved.');
  await page.screenshot({ path: 'test-results/quick-note-tables-images.png' });
  await table.getByRole('cell', { name: 'Tables' }).click();
  await expect(table).toHaveCount(0);
  await expect(input).toContainText('| Feature | Status | Count |');
  await input.press('Control+End');
  await expect(table).toBeVisible();
  await image.click();
  await expect(image).toHaveCount(0);
  await expect(input).toContainText('![Example diagram]');
  await input.press('Control+End');
  await expect(image).toBeVisible();
  await expect.poll(() => vaultText(page, 'Daily/2026-05-08.md')).toContain(source.trim());
});

test('embedded images use reference definitions and show alt text on failure', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('https://example.com/missing.png', (route) => route.fulfill({ status: 404, body: '' }));
  await seedVault(page);
  await bootApp(page, 'note-capture.html');
  const input = page.getByRole('textbox', { name: 'Quick note' });
  await expect(input).toBeEditable();
  await input.fill('![Missing diagram][diagram]\n\n[diagram]: https://example.com/missing.png\n\nEnd\n');
  await input.press('Control+End');
  await expect(input.locator('.bd-note-image-error')).toHaveText('Missing diagram');
});
