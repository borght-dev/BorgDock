#!/usr/bin/env node
// scripts/capture-screenshots.mjs
//
// Story-driven screenshot pipeline. Replaces scripts/screenshot-heroes.mjs.
//
// Flow:
//   1. Build storybook-static/ if missing or stale.
//   2. Read storybook-static/index.json — enumerate ALL story IDs.
//      (Storybook 10's index.json does not include story parameters,
//      so the filter happens at runtime per-story below.)
//   3. Spin up a static server pointing at storybook-static/.
//   4. Launch Chromium. For each story:
//        a. Navigate to iframe.html?id=<id>.
//        b. Read parameters.screenshot from the running preview's
//           __STORYBOOK_PREVIEW__.storyStoreValue.
//        c. If present, set viewport, wait for fonts/layout, capture PNG.
//        d. If absent, skip silently.
//   5. Report captured / skipped / errors.

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

function enumerateStoryIds() {
  const indexPath = path.join(storybookStatic, 'index.json');
  const idx = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const entries = Object.values(idx.entries ?? idx.stories ?? {});
  return entries.map((e) => ({ id: e.id, name: e.name, title: e.title }));
}

// Probe a story's parameters via Storybook's runtime preview API after
// navigating to its iframe. Returns parameters.screenshot or undefined.
async function readScreenshotParam(page) {
  // Storybook 10 exposes the preview on window.__STORYBOOK_PREVIEW__.
  // currentRender.story.parameters is populated after the story has been
  // prepared and rendered — that's the marker we wait for.
  await page.waitForFunction(
    () => {
      const p = window.__STORYBOOK_PREVIEW__;
      return p?.currentRender?.story?.parameters !== undefined;
    },
    { timeout: 15000 },
  );
  return await page.evaluate(() => {
    const params = window.__STORYBOOK_PREVIEW__?.currentRender?.story?.parameters;
    return params?.screenshot;
  });
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

// Navigate to a story's iframe and probe its parameters.screenshot.
// Returns the screenshot params if present, else undefined.
async function visitAndProbe(page, baseUrl, storyId) {
  await page.goto(`${baseUrl}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  return await readScreenshotParam(page);
}

async function captureStory(page, sp, storyId) {
  await page.setViewportSize({ width: sp.width, height: sp.height });
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
    if (!el) throw new Error(`selector "${sp.selector}" not found in story ${storyId}`);
    await el.screenshot({ path: outPath, omitBackground: false });
  } else {
    await page.screenshot({ path: outPath, omitBackground: false, fullPage: false });
  }
  console.log(`wrote ${path.relative(repoRoot, outPath)}`);
}

async function main() {
  await ensureStorybookBuilt();

  const allStories = enumerateStoryIds();
  if (allStories.length === 0) fail('no stories found in storybook-static/index.json');

  const { server, url } = await startStaticServer();
  console.log(
    `capture-screenshots: serving storybook-static/ at ${url}; probing ${allStories.length} stories…`,
  );

  // deviceScaleFactor is set on the context. Stories that need a non-default
  // dsf would require re-creating the context; defer that until a story
  // actually asks for one (none currently do).
  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();

  // First pass: visit each story and collect its parameters.screenshot.
  // We do the navigation and the capture in two passes so we can detect
  // duplicate output paths before writing any PNGs.
  const tagged = [];
  for (const story of allStories) {
    try {
      const sp = await visitAndProbe(page, url, story.id);
      if (sp) tagged.push({ story, sp });
    } catch (err) {
      console.error(`capture-screenshots: probe failed for ${story.id}: ${err?.message ?? err}`);
    }
  }

  if (tagged.length === 0) {
    await browser.close();
    server.close();
    fail('no stories with parameters.screenshot found (all probes returned undefined)');
  }

  // Detect duplicate output paths.
  const seen = new Map();
  for (const { story, sp } of tagged) {
    if (seen.has(sp.output)) {
      await browser.close();
      server.close();
      fail(`duplicate output path "${sp.output}" — used by ${seen.get(sp.output)} and ${story.id}`);
    }
    seen.set(sp.output, story.id);
  }

  console.log(
    `capture-screenshots: ${tagged.length} of ${allStories.length} stories tagged; capturing…`,
  );

  // Second pass: capture each tagged story. Re-navigation is unavoidable
  // because we need to apply the per-story viewport size.
  let count = 0;
  let errors = 0;
  for (const { story, sp } of tagged) {
    try {
      await page.setViewportSize({ width: sp.width, height: sp.height });
      await page.goto(`${url}/iframe.html?id=${story.id}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });
      await captureStory(page, sp, story.id);
      count++;
    } catch (err) {
      console.error(`capture-screenshots: capture failed for ${story.id}: ${err?.message ?? err}`);
      errors++;
    }
  }

  await browser.close();
  server.close();

  console.log(`\ncapture-screenshots: ${count} written, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

main().catch((e) => fail(e?.message ?? String(e)));
