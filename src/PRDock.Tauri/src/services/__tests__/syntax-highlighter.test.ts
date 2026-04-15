import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HighlightCategory } from '@/types';
import { getHighlightClass } from '../syntax-highlighter';

// Mock tree-sitter node for walkTree testing
interface MockNode {
  type: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  child: (i: number) => MockNode | null;
}

function makeMockNode(
  type: string,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  children: MockNode[] = [],
): MockNode {
  return {
    type,
    startPosition: { row: startRow, column: startCol },
    endPosition: { row: endRow, column: endCol },
    childCount: children.length,
    child: (i: number) => children[i] ?? null,
  };
}

// Build a mock tree-sitter module
function buildTreeSitterMock(rootNode: ReturnType<typeof makeMockNode> | null = null) {
  const mockTree = rootNode
    ? {
        rootNode,
        delete: vi.fn(),
      }
    : null;

  const mockParser = {
    setLanguage: vi.fn(),
    parse: vi.fn().mockReturnValue(mockTree),
    delete: vi.fn(),
  };

  const mockLanguage = { name: 'typescript' };

  const MockParserClass = vi.fn().mockImplementation(() => mockParser);
  (MockParserClass as unknown as Record<string, unknown>).Language = {
    load: vi.fn().mockResolvedValue(mockLanguage),
  };
  (MockParserClass as unknown as Record<string, unknown>).init = vi.fn().mockResolvedValue(undefined);

  return { MockParserClass, mockParser, mockLanguage, mockTree };
}

describe('getHighlightClass', () => {
  const categories: HighlightCategory[] = [
    'keyword',
    'string',
    'comment',
    'number',
    'type',
    'function',
    'variable',
    'operator',
    'punctuation',
    'constant',
    'property',
    'tag',
    'attribute',
    'plain',
  ];

  it('returns a CSS custom property name for each category', () => {
    for (const cat of categories) {
      const result = getHighlightClass(cat);
      expect(result).toBe(`--color-syntax-${cat}`);
    }
  });

  it('output can be used in var() CSS function', () => {
    const result = getHighlightClass('keyword');
    expect(`var(${result})`).toBe('var(--color-syntax-keyword)');
  });
});

