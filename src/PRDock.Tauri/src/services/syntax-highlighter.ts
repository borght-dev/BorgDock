import type { HighlightCategory, HighlightSpan } from '@/types';

type TSParser = import('web-tree-sitter').Parser;
type TSLanguage = import('web-tree-sitter').Language;
type TSNode = import('web-tree-sitter').Node;

let ParserClass: typeof import('web-tree-sitter')['Parser'] | null = null;
let LanguageClass: typeof import('web-tree-sitter')['Language'] | null = null;
let initPromise: Promise<boolean> | null = null;
const languageCache = new Map<string, TSLanguage | null>();
const grammarLoadPromises = new Map<string, Promise<TSLanguage | null>>();

const EXT_TO_GRAMMAR: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  jsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  rs: 'rust',
  cs: 'c_sharp',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  css: 'css',
  scss: 'css',
  html: 'html',
  toml: 'toml',
};

const NODE_TYPE_CATEGORIES: Record<string, HighlightCategory> = {
  // Keywords
  if: 'keyword',
  else: 'keyword',
  for: 'keyword',
  while: 'keyword',
  return: 'keyword',
  import: 'keyword',
  export: 'keyword',
  function: 'keyword',
  class: 'keyword',
  'new': 'keyword',
  const: 'keyword',
  let: 'keyword',
  var: 'keyword',
  async: 'keyword',
  await: 'keyword',
  yield: 'keyword',
  try: 'keyword',
  catch: 'keyword',
  finally: 'keyword',
  throw: 'keyword',
  switch: 'keyword',
  case: 'keyword',
  break: 'keyword',
  continue: 'keyword',
  typeof: 'keyword',
  instanceof: 'keyword',
  in: 'keyword',
  of: 'keyword',
  as: 'keyword',
  extends: 'keyword',
  implements: 'keyword',
  interface: 'keyword',
  type: 'keyword',
  enum: 'keyword',
  namespace: 'keyword',
  default: 'keyword',
  from: 'keyword',
  with: 'keyword',
  do: 'keyword',
  void: 'keyword',
  delete: 'keyword',
  static: 'keyword',
  abstract: 'keyword',
  declare: 'keyword',
  readonly: 'keyword',
  override: 'keyword',
  // Rust keywords
  pub: 'keyword',
  fn: 'keyword',
  use: 'keyword',
  mod: 'keyword',
  struct: 'keyword',
  impl: 'keyword',
  trait: 'keyword',
  match: 'keyword',
  mut: 'keyword',
  ref: 'keyword',
  self: 'keyword',
  crate: 'keyword',
  extern: 'keyword',
  where: 'keyword',
  loop: 'keyword',
  move: 'keyword',
  unsafe: 'keyword',
  dyn: 'keyword',
  macro_rules: 'keyword',

  // Strings
  string: 'string',
  string_literal: 'string',
  string_fragment: 'string',
  string_content: 'string',
  template_string: 'string',
  template_literal: 'string',
  raw_string_literal: 'string',
  char_literal: 'string',
  regex: 'string',
  regex_pattern: 'string',

  // Comments
  comment: 'comment',
  line_comment: 'comment',
  block_comment: 'comment',
  doc_comment: 'comment',

  // Numbers
  number: 'number',
  integer_literal: 'number',
  float_literal: 'number',
  number_literal: 'number',

  // Types
  type_identifier: 'type',
  predefined_type: 'type',
  primitive_type: 'type',

  // Constants
  true: 'constant',
  false: 'constant',
  null: 'constant',
  undefined: 'constant',
  none: 'constant',

  // Properties
  property_identifier: 'property',
  shorthand_property_identifier: 'property',
  field_identifier: 'property',

  // Tags (JSX/HTML)
  tag_name: 'tag',

  // Attributes
  attribute_name: 'attribute',
};

