#!/usr/bin/env node
// Record short videos of Storybook stories for the marketing site.
//
// Usage:
//   node scripts/record-stories.mjs [MANIFEST] [OUT_DIR] [--only slug,slug]
//
// Defaults: MANIFEST = design/site/recordings.json, OUT_DIR = site/public/recordings
// (relative to the repo root). Each manifest entry:
//   {
//     "slug": "quick-review",
//     "storyId": "focus-quick-review--large-pr-card",   // or { "light": "...", "dark": "..." }
//     "viewport": { "width": 1280, "height": 800 },
//     "theme": "dark",                  // "dark" | "light" | "both"
//     "delay": 1500,                    // settle ms before the first step (default 800)
//     "scale": 1,                       // video pixel ratio (default 1; >1 only upscales)
//     "args": { "section": "prs" },     // optional story args via the URL
//     "alt": "…", "page": "Quick review",
//     "draft": true,                    // optional: skipped unless named with --only; hidden on the site
//     "steps": [
//       { "do": "hover",  "selector": "[data-pr-row]" },
//       { "do": "click",  "selector": "role=button[name=\"Review files\"]" },
//       { "do": "press",  "key": "v" },                     // optional "selector" to focus first
//       { "do": "type",   "selector": "input", "text": "fix" },
//       { "do": "wait",   "ms": 800 },                      // or "selector" to wait for
//       { "do": "scroll", "selector": "main", "y": 400 },   // wheel over the element
//       { "do": "emit",   "channel": "flyout-toast", "payload": { … } }
//     ]
//   }
// Selectors are Playwright selectors (CSS, `role=…`, `text=…`); the first match is used.
// A small cursor dot is drawn into the page so clicks read on video; the
// mouse glides to each target before hovering or clicking.
//
// Output per entry and theme: `<OUT_DIR>/<slug>-<theme>.mp4` (H.264, faststart,
// no audio) and `<slug>-<theme>.webp` (poster: the first frame after the story
// has settled; `.png` when no ffmpeg with libwebp exists). The page load before
// that point is trimmed off. `"crop": "<selector>"` crops the video and poster
// to that element's box, measured once the story has settled.
//
// ffmpeg: H.264 needs an ffmpeg with libx264. Playwright's own build under
// %LOCALAPPDATA%\ms-playwright\ffmpeg-*\ only has VP8 and PNG, so the script
// prefers `ffmpeg` on PATH (or FFMPEG=<path>) and uses Playwright's for the
// poster when nothing better exists. Without libx264 anywhere it keeps the
// trimmed recording as `<slug>-<theme>.webm` instead of the MP4 and says so;
// the site's Recording component plays either.
//
// Requires a running Storybook (STORYBOOK_URL, default http://localhost:6006).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadStoryIndex, openStory, repoRoot, waitForStory } from './screenshot-stories.mjs';

function fail(msg) {
  console.error(`record-stories: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// ffmpeg discovery

function ffmpegCandidates() {
  const list = [];
  if (process.env.FFMPEG) list.push(process.env.FFMPEG);
  list.push('ffmpeg');
  const pwRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
        : path.join(os.homedir(), '.cache', 'ms-playwright'));
  try {
    for (const dir of fs.readdirSync(pwRoot).filter((d) => d.startsWith('ffmpeg-')).sort().reverse()) {
      for (const exe of ['ffmpeg-win64.exe', 'ffmpeg-linux', 'ffmpeg-mac']) {
        const p = path.join(pwRoot, dir, exe);
        if (fs.existsSync(p)) list.push(p);
      }
    }
  } catch {
    /* no Playwright ffmpeg */
  }
  return list;
}

function encodersOf(bin) {
  const r = spawnSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout;
}

function findFfmpeg() {
  let h264 = null;
  let png = null;
  let webp = null;
  for (const bin of ffmpegCandidates()) {
    const enc = encodersOf(bin);
    if (!enc) continue;
    if (!h264 && /\blibx264\b/.test(enc)) h264 = bin;
    if (!png && /\bpng\b/.test(enc)) png = bin;
    if (!webp && /\blibwebp\b/.test(enc)) webp = bin;
  }
  return { h264, png: png ?? h264, webp };
}

function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${path.basename(bin)} failed: ${(r.stderr || '').split('\n').slice(-4).join(' ')}`);
  }
}

