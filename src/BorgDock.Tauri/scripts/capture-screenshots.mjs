#!/usr/bin/env node
// scripts/capture-screenshots.mjs
//
// Story-driven screenshot pipeline. Replaces scripts/screenshot-heroes.mjs.
//
// Flow:
//   1. Build storybook-static/ if missing or stale.
//   2. Read storybook-static/index.json — enumerate stories.
//   3. Filter to stories with parameters.screenshot.
//   4. Spin up a static server pointing at storybook-static/.
//   5. Launch Chromium, navigate to each iframe URL, capture PNG.
//   6. Write each PNG to the story's declared output path (repo-relative).

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from 'serve-handler';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const storybookStatic = path.join(packageRoot, 'storybook-static');

function fail(msg) {
  console.error(`capture-screenshots: ${msg}`);
  process.exit(1);
}

async function ensureStorybookBuilt() {
  if (!fs.existsSync(path.join(storybookStatic, 'index.json'))) {
    console.log('capture-screenshots: storybook-static/ missing — building…');
    await runBuildStorybook();
    return;
  }
  // Optional staleness check could compare mtimes against src/**/*.stories.tsx
  // — skipped in MVP. Pass --rebuild to force.
  if (process.argv.includes('--rebuild')) {
    console.log('capture-screenshots: --rebuild — rebuilding…');
    await runBuildStorybook();
  }
}

function runBuildStorybook() {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', ['run', 'build-storybook'], {
      cwd: packageRoot,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build-storybook exited ${code}`));
    });
  });
}

function enumerateStories() {
  const indexPath = path.join(storybookStatic, 'index.json');
  const idx = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const entries = Object.values(idx.entries ?? idx.stories ?? {});
  const tagged = [];
  for (const e of entries) {
    const params = e.parameters ?? {};
    if (params.screenshot) tagged.push({ id: e.id, name: e.name, screenshot: params.screenshot });
  }
  return tagged;
}

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      handler(req, res, { public: storybookStatic, cleanUrls: false });
    });
    server.listen(0, () => {
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function captureStory(page, baseUrl, story) {
  const sp = story.screenshot;
  const dsf = sp.deviceScaleFactor ?? 2;
  await page.setViewportSize({ width: sp.width, height: sp.height });
  // Re-create context for deviceScaleFactor change is overkill; use CSS zoom or
  // accept dsf=2 globally per BrowserContext. We set dsf on the context itself.
  await page.goto(`${baseUrl}/iframe.html?id=${story.id}&viewMode=story`);
  await page.addStyleTag({
    content: `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }`,
  });
  await page.evaluate(() => document.fonts.ready);
  if (sp.waitFor) await page.waitForSelector(sp.waitFor, { timeout: 5000 });
  await page.waitForTimeout(100); // small settle pause

  const outPath = path.resolve(repoRoot, sp.output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (sp.selector) {
    const el = await page.$(sp.selector);
    if (!el) throw new Error(`selector "${sp.selector}" not found in story ${story.id}`);
    await el.screenshot({ path: outPath, omitBackground: false });
  } else {
    await page.screenshot({ path: outPath, omitBackground: false, fullPage: false });
  }
  console.log(`wrote ${path.relative(repoRoot, outPath)}`);
}

async function main() {
  await ensureStorybookBuilt();

  const stories = enumerateStories();
  if (stories.length === 0) fail('no stories with parameters.screenshot found');

  // Detect duplicate output paths
  const seen = new Map();
  for (const s of stories) {
    const out = s.screenshot.output;
    if (seen.has(out)) {
      fail(`duplicate output path "${out}" — used by ${seen.get(out)} and ${s.id}`);
    }
    seen.set(out, s.id);
  }

  const { server, url } = await startStaticServer();
  console.log(`capture-screenshots: serving storybook-static/ at ${url}`);

  // Use a single context with deviceScaleFactor=2 for all captures. Stories
  // can override via parameters.screenshot.deviceScaleFactor (rare).
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();

  let count = 0;
  let errors = 0;
  for (const story of stories) {
    try {
      await captureStory(page, url, story);
      count++;
    } catch (err) {
      console.error(`capture-screenshots: failed for ${story.id}: ${err?.message ?? err}`);
      errors++;
    }
  }

  await browser.close();
  server.close();

  console.log(`\ncapture-screenshots: ${count} written, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

main().catch((e) => fail(e?.message ?? String(e)));