async function initTreeSitter(): Promise<boolean> {
  if (ParserClass && LanguageClass) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // web-tree-sitter ≥0.25 exports `Parser` and `Language` as separate named
      // classes — there is no default export, and `Language` is NOT a static
      // member of `Parser` (as it was in ≤0.20). Older code that did
      // `Parser.Language.load(...)` silently returned `undefined` and the whole
      // highlighter became a no-op.
      const mod = (await import('web-tree-sitter')) as unknown as {
        Parser: typeof import('web-tree-sitter')['Parser'];
        Language: typeof import('web-tree-sitter')['Language'];
      };
      const { Parser, Language } = mod;

      if (!Parser || typeof (Parser as unknown as { init?: unknown }).init !== 'function') {
        throw new Error('web-tree-sitter: Parser.init not found on module export');
      }
      if (!Language || typeof (Language as unknown as { load?: unknown }).load !== 'function') {
        throw new Error('web-tree-sitter: Language.load not found on module export');
      }

      await (Parser as unknown as { init: (opts?: object) => Promise<void> }).init({
        locateFile: () => '/web-tree-sitter.wasm',
      });
      ParserClass = Parser;
      LanguageClass = Language;
      return true;
    } catch (err) {
      console.warn('[syntax-highlighter] tree-sitter init failed:', err);
      initPromise = null;
      return false;
    }
  })();

  return initPromise;
}

async function loadLanguage(grammarName: string): Promise<TSLanguage | null> {
  if (languageCache.has(grammarName)) return languageCache.get(grammarName)!;

  const existing = grammarLoadPromises.get(grammarName);
  if (existing) return existing;

  const promise = (async (): Promise<TSLanguage | null> => {
    try {
      const ok = await initTreeSitter();
      if (!ok || !LanguageClass) return null;

      const wasmPath = `/grammars/tree-sitter-${grammarName}.wasm`;
      const L = LanguageClass as unknown as {
        load: (path: string) => Promise<TSLanguage>;
      };
      const lang = await L.load(wasmPath);
      languageCache.set(grammarName, lang);
      return lang;
    } catch (err) {
      console.warn(`[syntax-highlighter] grammar load failed for ${grammarName}:`, err);
      languageCache.set(grammarName, null);
      return null;
    }
  })();

  grammarLoadPromises.set(grammarName, promise);
  return promise;
}

function getGrammarName(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  return EXT_TO_GRAMMAR[ext] ?? null;
}

function walkTree(node: TSNode, spans: HighlightSpan[], row: number): void {
  if (node.startPosition.row > row || node.endPosition.row < row) return;

  const category = NODE_TYPE_CATEGORIES[node.type];
  if (category && node.childCount === 0) {
    const startCol = node.startPosition.row === row ? node.startPosition.column : 0;
    const endCol = node.endPosition.row === row ? node.endPosition.column : Infinity;
    spans.push({ start: startCol, end: endCol, category });
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walkTree(child, spans, row);
  }
}

export async function highlightLines(
  filename: string,
  lines: string[],
): Promise<Map<number, HighlightSpan[]> | null> {
  const grammarName = getGrammarName(filename);
  if (!grammarName) return null;

  const lang = await loadLanguage(grammarName);
  if (!lang || !ParserClass) return null;

  try {
    const P = ParserClass as unknown as new () => TSParser;
    const parser = new P();
    parser.setLanguage(lang);
    const source = lines.join('\n');
    const tree = parser.parse(source);
    if (!tree) {
      parser.delete();
      return null;
    }
    const result = new Map<number, HighlightSpan[]>();

    for (let row = 0; row < lines.length; row++) {
      const spans: HighlightSpan[] = [];
      walkTree(tree.rootNode, spans, row);
      if (spans.length > 0) {
        spans.sort((a, b) => a.start - b.start);
        result.set(row, spans);
      }
    }

    tree.delete();
    parser.delete();
    return result;
  } catch (err) {
    console.warn(`[syntax-highlighter] parse failed for ${filename}:`, err);
    return null;
  }
}

export function getHighlightClass(category: HighlightCategory): string {
  return `--color-syntax-${category}`;
}
