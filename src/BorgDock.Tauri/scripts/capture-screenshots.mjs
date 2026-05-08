#!/usr/bin/env node
// scripts/capture-screenshots.mjs
//
// Story-driven screenshot + animation pipeline. Replaces
// scripts/screenshot-heroes.mjs.
//
// Static stories opt in via `parameters.screenshot`; animated stories
// opt in via `parameters.animation` AND a `play` function that drives
// the interaction. A single story may carry both.
//
// Flow:
//   1. Build storybook-static/ if missing or stale.
//   2. Read storybook-static/index.json — enumerate ALL story IDs.
//      (Storybook 10's index.json does not include story parameters,
//      so the filter happens at runtime per-story below.)
//   3. Spin up a static server pointing at storybook-static/.
//   4. Launch Chromium. For each story, probe parameters.screenshot
//      AND parameters.animation; collect tagged ones.
//   5. Detect duplicate output paths across both static and animated.
//   6. Capture each tagged story (re-navigate per story for fresh state).
//      Static = single PNG. Animated = frame loop + ffmpeg encode → GIF.
//   7. Report captured / skipped / errors.
//
// CLI flags:
//   --rebuild           Force storybook-static/ rebuild even if present.
//   --skip-animations   Skip animation captures (useful while iterating
//                       on static shots — animations are slower).

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';
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
// navigating to its iframe. Returns { screenshot, animation } — either
// or both may be undefined.
async function readCaptureParams(page) {
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
    return {
      screenshot: params?.screenshot,
      animation: params?.animation,
    };
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

// Navigate to a story's iframe and probe its capture parameters.
// Returns { screenshot, animation } — either, both, or neither may
// be defined.
async function visitAndProbe(page, baseUrl, storyId) {
  await page.goto(`${baseUrl}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  return await readCaptureParams(page);
}

async function captureStory(page, sp, storyId) {
  await page.setViewportSize({ width: sp.width, height: sp.height });
  // Animation-disable injection — applies to static captures only. For
  // animated captures, we DON'T disable animations (defeats the point).
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

// Run ffmpeg-static with the given args. Resolves on exit code 0,
// rejects with stderr on any non-zero exit.
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    if (!ffmpegStatic) {
      reject(new Error('ffmpeg-static binary not found — run `bun install`'));
      return;
    }
    const proc = spawn(ffmpegStatic, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.split('\n').slice(-5).join('\n')}`));
    });
  });
}

// Capture an animated story to a GIF. Frames are screenshotted at `fps`
// while the story renders + the play function runs; collected frames are
// piped through ffmpeg-static (two-pass palette generation) to produce
// a GIF at parameters.animation.output.
//
// Animation runs from the moment the page loads. Storybook's
// `play` function fires automatically after the story's component
// mounts, which happens shortly after navigation. Frame capture begins
// as soon as the story's parameters are populated and runs for the
// full `duration`. If `play` resolves earlier, the remaining frames
// pad the GIF with the final state — usually fine.
async function captureAnimation(page, ap, storyId) {
  const fps = ap.fps ?? 12;
  const duration = ap.duration ?? 5000;
  const interval = 1000 / fps;

  await page.setViewportSize({ width: ap.width, height: ap.height });

  // Re-navigate fresh so play function runs from the start.
  // Note: parent caller already navigated, but we re-navigate here to
  // align play-function start with frame-loop start.
  await page.evaluate(() => document.fonts.ready);

  if (ap.waitFor) {
    await page.waitForSelector(ap.waitFor, { timeout: 5000 });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'borgdock-anim-'));
  let frameIndex = 0;
  const startedAt = Date.now();

  // Frame loop — capture until duration elapsed.
  while (Date.now() - startedAt < duration) {
    const frameStart = Date.now();
    const framePath = path.join(tmpDir, `frame_${String(frameIndex).padStart(4, '0')}.png`);
    try {
      await page.screenshot({ path: framePath, omitBackground: false });
      frameIndex++;
    } catch (err) {
      // Ignore screenshot races (page may be transitioning) — drop the frame.
      console.warn(`  frame ${frameIndex} dropped: ${err?.message ?? err}`);
    }
    const elapsed = Date.now() - frameStart;
    const wait = Math.max(0, interval - elapsed);
    if (wait > 0) await page.waitForTimeout(wait);
  }

  if (frameIndex === 0) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`captured 0 frames for ${storyId}`);
  }

  // Encode: two-pass palette generation for clean GIF output.
  const outPath = path.resolve(repoRoot, ap.output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const palette = path.join(tmpDir, 'palette.png');

  await runFfmpeg([
    '-y',
    '-framerate',
    String(fps),
    '-i',
    path.join(tmpDir, 'frame_%04d.png'),
    '-filter_complex',
    '[0:v] palettegen=stats_mode=full',
    palette,
  ]);

  await runFfmpeg([
    '-y',
    '-framerate',
    String(fps),
    '-i',
    path.join(tmpDir, 'frame_%04d.png'),
    '-i',
    palette,
    '-filter_complex',
    '[0:v][1:v] paletteuse=dither=bayer:bayer_scale=5',
    '-loop',
    '0',
    outPath,
  ]);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  const stat = fs.statSync(outPath);
  const sizeKB = Math.round(stat.size / 1024);
  console.log(
    `wrote ${path.relative(repoRoot, outPath)} (${frameIndex} frames @ ${fps}fps, ${sizeKB} KB)`,
  );
}

