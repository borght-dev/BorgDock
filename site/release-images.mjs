// Vite plugin behind `virtual:release-images`: the hero screenshots that
// /CHANGELOG.md points at (`![…](whats-new/<version>/<slug>.png)`), imported
// from docs/whats-new and keyed by `<version>/<slug>.png`, for the generated
// release posts (src/pages/whats-new/[version].astro).
//
// Only referenced images are imported, and none for a version with a
// hand-written post: Astro ships the original of any image that is imported
// but never rendered, so a glob over docs/whats-new would publish every
// unused capture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const changelog = path.resolve(siteDir, '../CHANGELOG.md');
const docsDir = path.resolve(siteDir, '../docs/whats-new');
const pagesDir = path.resolve(siteDir, 'src/pages/whats-new');

const ID = 'virtual:release-images';
const RESOLVED = `\0${ID}`;

function handWrittenVersions() {
  return new Set(
    fs
      .readdirSync(pagesDir)
      .filter((f) => /^\d+[.-]\d+[.-]\d+\.astro$/.test(f))
      .map((f) => f.replace(/\.astro$/, '').replace(/-/g, '.')),
  );
}

export function releaseImages() {
  return {
    name: 'borgdock-release-images',
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      this.addWatchFile(changelog);
      const md = fs.readFileSync(changelog, 'utf8');
      const skip = handWrittenVersions();
      const refs = [...new Set([...md.matchAll(/\]\(whats-new\/([^)\s]+\.png)\)/g)].map((m) => m[1]))];
      const used = refs.filter((ref) => !skip.has(ref.split('/')[0]));
      const imports = used.map(
        (ref, i) => `import i${i} from ${JSON.stringify(path.join(docsDir, ref).replace(/\\/g, '/'))};`,
      );
      const entries = used.map((ref, i) => `  ${JSON.stringify(ref)}: i${i},`);
      return `${imports.join('\n')}\nexport default {\n${entries.join('\n')}\n};\n`;
    },
  };
}
