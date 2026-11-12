import type { PrFileCategory } from '../../../shared/src/api.ts';

// How Quick Review walks a changed file. The desktop's `reviewFileCategory` and `isGeneratedPath`
// (src/BorgDock.Tauri/src/services/quick-review.ts) follow the same patterns; change both together.

const LOCKFILES = new Set(['bun.lock', 'bun.lockb', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'cargo.lock', 'package.resolved', 'podfile.lock']);

/** Snapshots and load-test reports sit inside test folders, yet nobody reads them line by line. */
const SNAPSHOTS = /\.snap$|(^|\/)__snapshots__\/|-snapshots\/|(^|\/)loadtests\/reports\//i;

const TESTS = [
  /(^|\/)[^/]*\.Tests(\/|$)/i,
  /(^|\/)(tests?|__tests__)(\/|$)/i,
  /\.(test|spec)\./i,
  /(^|\/)[^/]*(Tests|Testing)\//,
  /(^|\/)e2e\//i,
  /(^|\/)(fixtures|__fixtures__|test-fixtures|__mocks__)\//i,
  /(^|\/)\.storybook\/mocks\//i,
  /\.stories\./i,
  /(^|\/)loadtests\//i,
];

const GENERATED_NAMES = [/\.lock\.json$/, /\.generated\./, /\.g\.(cs|ts|dart)$/, /\.min\.js$/, /\.(js|css)\.map$/, /\.designer\.cs$/, /\.pbxproj$/];

const GENERATED_FOLDERS = [/(^|\/)generated\//i, /^(?:(?!src\/)[^/]+\/)?(dist|obj)\//i, /(^|\/)src-tauri\/gen\//i];

const BINARY = /\.(wasm|png|jpe?g|gif|webp|pdf|ico|woff2?|ttf)$/i;

const DOCS = /(^|\/)(docs?|documentation)(\/|$)|\.(md|mdx|rst)$/i;

function isGenerated(path: string, name: string, hasPatch: boolean): boolean {
  if (LOCKFILES.has(name) || GENERATED_NAMES.some((pattern) => pattern.test(name))) return true;
  if (GENERATED_FOLDERS.some((pattern) => pattern.test(path))) return true;
  return !hasPatch && BINARY.test(name);
}

/** `hasPatch` is false when GitHub sent no diff (a binary file): an image or font without one is generated. */
export function fileCategory(path: string, hasPatch: boolean): PrFileCategory {
  const normalized = path.replaceAll('\\', '/');
  const name = (normalized.split('/').pop() ?? '').toLowerCase();
  if (SNAPSHOTS.test(normalized)) return 'generated';
  if (TESTS.some((pattern) => pattern.test(normalized))) return 'tests';
  if (isGenerated(normalized, name, hasPatch)) return 'generated';
  if (DOCS.test(normalized)) return 'docs';
  return 'source';
}
