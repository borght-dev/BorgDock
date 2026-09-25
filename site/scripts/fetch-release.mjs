#!/usr/bin/env node
// Refresh site/src/data/release.json from the latest published GitHub release
// (the releases/latest endpoint: never a draft or a prerelease).
//
//   bun run site:release            (from the repo root)
//
// The build reads the JSON, so CI never calls the API. Uses the public
// releases API (no token needed; GITHUB_TOKEN is sent when set, which only
// raises the rate limit). On any error the existing file is kept and the
// script exits 0 with a warning, so a flaky network never breaks a build.
//
// The repository is the one `release-tauri.yml` publishes to: the repo in the
// app's updater endpoint (src-tauri/tauri.conf.json), overridable with
// BORGDOCK_REPO=owner/name.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '..');
const repoRoot = path.resolve(siteRoot, '..');
const outFile = path.join(siteRoot, 'src', 'data', 'release.json');

function repoFromTauriConf() {
  try {
    const conf = fs.readFileSync(
      path.join(repoRoot, 'src', 'BorgDock.Tauri', 'src-tauri', 'tauri.conf.json'),
      'utf8',
    );
    const m = conf.match(/github\.com\/([\w.-]+\/[\w.-]+)\/releases/);
    if (m) return m[1];
  } catch {
    /* fall through */
  }
  return 'borght-dev/BorgDock';
}

const repo = process.env.BORGDOCK_REPO || repoFromTauriConf();

async function main() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'borgdock-site-release-fetch',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  // /releases/latest is the newest published, non-draft, non-prerelease release.
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (res.status === 404) throw new Error(`no published release found for ${repo}`);
  if (!res.ok) throw new Error(`GitHub API returned HTTP ${res.status}`);
  const latest = await res.json();

  const data = {
    repo,
    tag: latest.tag_name,
    version: latest.tag_name.replace(/^v/, ''),
    name: latest.name || latest.tag_name,
    date: (latest.published_at || latest.created_at || '').slice(0, 10),
    url: latest.html_url,
    fetchedAt: new Date().toISOString(),
    assets: (latest.assets || []).map((a) => ({
      name: a.name,
      size: a.size,
      url: a.browser_download_url,
      ...(a.digest ? { digest: a.digest } : {}),
    })),
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    `fetch-release: ${repo} ${data.tag} (${data.date}), ${data.assets.length} asset(s) -> ${path.relative(repoRoot, outFile)}`,
  );
}

try {
  await main();
} catch (err) {
  const kept = fs.existsSync(outFile) ? 'kept the existing release.json' : 'no release.json exists yet';
  console.warn(`fetch-release: ${err.message}; ${kept}`);
}
