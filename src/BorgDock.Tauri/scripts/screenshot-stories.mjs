#!/usr/bin/env node
// Capture "What's new?" hero images as REAL screenshots of Storybook stories,
// rendered in headless Chromium at 2× device pixel ratio.
//
// Usage:
//   node scripts/screenshot-stories.mjs <VERSION>
//
// Reads a manifest at `design/whats-new/<VERSION>.heroes.json` — an array of:
//   {
//     "slug":     "agent-overview",                              // output filename
//     "storyId":  "agent-overview-agentoverviewapp--all-states", // Storybook story id
//     "theme":    "dark",                  // optional, "dark" | "light" (default "dark")
//     "viewport": { "width": 1360, "height": 900 }, // optional render viewport
//     "selector": "#storybook-root",       // optional element to clip to (default whole root)
//     "delay":    700                      // optional extra settle ms after load (default 600)
//   }
//
// Writes PNGs to `docs/whats-new/<VERSION>/<slug>.png`. Get every available
// story id from `${STORYBOOK_URL}/index.json` while the dev server is running.
//
// Requires a running Storybook (default http://localhost:6006 — override with
// STORYBOOK_URL). Start it with `bun run storybook --no-open`.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const STORYBOOK_URL = (process.env.STORYBOOK_URL || 'http://localhost:6006').replace(/\/$/, '');

function fail(msg) {
  console.error(`screenshot-stories: ${msg}`);
  process.exit(1);
}

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`usage: node scripts/screenshot-stories.mjs <VERSION>  (got "${version ?? ''}")`);
}

const manifestPath = path.join(repoRoot, 'design', 'whats-new', `${version}.heroes.json`);
if (!fs.existsSync(manifestPath)) {
  fail(`manifest not found: ${manifestPath}`);
}
/** @type {Array<{slug:string,storyId:string,theme?:string,viewport?:{width:number,height:number},selector?:string,delay?:number}>} */
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest) || manifest.length === 0) {
  fail('manifest must be a non-empty JSON array');
}

const outDir = path.join(repoRoot, 'docs', 'whats-new', version);
fs.mkdirSync(outDir, { recursive: true });

// Verify Storybook is up and validate every storyId against the live index so a
// typo fails loudly instead of silently screenshotting an error overlay.
let known = null;
try {
  const res = await fetch(`${STORYBOOK_URL}/index.json`);
  if (res.ok) {
    const idx = await res.json();
    known = new Set(Object.keys(idx.entries ?? idx.stories ?? {}));
  }
} catch {
  fail(`cannot reach Storybook at ${STORYBOOK_URL} — start it with \`bun run storybook --no-open\``);
}
if (known) {
  const missing = manifest.filter((m) => !known.has(m.storyId)).map((m) => m.storyId);
  if (missing.length) {
    fail(`storyId(s) not found in Storybook index:\n  ${missing.join('\n  ')}`);
  }
}

const browser = await chromium.launch();
let count = 0;
const failures = [];

for (const entry of manifest) {
  const { slug, storyId } = entry;
  const theme = entry.theme ?? 'dark';
  const viewport = entry.viewport ?? { width: 1360, height: 900 };
  const selector = entry.selector ?? '#storybook-root';
  const delay = entry.delay ?? 600;

  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport,
    // Force dark so windows that bootstrap their own theme from
    // prefers-color-scheme (e.g. SqlApp via useTheme('system')) match the rest.
    colorScheme: theme === 'light' ? 'light' : 'dark',
  });
  // Pre-seed the theme key read by each window's inline <head> bootstrap.
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('borgdock-theme', t);
    } catch {
      /* ignore */
    }
  }, theme);
  const page = await context.newPage();
  try {
    const url = `${STORYBOOK_URL}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story&globals=theme:${theme}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    // Wait for the story root, not the clip target — the clip target (e.g. a
    // toast card injected below) may not exist until after seedIdle/emit.
    await page.waitForSelector('#storybook-root', { state: 'attached', timeout: 15_000 });
    // The .sb-errordisplay node is ALWAYS in the iframe DOM but hidden unless a
    // story actually throws — gate on visibility, not presence.
    const errBox = page.locator('.sb-errordisplay').first();
    if ((await errBox.count()) > 0 && (await errBox.isVisible())) {
      const msg = (await errBox.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      throw new Error(`story error overlay: ${msg}`);
    }
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(delay);

    // Some windows (the flyout) only reach their interesting state via a runtime
    // event whose listener attaches a tick after mount — racy to emit from the
    // story itself. Inject it deterministically here instead.
    if (entry.seedIdle) {
      await page.evaluate(() => window.__borgdock_test_flyout_seed?.({ mode: 'idle' }));
      await page.waitForTimeout(120);
    }
    if (entry.emit) {
      const emits = Array.isArray(entry.emit) ? entry.emit : [entry.emit];
      for (const e of emits) {
        await page.evaluate(
          (ev) => window.__borgdock_storybook_tauri?.emit(ev.channel, ev.payload),
          e,
        );
      }
      await page.waitForTimeout(entry.emitSettle ?? 600);
    }

    // Now that any injected state has rendered, wait for the actual clip target.
    if (selector !== '#storybook-root') {
      await page.waitForSelector(selector, { state: 'visible', timeout: 10_000 });
    }
    const target = page.locator(selector).first();
    const box = await target.boundingBox();
    const file = path.join(outDir, `${slug}.png`);
    if (box && box.width > 0 && box.height > 0) {
      await target.screenshot({ path: file });
    } else {
      // Element has no layout box (e.g. display:contents root) — fall back to viewport.
      await page.screenshot({ path: file });
    }
    console.log(`wrote ${path.relative(repoRoot, file)}  (${storyId})`);
    count++;
  } catch (err) {
    failures.push(`${slug} (${storyId}): ${err.message}`);
    console.error(`FAILED ${slug} (${storyId}): ${err.message}`);
  } finally {
    await context.close();
  }
}

await browser.close();
console.log(`\n${count}/${manifest.length} hero image(s) written to ${path.relative(repoRoot, outDir)}`);
if (failures.length) {
  fail(`${failures.length} capture(s) failed:\n  ${failures.join('\n  ')}`);
}