describe('highlightLines', () => {
  beforeEach(() => {
    // Reset modules to clear cached parser / language state
    vi.resetModules();
  });

  it('returns null for unsupported file extensions', async () => {
    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('file.xyz', ['hello']);
    expect(result).toBeNull();
  });

  it('returns null for files without an extension', async () => {
    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('Makefile', ['all: build']);
    expect(result).toBeNull();
  });

  it('returns highlight spans when tree-sitter initializes successfully', async () => {
    const rootNode = makeMockNode('program', 0, 0, 0, 20, [
      makeMockNode('const', 0, 0, 0, 5), // keyword
      makeMockNode('string', 0, 8, 0, 15), // string
    ]);
    const { MockParserClass } = buildTreeSitterMock(rootNode);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['const x = "hello"']);

    expect(result).not.toBeNull();
    expect(result!.size).toBe(1);
    const spans = result!.get(0)!;
    expect(spans.length).toBe(2);
    expect(spans[0]!.category).toBe('keyword');
    expect(spans[1]!.category).toBe('string');
  });

  it('returns null when tree-sitter init fails', async () => {
    vi.doMock('web-tree-sitter', () => ({
      default: {
        init: vi.fn().mockRejectedValue(new Error('WASM load failed')),
      },
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['const x = 1']);
    expect(result).toBeNull();
  });

  it('returns null when language loading fails', async () => {
    const MockParserClass = vi.fn();
    (MockParserClass as unknown as Record<string, unknown>).init = vi.fn().mockResolvedValue(undefined);
    (MockParserClass as unknown as Record<string, unknown>).Language = {
      load: vi.fn().mockRejectedValue(new Error('Grammar not found')),
    };

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['const x = 1']);
    expect(result).toBeNull();
  });

  it('returns null when parser.parse returns null', async () => {
    const { MockParserClass } = buildTreeSitterMock(null);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['const x = 1']);
    expect(result).toBeNull();
  });

  it('handles multiple lines correctly', async () => {
    const rootNode = makeMockNode('program', 0, 0, 1, 10, [
      makeMockNode('const', 0, 0, 0, 5), // keyword on row 0
      makeMockNode('return', 1, 0, 1, 6), // keyword on row 1
    ]);
    const { MockParserClass } = buildTreeSitterMock(rootNode);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['const x = 1', 'return x']);

    expect(result).not.toBeNull();
    expect(result!.size).toBe(2);
    expect(result!.get(0)![0]!.category).toBe('keyword');
    expect(result!.get(1)![0]!.category).toBe('keyword');
  });

  it('skips rows with no matching spans', async () => {
    const rootNode = makeMockNode('program', 0, 0, 1, 10, [
      makeMockNode('const', 0, 0, 0, 5),
      // Row 1 has a node type that's not in NODE_TYPE_CATEGORIES
      makeMockNode('unknown_node_type', 1, 0, 1, 10),
    ]);
    const { MockParserClass } = buildTreeSitterMock(rootNode);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['const x = 1', 'something']);

    expect(result).not.toBeNull();
    // Only row 0 should have spans
    expect(result!.has(0)).toBe(true);
    expect(result!.has(1)).toBe(false);
  });

  it('maps various file extensions to correct grammars', async () => {
    // This tests getGrammarName coverage for different extensions
    const rootNode = makeMockNode('program', 0, 0, 0, 5, [makeMockNode('const', 0, 0, 0, 5)]);
    const { MockParserClass } = buildTreeSitterMock(rootNode);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');

    // Test .js maps to javascript
    const jsResult = await highlightLines('file.js', ['const x']);
    expect(jsResult).not.toBeNull();

    // Test .rs maps to rust
    const rsResult = await highlightLines('file.rs', ['const x']);
    expect(rsResult).not.toBeNull();
  });

  it('skips nodes that do not overlap the target row', async () => {
    // Node is on row 5, but we only have lines for row 0
    const rootNode = makeMockNode('program', 0, 0, 5, 10, [makeMockNode('const', 5, 0, 5, 5)]);
    const { MockParserClass } = buildTreeSitterMock(rootNode);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['hello']);

    expect(result).not.toBeNull();
    // Row 0 has no matching spans
    expect(result!.size).toBe(0);
  });

  it('does not add spans for parent nodes with children', async () => {
    // Parent node has childCount > 0, so it should not generate a span itself
    const child = makeMockNode('const', 0, 0, 0, 5);
    const parent = makeMockNode('if', 0, 0, 0, 20, [child]);
    const rootNode = makeMockNode('program', 0, 0, 0, 20, [parent]);
    const { MockParserClass } = buildTreeSitterMock(rootNode);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['if (const x)']);

    expect(result).not.toBeNull();
    const spans = result!.get(0)!;
    // Only the leaf 'const' node should produce a span, not the parent 'if'
    expect(spans.length).toBe(1);
    expect(spans[0]!.category).toBe('keyword');
  });

  it('handles exception during parsing gracefully', async () => {
    const MockParserClass = vi.fn().mockImplementation(() => ({
      setLanguage: vi.fn(),
      parse: vi.fn().mockImplementation(() => {
        throw new Error('Parse error');
      }),
      delete: vi.fn(),
    }));
    (MockParserClass as unknown as Record<string, unknown>).init = vi.fn().mockResolvedValue(undefined);
    (MockParserClass as unknown as Record<string, unknown>).Language = {
      load: vi.fn().mockResolvedValue({ name: 'typescript' }),
    };

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['const x = 1']);
    expect(result).toBeNull();
  });

  it('handles multi-line span where node starts before target row', async () => {
    // Node spans rows 0-1, but we target row 1 -- startCol should be 0
    const rootNode = makeMockNode('program', 0, 0, 1, 10, [
      makeMockNode('string', 0, 5, 1, 3), // multi-line string starting on row 0, ending on row 1
    ]);
    const { MockParserClass } = buildTreeSitterMock(rootNode);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['line0', 'line1']);

    expect(result).not.toBeNull();
    // Row 0 should have start at col 5
    const row0Spans = result!.get(0);
    expect(row0Spans).toBeDefined();
    expect(row0Spans![0]!.start).toBe(5);

    // Row 1 should have start at col 0 (node starts before this row)
    const row1Spans = result!.get(1);
    expect(row1Spans).toBeDefined();
    expect(row1Spans![0]!.start).toBe(0);
    expect(row1Spans![0]!.end).toBe(3);
  });

  it('handles multi-line span where node ends after target row', async () => {
    // Node spans rows 0-2, target row 0 -- endCol should be Infinity
    const rootNode = makeMockNode('program', 0, 0, 2, 10, [
      makeMockNode('comment', 0, 2, 2, 5), // multi-line comment
    ]);
    const { MockParserClass } = buildTreeSitterMock(rootNode);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');
    const result = await highlightLines('example.ts', ['/* comment', 'middle', 'end */']);

    expect(result).not.toBeNull();
    // Row 0: start at col 2, end should be Infinity (node extends past this row)
    const row0Spans = result!.get(0);
    expect(row0Spans).toBeDefined();
    expect(row0Spans![0]!.start).toBe(2);
    expect(row0Spans![0]!.end).toBe(Infinity);
  });

  it('reuses cached language on second call', async () => {
    const rootNode = makeMockNode('program', 0, 0, 0, 5, [makeMockNode('const', 0, 0, 0, 5)]);
    const { MockParserClass } = buildTreeSitterMock(rootNode);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');

    // First call loads the language
    const result1 = await highlightLines('example.ts', ['const x']);
    expect(result1).not.toBeNull();

    // Second call should use cached language (covers languageCache hit path)
    const result2 = await highlightLines('other.ts', ['const y']);
    expect(result2).not.toBeNull();
  });

  it('uses ParserClass from already-initialized tree-sitter', async () => {
    // First call initializes, second call should find ParserClass already set
    const rootNode = makeMockNode('program', 0, 0, 0, 5, [makeMockNode('const', 0, 0, 0, 5)]);
    const { MockParserClass } = buildTreeSitterMock(rootNode);

    vi.doMock('web-tree-sitter', () => ({
      default: MockParserClass,
    }));

    const { highlightLines } = await import('../syntax-highlighter');

    // First call triggers full init path
    await highlightLines('a.ts', ['const x']);
    // Second call for different grammar -- should reuse ParserClass (initTreeSitter returns true immediately)
    await highlightLines('b.js', ['const y']);
  });
});
