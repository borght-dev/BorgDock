import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { languageForExtension, type SymbolEntry } from './use-symbol-index';
import type { FileEntry } from './use-file-index';

// Dynamically loaded once per session.
let treeSitterPromise: Promise<{
  Parser: typeof import('web-tree-sitter').Parser;
  Language: typeof import('web-tree-sitter').Language;
  Query: typeof import('web-tree-sitter').Query;
}> | null = null;

async function loadTreeSitter() {
  if (!treeSitterPromise) {
    treeSitterPromise = (async () => {
      const mod = await import('web-tree-sitter');
      await mod.Parser.init({
        locateFile: (name: string) => `/${name}`,
      });
      return { Parser: mod.Parser, Language: mod.Language, Query: mod.Query };
    })();
  }
  return treeSitterPromise;
}

const langCache = new Map<string, Promise<import('web-tree-sitter').Language>>();

function loadLanguage(id: 'typescript' | 'javascript' | 'rust' | 'c_sharp') {
  if (!langCache.has(id)) {
    const grammarFile =
      id === 'typescript'
        ? 'tree-sitter-typescript.wasm'
        : id === 'javascript'
          ? 'tree-sitter-javascript.wasm'
          : id === 'rust'
            ? 'tree-sitter-rust.wasm'
            : 'tree-sitter-c_sharp.wasm';
    langCache.set(
      id,
      loadTreeSitter().then(({ Language }) => Language.load(`/grammars/${grammarFile}`)),
    );
  }
  return langCache.get(id)!;
}

const queryCache = new Map<string, Promise<string>>();

function loadQuery(id: 'typescript' | 'javascript' | 'rust' | 'c_sharp') {
  if (!queryCache.has(id)) {
    queryCache.set(
      id,
      import(`./queries/${id}.scm?raw`).then((m: { default: string }) => m.default),
    );
  }
  return queryCache.get(id)!;
}

interface IndexerResult {
  entries: SymbolEntry[];
  processed: number;
  total: number;
  indexing: boolean;
}

export function useBackgroundIndexer(
  root: string | null,
  files: FileEntry[],
): IndexerResult {
  const [entries, setEntries] = useState<SymbolEntry[]>([]);
  const [processed, setProcessed] = useState(0);
  const [indexing, setIndexing] = useState(false);
  const rootRef = useRef<string | null>(null);

  useEffect(() => {
    rootRef.current = root;
    setEntries([]);
    setProcessed(0);
    if (!root || files.length === 0) {
      setIndexing(false);
      return;
    }
    const indexable = files.filter((f) => {
      const ext = f.rel_path.split('.').pop() ?? '';
      return languageForExtension(ext) !== null;
    });
    if (indexable.length === 0) {
      setIndexing(false);
      return;
    }
    setIndexing(true);

    let cancelled = false;
    (async () => {
      const { Parser, Query } = await loadTreeSitter();
      const collected: SymbolEntry[] = [];
      const byLang = new Map<string, FileEntry[]>();
      for (const f of indexable) {
        const lang = languageForExtension(f.rel_path.split('.').pop() ?? '')!;
        const list = byLang.get(lang) ?? [];
        list.push(f);
        byLang.set(lang, list);
      }

      for (const [langId, group] of byLang) {
        if (cancelled || rootRef.current !== root) return;
        const language = await loadLanguage(
          langId as 'typescript' | 'javascript' | 'rust' | 'c_sharp',
        );
        const queryText = await loadQuery(
          langId as 'typescript' | 'javascript' | 'rust' | 'c_sharp',
        );
        const parser = new Parser();
        let query: import('web-tree-sitter').Query | null = null;
        try {
          parser.setLanguage(language);
          query = new Query(language, queryText);

          for (const f of group) {
            if (cancelled || rootRef.current !== root) {
              return;
            }
            const abs = joinPath(root, f.rel_path);
            let content: string;
            try {
              content = await invoke<string>('read_text_file', { path: abs });
            } catch {
              if (!cancelled && rootRef.current === root) {
                setProcessed((p) => p + 1);
              }
              continue;
            }
            const tree = parser.parse(content);
            if (tree) {
              const captures = query.captures(tree.rootNode);
              for (const cap of captures) {
                if (cap.name === 'symbol.name') {
                  collected.push({
                    name: cap.node.text,
                    rel_path: f.rel_path,
                    line: cap.node.startPosition.row + 1,
                  });
                }
              }
              tree.delete();
            }
            if (!cancelled && rootRef.current === root) {
              setProcessed((p) => p + 1);
            }
            if (collected.length % 200 === 0) {
              setEntries([...collected]);
              await new Promise((resolve) => {
                if (typeof window.requestIdleCallback === 'function') {
                  window.requestIdleCallback(() => resolve(null), { timeout: 50 });
                } else {
                  window.setTimeout(() => resolve(null), 0);
                }
              });
            }
          }
        } finally {
          query?.delete();
          parser.delete();
        }
      }

      if (!cancelled && rootRef.current === root) {
        setEntries([...collected]);
        setIndexing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [root, files]);

  return { entries, processed, total: files.length, indexing };
}

function joinPath(root: string, rel: string): string {
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  const normRel = rel.replace(/\\/g, '/').replace(/^\//, '');
  return `${normRoot}/${normRel}`;
}
