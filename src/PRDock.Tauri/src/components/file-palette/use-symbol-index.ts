export interface SymbolEntry {
  name: string;
  rel_path: string;
  line: number;
}

/**
 * Filter a flat list of symbol entries by a case-insensitive substring of the
 * name, and sort by (path, line). Pure function — the hook state is held by
 * the caller (FilePaletteApp) so testing stays cheap.
 */
export function mergeSymbolHits(all: SymbolEntry[], query: string): SymbolEntry[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  return all
    .filter((s) => s.name.toLowerCase().includes(lower))
    .sort((a, b) =>
      a.rel_path === b.rel_path ? a.line - b.line : a.rel_path.localeCompare(b.rel_path),
    );
}

/** Language id for a given extension, or null if we don't index it. */
export function languageForExtension(ext: string): 'typescript' | 'javascript' | 'rust' | 'c_sharp' | null {
  const lower = ext.toLowerCase();
  if (lower === 'ts' || lower === 'tsx') return 'typescript';
  if (lower === 'js' || lower === 'jsx' || lower === 'mjs' || lower === 'cjs') return 'javascript';
  if (lower === 'rs') return 'rust';
  if (lower === 'cs') return 'c_sharp';
  return null;
}
