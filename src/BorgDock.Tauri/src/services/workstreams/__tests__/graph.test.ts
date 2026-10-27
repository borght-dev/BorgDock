import { describe, expect, it } from 'vitest';
import { crossings, cyclicRelations, layeredLayout, wouldCycle } from '../graph';
import type { Relation } from '../types';

function blocks(id: string, from: string, to: string): Relation {
  return { id, kind: 'blocks', from, to, note: '' };
}

describe('wouldCycle', () => {
  const chain = [blocks('1', 'a', 'b'), blocks('2', 'b', 'c')];

  it('lets an edge through that closes nothing', () => {
    expect(wouldCycle(chain, 'blocks', 'a', 'c')).toBeNull();
  });

  it('names the path an edge would close', () => {
    expect(wouldCycle(chain, 'blocks', 'c', 'a')).toEqual(['c', 'a', 'b', 'c']);
  });

  it('refuses an edge to itself', () => {
    expect(wouldCycle([], 'blocks', 'a', 'a')).toEqual(['a', 'a']);
  });

  it('keeps blocks and supersedes apart', () => {
    expect(wouldCycle(chain, 'supersedes', 'c', 'a')).toBeNull();
  });
});

describe('cyclicRelations', () => {
  it('flags the relation that closes a cycle two machines built between them', () => {
    const merged = [blocks('1', 'a', 'b'), blocks('2', 'b', 'c'), blocks('3', 'c', 'a')];
    expect([...cyclicRelations(merged)]).toEqual(['3']);
  });

  it('flags nothing in a graph without cycles', () => {
    expect(cyclicRelations([blocks('1', 'a', 'b'), blocks('2', 'a', 'c')]).size).toBe(0);
  });
});

describe('layeredLayout', () => {
  it('puts every edge into a later layer', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'a', to: 'c' },
    ];
    const layout = layeredLayout(['c', 'b', 'a'], edges);
    for (const edge of edges) {
      expect(layout.nodes.get(edge.to)!.layer).toBeGreaterThan(layout.nodes.get(edge.from)!.layer);
    }
  });

  it('untangles crossings it can avoid', () => {
    // a→d, b→c drawn in input order crosses once; swapping one layer removes it.
    const edges = [
      { from: 'a', to: 'd' },
      { from: 'b', to: 'c' },
    ];
    const layout = layeredLayout(['a', 'b', 'c', 'd'], edges);
    expect(crossings(layout, edges)).toBe(0);
  });

  it('lays out 200 nodes with edges between them', () => {
    const nodes = Array.from({ length: 200 }, (_, i) => `n${i}`);
    const edges = nodes.slice(1).map((node, i) => ({ from: `n${Math.floor(i / 3)}`, to: node }));
    const layout = layeredLayout(nodes, edges);
    expect(layout.nodes.size).toBe(200);
    expect(crossings(layout, edges)).toBe(0);
  });

  it('survives a cycle and an empty graph', () => {
    expect(layeredLayout([], []).layers).toEqual([]);
    const layout = layeredLayout(
      ['a', 'b'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    );
    expect(layout.nodes.size).toBe(2);
  });
});
