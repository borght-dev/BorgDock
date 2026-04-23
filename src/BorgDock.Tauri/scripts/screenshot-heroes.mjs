#!/usr/bin/env node
// Generate hero images for the "What's new?" window by rendering a mockup
// HTML file in headless Chromium and capturing each `[data-hero]` element as
// a PNG.
//
// Usage:
//   node scripts/screenshot-heroes.mjs <VERSION>
//
// Expects a mockup at `design/mockups/whats-new-<VERSION>.html` with each
// hero composition wrapped in `<div data-hero="<slug>">…</div>`. Writes
// PNGs to `docs/whats-new/<VERSION>/<slug>.png` at 2× device pixel ratio.
//
// The mockup should render each hero at its NATIVE CSS display size
// (450×74 for the current HeroBanner layout). At deviceScaleFactor 2 the
// captured PNG ends up at 900×148 physical pixels — crisp on retina and
// compressible to ~15–30 KB each.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/screenshot-heroes.mjs → scripts/ → src/BorgDock.Tauri/ → repoRoot
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');

function fail(msg) {
  console.error(`screenshot-heroes: ${msg}`);
  process.exit(1);
}

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`usage: node scripts/screenshot-heroes.mjs <VERSION>  (got "${version ?? ''}")`);
}

const mockupPath = path.join(repoRoot, 'design', 'mockups', `whats-new-${version}.html`);
const outDir = path.join(repoRoot, 'docs', 'whats-new', version);

if (!fs.existsSync(mockupPath)) {
  fail(
    `mockup not found: ${mockupPath}\n` +
      `create it with <div data-hero="<slug>" class="hero"> wrappers.`,
  );
}

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  deviceScaleFactor: 2,
  viewport: { width: 1200, height: 2000 },
});
const page = await context.newPage();
await page.goto(`file://${mockupPath.replace(/\\/g, '/')}`);

// Wait for any @import'd fonts / CSS to settle before screenshotting.
await page.waitForLoadState('networkidle');

const heroes = await page.locator('[data-hero]').all();
if (heroes.length === 0) {
  fail('no `[data-hero="…"]` elements found in the mockup');
}

let count = 0;
for (const hero of heroes) {
  const slug = await hero.getAttribute('data-hero');
  if (!slug) continue;
  const file = path.join(outDir, `${slug}.png`);
  await hero.screenshot({ path: file, omitBackground: false });
  console.log(`wrote ${path.relative(repoRoot, file)}`);
  count++;
}

await browser.close();
console.log(`\n${count} hero image(s) written to ${path.relative(repoRoot, outDir)}`);