async function main() {
  await ensureStorybookBuilt();

  const skipAnimations = process.argv.includes('--skip-animations');

  const allStories = enumerateStoryIds();
  if (allStories.length === 0) fail('no stories found in storybook-static/index.json');

  const { server, url } = await startStaticServer();
  console.log(
    `capture-screenshots: serving storybook-static/ at ${url}; probing ${allStories.length} stories…`,
  );

  const browser = await chromium.launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();

  // First pass: visit each story and collect parameters.screenshot AND
  // parameters.animation. We probe both together to avoid double-navigation
  // overhead, and detect duplicate output paths before writing anything.
  const taggedStatic = [];
  const taggedAnimated = [];
  for (const story of allStories) {
    try {
      const params = await visitAndProbe(page, url, story.id);
      if (params.screenshot) taggedStatic.push({ story, sp: params.screenshot });
      if (params.animation && !skipAnimations) taggedAnimated.push({ story, ap: params.animation });
    } catch (err) {
      console.error(`capture-screenshots: probe failed for ${story.id}: ${err?.message ?? err}`);
    }
  }

  if (taggedStatic.length === 0 && taggedAnimated.length === 0) {
    await browser.close();
    server.close();
    fail('no stories with parameters.screenshot or parameters.animation found');
  }

  // Detect duplicate output paths across BOTH static and animated.
  const seen = new Map();
  const checkDup = (output, storyId, kind) => {
    if (seen.has(output)) {
      throw new Error(
        `duplicate output path "${output}" — used by ${seen.get(output)} and ${storyId} (${kind})`,
      );
    }
    seen.set(output, storyId);
  };
  try {
    for (const { story, sp } of taggedStatic) checkDup(sp.output, story.id, 'screenshot');
    for (const { story, ap } of taggedAnimated) checkDup(ap.output, story.id, 'animation');
  } catch (err) {
    await browser.close();
    server.close();
    fail(err.message);
  }

  console.log(
    `capture-screenshots: ${taggedStatic.length} static + ${taggedAnimated.length} animated tagged; capturing…`,
  );

  let count = 0;
  let errors = 0;

  // Static pass.
  for (const { story, sp } of taggedStatic) {
    try {
      await page.setViewportSize({ width: sp.width, height: sp.height });
      await page.goto(`${url}/iframe.html?id=${story.id}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });
      await captureStory(page, sp, story.id);
      count++;
    } catch (err) {
      console.error(`capture-screenshots: static capture failed for ${story.id}: ${err?.message ?? err}`);
      errors++;
    }
  }

  // Animation pass — slower (frame loop + ffmpeg encode per story).
  for (const { story, ap } of taggedAnimated) {
    try {
      await page.setViewportSize({ width: ap.width, height: ap.height });
      await page.goto(`${url}/iframe.html?id=${story.id}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });
      // Wait for story params to be populated before starting the frame loop.
      await page.waitForFunction(
        () => window.__STORYBOOK_PREVIEW__?.currentRender?.story?.parameters !== undefined,
        { timeout: 15000 },
      );
      await captureAnimation(page, ap, story.id);
      count++;
    } catch (err) {
      console.error(
        `capture-screenshots: animation capture failed for ${story.id}: ${err?.message ?? err}`,
      );
      errors++;
    }
  }

  await browser.close();
  server.close();

  console.log(`\ncapture-screenshots: ${count} written, ${errors} errors`);
  if (errors > 0) process.exit(1);
}

main().catch((e) => fail(e?.message ?? String(e)));
