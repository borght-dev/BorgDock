#!/usr/bin/env node
// Check every internal link in the built site (site/dist).
//
//   bun scripts/check-links.mjs [DIST_DIR]      (default: site/dist)
//
// Runs at the end of `bun run site:build`. For each HTML page it collects
// href, src, srcset, poster and the gallery's data-full / data-video /
// data-poster / data-mp4 / data-webm values that point inside the site
// (absolute paths or relative ones, not http(s)/mailto/data), and checks that
// the file exists in dist (as the file itself, <path>/index.html or
// <path>.html). Root-absolute links must start with Astro's `base` (read from
// astro.config.mjs). A `#fragment` must match an id on the target page. Exits
// 1 with the list of broken links.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '..');
const dist = path.resolve(process.cwd(), process.argv[2] ?? path.join(siteRoot, 'dist'));

/** Astro's `base` ('/' unless the config sets one), with a trailing slash. */
async function astroBase() {
  try {
    const mod = await import(pathToFileURL(path.join(siteRoot, 'astro.config.mjs')).href);
    const b = mod.default?.base ?? '/';
    return b.endsWith('/') ? b : `${b}/`;
  } catch {
    return '/';
  }
}
const BASE = await astroBase();

if (!fs.existsSync(dist)) {
  console.error('check-links: site/dist does not exist; run the Astro build first');
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const pages = walk(dist).filter((f) => f.endsWith('.html'));
const idCache = new Map();

function idsOf(file) {
  if (!idCache.has(file)) {
    const html = fs.readFileSync(file, 'utf8');
    idCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idCache.get(file);
}

/** The dist file a site path resolves to, or null. */
function resolveTarget(urlPath) {
  const clean = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const base = path.join(dist, clean);
  const candidates = [base, path.join(base, 'index.html'), `${base}.html`];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

/** The URL path a dist file is served at, including the base. */
function pagePath(file) {
  const rel = path.relative(dist, file).split(path.sep).join('/');
  if (rel === 'index.html') return BASE;
  if (rel.endsWith('/index.html')) return `${BASE}${rel.slice(0, -'index.html'.length)}`;
  return `${BASE}${rel}`;
}

const broken = [];
let checked = 0;

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const from = pagePath(file);
  const refs = [];
  for (const m of html.matchAll(
    /\s(href|src|poster|data-full|data-video|data-poster|data-mp4|data-webm)="([^"]*)"/g,
  )) {
    refs.push(m[2]);
  }
  for (const m of html.matchAll(/\ssrcset="([^"]*)"/g)) {
    for (const part of m[1].split(',')) refs.push(part.trim().split(/\s+/)[0]);
  }

  for (const raw of refs) {
    const ref = raw.replace(/&amp;/g, '&');
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) continue; // external, mailto, data…
    checked++;
    const [pathPart, fragment] = ref.split('#');
    const noQuery = pathPart.split('?')[0];
    const resolvedPath = noQuery === '' ? from : new URL(noQuery, `https://site${from}`).pathname;
    if (noQuery !== '' && !`${resolvedPath}/`.startsWith(BASE)) {
      broken.push(`${from}: ${ref} (outside the site base ${BASE})`);
      continue;
    }
    const target = noQuery === '' ? file : resolveTarget(resolvedPath.slice(BASE.length - 1));
    if (!target) {
      broken.push(`${from}: ${ref} (no such file)`);
      continue;
    }
    if (fragment && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(fragment))) {
      broken.push(`${from}: ${ref} (no element with id "${fragment}")`);
    }
  }
}

if (broken.length) {
  console.error(`check-links: ${broken.length} broken internal link(s):\n  ${broken.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-links: ${checked} internal link(s) in ${pages.length} page(s), all resolve`);
