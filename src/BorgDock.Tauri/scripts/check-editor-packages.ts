import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function duplicateEditorModules(packageRoot: string): Record<string, string[]> {
  const manifestPath = path.join(packageRoot, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const appRequire = createRequire(manifestPath);
  const packages = Object.keys(manifest.dependencies).filter(
    (name) => name.startsWith('@codemirror/') || name.startsWith('@lezer/') || name === 'codemirror',
  );
  const sources = [appRequire, ...packages.map((name) => createRequire(appRequire.resolve(name)))];
  const modules = [...packages, '@lezer/common', '@lezer/highlight', '@lezer/lr'];
  const duplicates: Record<string, string[]> = {};
  for (const name of new Set(modules)) {
    const resolved = new Set<string>();
    for (const source of sources) {
      try {
        resolved.add(fs.realpathSync(source.resolve(name)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;
      }
    }
    if (resolved.size > 1) duplicates[name] = [...resolved];
  }
  return duplicates;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const duplicates = duplicateEditorModules(fileURLToPath(new URL('..', import.meta.url)));
  if (Object.keys(duplicates).length > 0) {
    console.error('Duplicate editor modules. Remove stale workspace editor packages and run bun install.');
    console.error(JSON.stringify(duplicates, null, 2));
    process.exitCode = 1;
  }
}
