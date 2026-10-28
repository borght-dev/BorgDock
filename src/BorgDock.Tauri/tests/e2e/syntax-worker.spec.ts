import { expect, test } from '@playwright/test';

test('real Tree-sitter highlighting runs in a worker while the renderer stays responsive', async ({ page }) => {
  await page.route('**/syntax-worker-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Syntax worker verification</title>' }));
  await page.goto('/syntax-worker-test');
  const workerReady = page.waitForEvent('worker', { predicate: worker => worker.url().includes('syntax-worker') });
  const result = page.evaluate(async () => {
    // Vite serves the same module the diff view uses.
    const { highlightLines } = await import(/* @vite-ignore */ '/src/services/syntax-highlighter.ts');
    const lines = Array.from({ length: 5_000 }, (_, index) => `export const value${index} = ${index};`);
    let ticks = 0;
    const heartbeat = setInterval(() => { ticks++; }, 5);
    const start = performance.now();
    try {
      const highlights = await highlightLines('large.ts', lines);
      return { rows: highlights?.size ?? 0, first: highlights?.get(0), ticks, ms: performance.now() - start };
    } finally { clearInterval(heartbeat); }
  });
  const worker = await workerReady;
  expect(worker.url()).toContain('syntax-worker');
  const observed = await result;
  expect(observed.rows).toBe(5_000);
  expect(observed.first?.some(span => span.category === 'keyword')).toBe(true);
  expect(observed.ticks).toBeGreaterThan(0);
  console.log(`[perf] worker highlighted 5,000 lines in ${observed.ms.toFixed(1)} ms; renderer heartbeat ${observed.ticks}`);
});
