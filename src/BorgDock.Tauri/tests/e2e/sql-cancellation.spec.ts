import { expect, test } from '@playwright/test';
import { seedScenario } from './helpers/seed';
import { getInvokeLog } from './helpers/mock-tauri';
import { bootApp } from './helpers/test-utils';

test('the running query can be cancelled with its own operation id', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 685 });
  await page.addInitScript(() => localStorage.setItem('borgdock-sql-last-query', 'SELECT 1;'));
  const settings = seedScenario('happy-path').load_settings as Record<string, unknown>;
  await bootApp(page, 'sql.html', 'happy-path', {
    load_settings: { ...settings, sql: { connections: [{ name: 'Verification', server: 'localhost', port: 1433, database: 'test', authentication: 'windows', trustServerCertificate: true }], readOnlyByDefault: true, confirmDestructiveWithoutWhere: true } },
  });
  await page.evaluate(() => {
    const mock = (window as unknown as { __mockTauri: { addHandler: (name: string, handler: (args: Record<string, unknown>) => unknown) => void } }).__mockTauri;
    let rejectQuery: ((reason: string) => void) | undefined;
    mock.addHandler('execute_sql_query', () => new Promise((_, reject) => { rejectQuery = reject; }));
    mock.addHandler('cancel_sql_query', () => { rejectQuery?.('Query cancelled.'); });
  });
  await page.locator('[data-action="run-query"]').click();
  await expect.poll(async () => (await getInvokeLog(page)).some(call => call.cmd === 'execute_sql_query')).toBe(true);
  const cancel = page.getByRole('button', { name: 'Cancel query' });
  await expect(cancel).toBeVisible();
  await expect(page.getByText('Running query…', { exact: true })).toBeVisible();
  await expect(page.getByText('Query executed — no results returned')).toHaveCount(0);
  const schema = await page.getByRole('button', { name: /Connected|Schema error/ }).boundingBox();
  const newButton = await page.getByRole('button', { name: 'New', exact: true }).boundingBox();
  expect(schema!.x + schema!.width).toBeLessThanOrEqual(newButton!.x);
  const path = testInfo.outputPath('sql-running.png');
  await page.screenshot({ path });
  await testInfo.attach('sql-running', { path, contentType: 'image/png' });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByText('Running query…', { exact: true })).toBeVisible();
  await expect(page.getByText('Ready when you are', { exact: true })).toHaveCount(0);
  await cancel.click();
  await expect(page.getByText('Query cancelled.', { exact: true })).toBeVisible();
  await expect(cancel).toHaveCount(0);
  const calls = await getInvokeLog(page);
  const run = calls.find(call => call.cmd === 'execute_sql_query')!;
  const stop = calls.find(call => call.cmd === 'cancel_sql_query')!;
  expect((stop.args as { queryId: string }).queryId).toBe((run.args as { queryId: string }).queryId);
});
