import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ESM-safe equivalent of CommonJS `__dirname`. Call from a module
 * passing its own `import.meta.url`:
 *
 * ```ts
 * import { dirnameOf } from './helpers/esm-paths';
 * const __dirname = dirnameOf(import.meta.url);
 * ```
 */
export function dirnameOf(importMetaUrl: string): string {
  return path.dirname(fileURLToPath(importMetaUrl));
}
