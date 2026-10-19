import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('packaged image policy permits Azure proof screenshots', async ({ page }) => {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const src = 'https://fspveraartifacts.blob.core.windows.net/vera-proofs/AB60362/shot1.png';
  await page.route(src, (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: readFileSync('../../docs/whats-new/3.0.0/quick-review.png'),
    }),
  );
  await page.setContent(
    `<meta http-equiv="Content-Security-Policy" content="${config.app.security.csp}"><img src="${src}" alt="PR proof screenshot">`,
  );
  await expect
    .poll(() => page.getByAltText('PR proof screenshot').evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 2000 })
    .toBeGreaterThan(0);
});
