#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelog } from './parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(`validate-release: ${msg}`);
  process.exit(1);
}

function main() {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`usage: validate-release <VERSION>  (got "${version ?? ''}")`);
  }

  const packageRoot = path.resolve(__dirname, '../..');
  const repoRoot = path.resolve(packageRoot, '../..');
  const changelogPath = path.join(repoRoot, 'CHANGELOG.md');

  if (!fs.existsSync(changelogPath)) fail(`${changelogPath} does not exist`);

  const md = fs.readFileSync(changelogPath, 'utf8');
  const { releases } = parseChangelog(md);
  const target = releases.find((r) => r.version === version);
  if (!target) fail(`no CHANGELOG entry for ${version}`);

  const missing = target.highlights.filter((h) => !h.hero);
  if (missing.length > 0) {
    const lines = missing
      .map(
        (h) =>
          `  - "${h.title}" (${h.kind}): add docs/whats-new/${version}/<slug>.png and reference it as ![](whats-new/${version}/<slug>.png), or remove **bold title** to demote it to the Also-fixed list.`,
      )
      .join('\n');
    fail(`${missing.length} highlight(s) in ${version} have no hero image:\n${lines}`);
  }

  // eslint-disable-next-line no-console
  console.log(`validate-release: ${version} OK (${target.highlights.length} highlights)`);
}

main();