// ---------------------------------------------------------------------------
// Steps

const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById('__rec_cursor')) return;
    const dot = document.createElement('div');
    dot.id = '__rec_cursor';
    Object.assign(dot.style, {
      position: 'fixed',
      left: '-40px',
      top: '-40px',
      width: '18px',
      height: '18px',
      margin: '-9px 0 0 -9px',
      borderRadius: '50%',
      background: 'rgba(127, 126, 255, 0.35)',
      border: '2px solid rgba(255, 255, 255, 0.9)',
      boxShadow: '0 1px 6px rgba(0, 0, 0, 0.35)',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transition: 'transform 120ms ease',
    });
    document.documentElement.appendChild(dot);
    window.addEventListener(
      'mousemove',
      (e) => {
        dot.style.left = `${e.clientX}px`;
        dot.style.top = `${e.clientY}px`;
      },
      true,
    );
    window.addEventListener('mousedown', () => (dot.style.transform = 'scale(0.7)'), true);
    window.addEventListener('mouseup', () => (dot.style.transform = 'scale(1)'), true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
};

async function glideTo(page, locator, mouse) {
  await locator.scrollIntoViewIfNeeded({ timeout: 10_000 });
  const box = await locator.boundingBox({ timeout: 10_000 });
  if (!box) throw new Error('target has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 24 });
  mouse.x = x;
  mouse.y = y;
}

async function runStep(page, step, mouse) {
  const loc = step.selector ? page.locator(step.selector).first() : null;
  switch (step.do) {
    case 'wait':
      if (step.selector) await loc.waitFor({ state: 'visible', timeout: step.timeout ?? 10_000 });
      if (step.ms) await page.waitForTimeout(step.ms);
      return;
    case 'hover':
      await glideTo(page, loc, mouse);
      await page.waitForTimeout(step.ms ?? 350);
      return;
    case 'click':
      await glideTo(page, loc, mouse);
      await page.waitForTimeout(180);
      await page.mouse.down();
      await page.waitForTimeout(60);
      await page.mouse.up();
      await page.waitForTimeout(step.ms ?? 300);
      return;
    case 'press':
      if (loc) await loc.focus();
      await page.keyboard.press(step.key);
      await page.waitForTimeout(step.ms ?? 250);
      return;
    case 'type':
      if (loc) await loc.click();
      await page.keyboard.type(step.text, { delay: step.delay ?? 45 });
      await page.waitForTimeout(step.ms ?? 250);
      return;
    case 'scroll':
      if (loc) await glideTo(page, loc, mouse);
      await page.mouse.wheel(0, step.y ?? 300);
      await page.waitForTimeout(step.ms ?? 500);
      return;
    case 'emit':
      await page.evaluate(
        (ev) => window.__borgdock_storybook_tauri?.emit(ev.channel, ev.payload),
        { channel: step.channel, payload: step.payload },
      );
      await page.waitForTimeout(step.ms ?? 400);
      return;
    default:
      throw new Error(`unknown step "${step.do}"`);
  }
}

// ---------------------------------------------------------------------------
// Main

const positional = [];
let only = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--only') only = new Set((process.argv[++i] ?? '').split(',').filter(Boolean));
  else positional.push(a);
}
const manifestPath = path.resolve(repoRoot, positional[0] ?? 'design/site/recordings.json');
const outDir = path.resolve(repoRoot, positional[1] ?? 'site/public/recordings');
if (!fs.existsSync(manifestPath)) fail(`manifest not found: ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest) || manifest.length === 0) fail('manifest must be a non-empty JSON array');

// Validate the manifest before anything is launched, so a typo fails in a
// second instead of after a browser run.
const STEP_FIELDS = {
  hover: ['selector'],
  click: ['selector'],
  press: ['key'],
  type: ['text'],
  wait: [],
  scroll: [],
  emit: ['channel'],
};
const schemaErrors = [];
for (const [i, m] of manifest.entries()) {
  const where = `entry ${i + 1}${m?.slug ? ` (${m.slug})` : ''}`;
  if (!m || typeof m !== 'object') {
    schemaErrors.push(`${where}: not an object`);
    continue;
  }
  if (typeof m.slug !== 'string' || !/^[a-z0-9-]+$/.test(m.slug)) {
    schemaErrors.push(`${where}: "slug" must be lowercase letters, digits and dashes`);
  }
  const ids = typeof m.storyId === 'string' ? [m.storyId] : Object.values(m.storyId ?? {});
  if (ids.length === 0 || ids.some((id) => typeof id !== 'string' || !id)) {
    schemaErrors.push(`${where}: "storyId" must be a string or { light, dark }`);
  }
  if (m.theme && !['light', 'dark', 'both'].includes(m.theme)) {
    schemaErrors.push(`${where}: "theme" must be light, dark or both`);
  }
  if (m.viewport && !(m.viewport.width > 0 && m.viewport.height > 0)) {
    schemaErrors.push(`${where}: "viewport" needs a positive width and height`);
  }
  if (m.crop !== undefined && typeof m.crop !== 'string') {
    schemaErrors.push(`${where}: "crop" must be a selector string`);
  }
  if (!Array.isArray(m.steps)) {
    schemaErrors.push(`${where}: "steps" must be an array`);
    continue;
  }
  for (const [j, step] of m.steps.entries()) {
    const required = STEP_FIELDS[step?.do];
    if (!required) {
      schemaErrors.push(`${where} step ${j + 1}: unknown "do": ${JSON.stringify(step?.do)}`);
      continue;
    }
    for (const f of required) {
      if (step[f] === undefined || step[f] === '') {
        schemaErrors.push(`${where} step ${j + 1} (${step.do}): missing "${f}"`);
      }
    }
    if (step.ms !== undefined && !(typeof step.ms === 'number' && step.ms >= 0)) {
      schemaErrors.push(`${where} step ${j + 1} (${step.do}): "ms" must be a number`);
    }
  }
}
if (schemaErrors.length) fail(`invalid manifest ${manifestPath}:\n  ${schemaErrors.join('\n  ')}`);

const ff = findFfmpeg();
if (!ff.png) fail('no ffmpeg found (set FFMPEG=<path> or install ffmpeg)');
if (!ff.h264) {
  console.warn(
    'record-stories: no ffmpeg with libx264 found; writing WebM instead of MP4 (install ffmpeg or set FFMPEG)',
  );
}
if (!ff.webp) {
  console.warn('record-stories: no ffmpeg with libwebp found; writing PNG posters instead of WebP');
}

let known;
try {
  known = await loadStoryIndex();
} catch (err) {
  fail(err.message);
}

const jobs = [];
for (const m of manifest) {
  if (only && !only.has(m.slug)) continue;
  // Drafts are only recorded when named with --only.
  if (m.draft && !only) {
    console.log(`skipped ${m.slug} (draft${m.note ? `: ${m.note}` : ''})`);
    continue;
  }
  const themes = m.theme === 'light' ? ['light'] : m.theme === 'both' ? ['light', 'dark'] : ['dark'];
  for (const theme of themes) {
    const storyId = typeof m.storyId === 'string' ? m.storyId : m.storyId?.[theme];
    jobs.push({ ...m, storyId, theme });
  }
}
if (jobs.length === 0) fail('nothing to record (check --only)');

/** Even-sized crop box (H.264 needs even dimensions) inside the frame. */
function evenBox(box, frame) {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(frame.width - x, Math.floor(box.width));
  const h = Math.min(frame.height - y, Math.floor(box.height));
  return { x, y, w: w - (w % 2), h: h - (h % 2) };
}

fs.mkdirSync(outDir, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'borgdock-rec-'));
const written = [];
const failures = [];
let browser = null;

try {
  browser = await chromium.launch();
  for (const job of jobs) {
    const label = `${job.slug} [${job.theme}] (${job.storyId})`;
    if (!job.storyId || !known.has(job.storyId)) {
      failures.push(`${label}: not in the Storybook index`);
      console.error(`FAILED ${label}: not in the Storybook index`);
      continue;
    }
    const viewport = job.viewport ?? { width: 1280, height: 800 };
    const scale = job.scale ?? 1;
    const frame = { width: viewport.width * scale, height: viewport.height * scale };
    const { context, page } = await openStory(browser, job, {
      theme: job.theme,
      contextOptions: {
        // Playwright's screencast delivers CSS-pixel frames, so a higher device
        // scale only upscales them; 1× keeps the video and page the same size.
        deviceScaleFactor: scale,
        recordVideo: { dir: tmpDir, size: frame },
      },
    });
    const t0 = Date.now();
    let video = page.video();
    let startSec = 0;
    let crop = null;
    try {
      await context.addInitScript(CURSOR_SCRIPT);
      await waitForStory(page, { ...job, delay: job.delay ?? 800 }, job.theme);
      const isDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark'),
      );
      if (isDark !== (job.theme === 'dark')) {
        throw new Error(
          `story rendered ${isDark ? 'dark' : 'light'} instead of ${job.theme} (a story-level theme global overrides the URL; use a per-theme storyId)`,
        );
      }
      if (job.crop) {
        const box = await page.locator(job.crop).first().boundingBox({ timeout: 10_000 });
        if (!box) throw new Error(`crop target "${job.crop}" has no box`);
        crop = evenBox(
          {
            x: box.x * scale,
            y: box.y * scale,
            width: box.width * scale,
            height: box.height * scale,
          },
          frame,
        );
      }
      await page.evaluate(CURSOR_SCRIPT);
      startSec = Math.max(0, (Date.now() - t0) / 1000);
      const mouse = { x: viewport.width / 2, y: viewport.height / 2 };
      await page.mouse.move(mouse.x, mouse.y);
      for (const [i, step] of (job.steps ?? []).entries()) {
        try {
          await runStep(page, step, mouse);
        } catch (err) {
          throw new Error(
            `step ${i + 1} (${step.do} ${step.selector ?? step.key ?? ''}): ${err.message.split('\n')[0]}`,
          );
        }
      }
      await page.waitForTimeout(job.tail ?? 600);
    } catch (err) {
      failures.push(`${label}: ${err.message}`);
      console.error(`FAILED ${label}: ${err.message}`);
      video = null;
    } finally {
      await context.close();
    }
    if (!video) continue;

    const raw = await video.path();
    const base = path.join(outDir, `${job.slug}-${job.theme}`);
    const vf = crop ? ['-vf', `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`] : [];
    try {
      const ss = startSec.toFixed(2);
      // Poster: WebP when an ffmpeg with libwebp exists, else PNG. The other
      // format is removed so the site never picks up a stale poster.
      const posterExt = ff.webp ? 'webp' : 'png';
      const posterArgs = ff.webp ? ['-c:v', 'libwebp', '-quality', '82'] : [];
      run(ff.webp ?? ff.png, [
        '-y', '-loglevel', 'error', '-ss', ss, '-i', raw, ...vf, '-frames:v', '1',
        ...posterArgs, `${base}.${posterExt}`,
      ]);
      fs.rmSync(`${base}.${posterExt === 'webp' ? 'png' : 'webp'}`, { force: true });
      if (ff.h264) {
        run(ff.h264, [
          '-y', '-loglevel', 'error', '-ss', ss, '-i', raw, ...vf,
          '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-r', '30',
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${base}.mp4`,
        ]);
        fs.rmSync(`${base}.webm`, { force: true });
        written.push(`${base}.mp4`);
      } else {
        run(ff.png, [
          '-y', '-loglevel', 'error', '-ss', ss, '-i', raw, ...vf,
          '-an', '-c:v', 'libvpx', '-b:v', '2M', `${base}.webm`,
        ]);
        // A stale MP4 from an earlier run would otherwise win over the new WebM.
        fs.rmSync(`${base}.mp4`, { force: true });
        written.push(`${base}.webm`);
      }
      console.log(
        `wrote ${path.relative(repoRoot, base)}.{${ff.h264 ? 'mp4' : 'webm'},${posterExt}}  (${job.storyId})`,
      );
    } catch (err) {
      failures.push(`${label}: ${err.message}`);
      console.error(`FAILED ${label}: ${err.message}`);
    }
  }
} finally {
  await browser?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log(
  `\n${written.length}/${jobs.length} recording(s) written to ${path.relative(repoRoot, outDir)}`,
);
if (failures.length) fail(`${failures.length} recording(s) failed:\n  ${failures.join('\n  ')}`);
