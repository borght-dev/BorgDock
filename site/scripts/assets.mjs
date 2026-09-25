#!/usr/bin/env node
// Regenerate every capture and recording on the site in one go.
//
//   bun run site:assets                   (from the repo root)
//   bun run site:assets -- --reuse        use a Storybook already running on :6006
//   bun run site:assets -- --screens      screenshots only (or --recordings)
//
// Starts Storybook on :6006 from this checkout's app, waits for its
// index.json, runs the screenshot manifest (design/site/screens.json) and the
// recorder (design/site/recordings.json), then stops the Storybook it started.
// The captures land in site/public/screens and site/public/recordings; commit
// them, since CI only builds the site and never runs Storybook.
//
// A server already listening on :6006 is refused unless --reuse is passed:
// it may be serving another checkout or worktree, and the captures would then
// show that code instead of this one. Exits 1 when any capture or recording
// failed (after writing everything that worked).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const appDir = path.join(repoRoot, 'src', 'BorgDock.Tauri');
const PORT = 6006;
const URL_BASE = `http://localhost:${PORT}`;

const args = process.argv.slice(2);
const onlyScreens = args.includes('--screens');
const onlyRecordings = args.includes('--recordings');
const reuse = args.includes('--reuse');

async function storyIndex() {
  try {
    const res = await fetch(`${URL_BASE}/index.json`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Does the running Storybook serve this checkout? Its index lists each
 * story's importPath relative to the app directory it was started in.
 */
function servesThisCheckout(index) {
  const entry = Object.values(index?.entries ?? {}).find((e) => e.importPath);
  if (!entry) return null;
  return fs.existsSync(path.resolve(appDir, entry.importPath));
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // Only the tree of the process this script started.
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

function runNode(script) {
  const r = spawnSync(process.execPath, [path.join('scripts', script)], {
    cwd: appDir,
    stdio: 'inherit',
    env: { ...process.env, STORYBOOK_URL: URL_BASE },
  });
  return r.status === 0;
}

let child = null;
const existing = await storyIndex();
if (existing) {
  if (!reuse) {
    console.error(
      `site:assets: something is already serving Storybook on :${PORT}. Stop it, or pass --reuse ` +
        `if it is this checkout's Storybook (${appDir}).`,
    );
    process.exit(1);
  }
  const ours = servesThisCheckout(existing);
  if (ours === false) {
    console.error(
      `site:assets: the Storybook on :${PORT} does not serve ${appDir} (its stories are not in this checkout). Stop it and run again without --reuse.`,
    );
    process.exit(1);
  }
  console.log(`site:assets: reusing the Storybook on :${PORT}, serving ${appDir}`);
} else {
  // The storybook package may sit in the app's node_modules or be hoisted to the root.
  const pkg = createRequire(import.meta.url).resolve('storybook/package.json', { paths: [appDir] });
  const bin = path.join(path.dirname(pkg), 'dist', 'bin', 'dispatcher.js');
  console.log(`site:assets: starting Storybook on :${PORT}, serving ${appDir}`);
  child = spawn(process.execPath, [bin, 'dev', '-p', String(PORT), '--no-open', '--ci'], {
    cwd: appDir,
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));

  // Wait for the index, but stop waiting the moment Storybook exits.
  const until = Date.now() + 180_000;
  let ready = false;
  let exitCode;
  while (Date.now() < until) {
    exitCode = await Promise.race([exited, new Promise((r) => setTimeout(() => r(undefined), 2000))]);
    if (exitCode !== undefined) break;
    if (await storyIndex()) {
      ready = true;
      break;
    }
  }
  if (!ready) {
    stop(child);
    const why =
      exitCode !== undefined
        ? `Storybook exited with code ${exitCode}`
        : 'Storybook did not come up within 3 minutes';
    console.error(`site:assets: ${why}.${stderr.trim() ? `\n--- Storybook stderr ---\n${stderr.trim()}` : ''}`);
    process.exit(1);
  }
  child.once('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`site:assets: Storybook exited early (code ${code}).\n${stderr.trim()}`);
    }
  });
}

let ok = true;
try {
  if (!onlyRecordings) ok = runNode('screenshot-manifest.mjs') && ok;
  if (!onlyScreens) ok = runNode('record-stories.mjs') && ok;
} finally {
  stop(child);
}
process.exit(ok ? 0 : 1);
