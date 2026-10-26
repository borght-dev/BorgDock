import cSharp from '@/components/file-palette/queries/c_sharp.scm?raw';
import javascript from '@/components/file-palette/queries/javascript.scm?raw';
import rust from '@/components/file-palette/queries/rust.scm?raw';
import typescript from '@/components/file-palette/queries/typescript.scm?raw';
import type { SymbolEntry } from '@/types/symbol';
import { syntaxLanguage } from './syntax-engine';
import { loadTreeSitter } from './tree-sitter-runtime';

export async function extractSymbols(filename: string, lines: string[]): Promise<SymbolEntry[]> {
  const extension = filename.split('.').pop()?.toLowerCase();
  const queryText =
    extension === 'cs'
      ? cSharp
      : extension === 'rs'
        ? rust
        : extension === 'ts' || extension === 'tsx'
          ? typescript
          : ['js', 'jsx', 'mjs', 'cjs'].includes(extension ?? '')
            ? javascript
            : null;
  if (!queryText) return [];
  const language = await syntaxLanguage(filename);
  if (!language) return [];
  const { Parser, Query } = await loadTreeSitter();
  const parser = new Parser();
  try {
    parser.setLanguage(language);
    const query = new Query(language, queryText);
    try {
      const tree = parser.parse(lines.join('\n'));
      if (!tree) return [];
      try {
        return query
          .captures(tree.rootNode)
          .filter((capture) => capture.name === 'symbol.name')
          .map((capture) => ({
            name: capture.node.text,
            rel_path: filename,
            line: capture.node.startPosition.row + 1,
          }));
      } finally {
        tree.delete();
      }
    } finally {
      query.delete();
    }
  } finally {
    parser.delete();
  }
}
