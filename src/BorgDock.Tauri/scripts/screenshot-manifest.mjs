#!/usr/bin/env node
// Capture a screenshot manifest (the marketing site's `design/site/screens.json`
// by default) from Storybook stories, in one or both themes, at 2×.
//
// Usage:
//   node scripts/screenshot-manifest.mjs [MANIFEST] [OUT_DIR] [--only slug,slug]
//
// Defaults: MANIFEST = design/site/screens.json, OUT_DIR = site/public/screens
// (both relative to the repo root). Each manifest entry:
//   {
//     "slug":     "workbench-list",
//     "storyId":  "main-window-mainwindow--rail-prs",   // or { "light": "...", "dark": "..." }
//     "viewport": { "width": 1280, "height": 800 },
//     "theme":    "both",            // "both" | "light" | "dark"
//     "delay":    2500,              // optional settle ms (default 600)
//     "selector": "#storybook-root", // optional clip target
//     "args":     { "section": "prs" }, // optional story args via the URL
//     "alt":      "…", "page": "Pull requests"   // used by the site, ignored here
//   }
// Writes `<OUT_DIR>/<slug>-<theme>@2x.png`; "both" captures twice.
//
// Requires a running Storybook (STORYBOOK_URL, default http://localhost:6006).
// Exits 1 when any capture fails, after writing every capture that worked.

import fs from 'node:fs';
import path from 'node:path';
import { captureEntries, loadStoryIndex, repoRoot } from './screenshot-stories.mjs';

function fail(msg) {
  console.error(`screenshot-manifest: ${msg}`);
  process.exit(1);
}

const positional = [];
let only = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--only') only = new Set((process.argv[++i] ?? '').split(',').filter(Boolean));
  else positional.push(a);
}

const manifestPath = path.resolve(repoRoot, positional[0] ?? 'design/site/screens.json');
const outDir = path.resolve(repoRoot, positional[1] ?? 'site/public/screens');

if (!fs.existsSync(manifestPath)) fail(`manifest not found: ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest) || manifest.length === 0) {
  fail('manifest must be a non-empty JSON array');
}

// Expand "both" into one entry per theme and resolve per-theme story ids.
const entries = [];
for (const m of manifest) {
  if (only && !only.has(m.slug)) continue;
  const themes = m.theme === 'light' ? ['light'] : m.theme === 'dark' ? ['dark'] : ['light', 'dark'];
  for (const theme of themes) {
    const storyId = typeof m.storyId === 'string' ? m.storyId : m.storyId?.[theme];
    if (!storyId) fail(`${m.slug}: no storyId for the ${theme} theme`);
    entries.push({ ...m, storyId, theme });
  }
}
if (entries.length === 0) fail('nothing to capture (check --only)');

let known;
try {
  known = await loadStoryIndex();
} catch (err) {
  fail(err.message);
}
const missing = [...new Set(entries.filter((e) => !known.has(e.storyId)).map((e) => e.storyId))];
const runnable = entries.filter((e) => known.has(e.storyId));
if (missing.length) {
  console.error(`storyId(s) not found in Storybook index (skipped):\n  ${missing.join('\n  ')}`);
}

fs.mkdirSync(outDir, { recursive: true });
const { written, failures } = await captureEntries(runnable, {
  outFile: (e) => path.join(outDir, `${e.slug}-${e.theme}@2x.png`),
  verifyTheme: true,
});

console.log(
  `\n${written.length}/${entries.length} capture(s) written to ${path.relative(repoRoot, outDir)}`,
);
const problems = [...missing.map((id) => `${id}: not in the Storybook index`), ...failures];
if (problems.length) {
  fail(`${problems.length} capture(s) failed:\n  ${problems.join('\n  ')}`);
}
