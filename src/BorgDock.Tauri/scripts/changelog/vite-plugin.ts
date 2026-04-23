import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { parseChangelog } from './parse';
import { emitModule } from './emit';
import { syncImages } from './copy-images';

interface PluginOptions {
  /** Monorepo/package root. Paths below are resolved relative to this. */
  packageRoot: string;
  /** Repo root (where CHANGELOG.md lives). */
  repoRoot: string;
}

function run({ packageRoot, repoRoot }: PluginOptions): void {
  const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
  const docsRoot = path.join(repoRoot, 'docs', 'whats-new');
  const publicRoot = path.join(packageRoot, 'public', 'whats-new');
  const outPath = path.join(packageRoot, 'src', 'generated', 'changelog.ts');

  const md = fs.readFileSync(changelogPath, 'utf8');
  const parsed = parseChangelog(md);
  syncImages({ refs: parsed.imageRefs, docsRoot, publicRoot });

  const next = emitModule(parsed.releases);
  const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
  if (current !== next) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, next, 'utf8');
  }
}

export function changelogPlugin(options: PluginOptions): Plugin {
  return {
    name: 'borgdock-whats-new-changelog',
    buildStart() {
      run(options);
    },
    configureServer(server: ViteDevServer) {
      const watchPaths = [
        path.join(options.repoRoot, 'CHANGELOG.md'),
        path.join(options.repoRoot, 'docs', 'whats-new'),
      ];
      for (const p of watchPaths) server.watcher.add(p);

      const norm = (p: string) => p.replace(/\\/g, '/');
      const changelogPath = norm(path.join(options.repoRoot, 'CHANGELOG.md'));
      const docsPrefix = norm(path.join(options.repoRoot, 'docs', 'whats-new')) + '/';

      server.watcher.on('change', (changed) => {
        const c = norm(changed);
        if (c === changelogPath || c.startsWith(docsPrefix)) {
          try {
            run(options);
          } catch (err) {
            server.config.logger.error(
              `[whats-new] changelog plugin error: ${(err as Error).message}`,
            );
          }
        }
      });
    },
  };
}
