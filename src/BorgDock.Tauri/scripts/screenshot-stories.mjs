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
//     "delay":    700,                     // optional extra settle ms after load (default 600)
//     "args":     { "section": "prs" }     // optional story args passed through the URL
//   }
//
// Writes PNGs to `docs/whats-new/<VERSION>/<slug>.png`. Get every available
// story id from `${STORYBOOK_URL}/index.json` while the dev server is running.
//
// Requires a running Storybook (default http://localhost:6006 — override with
// STORYBOOK_URL). Start it with `bun run storybook --no-open`.
//
// The capture loop is exported as `captureEntries` so the marketing-site
// manifest runner (scripts/screenshot-manifest.mjs) shares it.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
export const repoRoot = path.resolve(packageRoot, '..', '..');
export const STORYBOOK_URL = (process.env.STORYBOOK_URL || 'http://localhost:6006').replace(
  /\/$/,
  '',
);

/**
 * Serialise story args for Storybook's `args=` URL parameter
 * (`key:value;key2:!true`). Only strings, numbers and booleans are supported.
 */
export function storyArgsParam(args) {
  if (!args || typeof args !== 'object') return '';
  const parts = Object.entries(args).map(([k, v]) => {
    if (typeof v === 'boolean') return `${k}:!${v}`;
    return `${k}:${String(v)}`;
  });
  return parts.length ? `&args=${encodeURIComponent(parts.join(';'))}` : '';
}

/** The iframe URL that renders one story on its own, in the given theme. */
export function storyUrl(storyId, theme, args) {
  return `${STORYBOOK_URL}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story&globals=theme:${theme}${storyArgsParam(args)}`;
}

/**
 * Returns the set of story ids Storybook knows about, or throws when the dev
 * server cannot be reached.
 */
export async function loadStoryIndex() {
  let res;
  try {
    res = await fetch(`${STORYBOOK_URL}/index.json`);
  } catch {
    throw new Error(
      `cannot reach Storybook at ${STORYBOOK_URL} — start it with \`bun run storybook --no-open\``,
    );
  }
  if (!res.ok) throw new Error(`Storybook index returned HTTP ${res.status}`);
  const idx = await res.json();
  return new Set(Object.keys(idx.entries ?? idx.stories ?? {}));
}

/**
 * Open a story in a fresh browser context and wait until it has rendered:
 * story root attached, no error overlay, fonts ready, `delay` ms of settle.
 * Returns `{ context, page }`; the caller closes the context.
 */
export async function openStory(browser, entry, { theme, contextOptions = {} } = {}) {
  const viewport = entry.viewport ?? { width: 1360, height: 900 };
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport,
    // Match prefers-color-scheme so windows that bootstrap their own theme
    // from it (e.g. SqlApp via useTheme('system')) agree with the story theme.
    colorScheme: theme === 'light' ? 'light' : 'dark',
    ...contextOptions,
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
  return { context, page };
}

export async function waitForStory(page, entry, theme) {
  await page.goto(storyUrl(entry.storyId, theme, entry.args), { waitUntil: 'networkidle' });
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
  await page.waitForTimeout(entry.delay ?? 600);
}

/**
 * Capture every entry to the file `outFile(entry)` returns.
 *
 * Each entry is `{ slug, storyId, theme, viewport?, selector?, delay?, args?,
 * seedIdle?, emit?, emitSettle? }` with a concrete theme ("dark" | "light").
 * With `verifyTheme`, a story that renders in the other theme (a story-level
 * `globals` lock wins over the URL) is reported as a failure instead of being
 * written under the wrong name.
 *
 * Returns `{ written: string[], failures: string[] }`; never throws for a
 * single failed story.
 */
export async function captureEntries(entries, { outFile, verifyTheme = false } = {}) {
  const browser = await chromium.launch();
  const written = [];
  const failures = [];

  for (const entry of entries) {
    const { slug, storyId } = entry;
    const theme = entry.theme ?? 'dark';
    const selector = entry.selector ?? '#storybook-root';
    const label = `${slug}${entry.theme ? ` [${theme}]` : ''} (${storyId})`;

    const { context, page } = await openStory(browser, entry, { theme });
    try {
      await waitForStory(page, entry, theme);

      if (verifyTheme) {
        const isDark = await page.evaluate(() =>
          document.documentElement.classList.contains('dark'),
        );
        if (isDark !== (theme === 'dark')) {
          throw new Error(
            `story rendered ${isDark ? 'dark' : 'light'} instead of ${theme} (a story-level theme global overrides the URL; use a per-theme storyId)`,
          );
        }
      }

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
      const file = outFile(entry);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (box && box.width > 0 && box.height > 0) {
        await target.screenshot({ path: file });
      } else {
        // Element has no layout box (e.g. display:contents root) — fall back to viewport.
        await page.screenshot({ path: file });
      }
      console.log(`wrote ${path.relative(repoRoot, file)}  (${storyId})`);
      written.push(file);
    } catch (err) {
      failures.push(`${label}: ${err.message}`);
      console.error(`FAILED ${label}: ${err.message}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  return { written, failures };
}

// ---------------------------------------------------------------------------
// CLI: the What's new heroes for one release.

function fail(msg) {
  console.error(`screenshot-stories: ${msg}`);
  process.exit(1);
}

async function main() {
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

  // Validate every storyId against the live index so a typo fails loudly
  // instead of silently screenshotting an error overlay.
  let known;
  try {
    known = await loadStoryIndex();
  } catch (err) {
    fail(err.message);
  }
  const missing = manifest.filter((m) => !known.has(m.storyId)).map((m) => m.storyId);
  if (missing.length) {
    fail(`storyId(s) not found in Storybook index:\n  ${missing.join('\n  ')}`);
  }

  const { written, failures } = await captureEntries(manifest, {
    outFile: (entry) => path.join(outDir, `${entry.slug}.png`),
  });
  console.log(
    `\n${written.length}/${manifest.length} hero image(s) written to ${path.relative(repoRoot, outDir)}`,
  );
  if (failures.length) {
    fail(`${failures.length} capture(s) failed:\n  ${failures.join('\n  ')}`);
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await main();
}
