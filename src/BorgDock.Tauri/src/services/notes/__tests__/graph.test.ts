import { describe, expect, it } from 'vitest';
import { localGraph } from '../graph';
import { parseNote } from '../parse';
import { buildIndex, type RefContext } from '../vault-index';

const context: RefContext = {
  adoOrganization: 'acme',
  adoProject: 'FSP',
  repos: [{ owner: 'acme', name: 'planner' }],
};

const vault = buildIndex(
  [
    parseNote('Plan.md', 'Links [[Spec]] and planner#1412'),
    parseNote('Spec.md', 'Deep [[Detail]]'),
    parseNote('Detail.md', 'Too far [[Far]]'),
    parseNote('Far.md', ''),
    parseNote('Daily.md', 'Also about planner#1412'),
    parseNote('Alone.md', 'nothing'),
  ],
  context,
);

describe('localGraph', () => {
  it('holds the note and what lies within two links, and nothing further', () => {
    const graph = localGraph(vault, 'Plan.md', context);
    const ids = graph.nodes.map((n) => n.id).sort();
    expect(ids).toEqual([
      'note:Daily.md',
      'note:Detail.md',
      'note:Plan.md',
      'note:Spec.md',
      'ref:gh:github.com/acme/planner#1412',
    ]);
    expect(graph.nodes.find((n) => n.id === 'note:Plan.md')).toMatchObject({
      depth: 0,
      x: 0,
      y: 0,
    });
    expect(graph.edges).toHaveLength(4);
  });

  it('labels references and keeps the layout deterministic', () => {
    const first = localGraph(vault, 'Plan.md', context);
    const second = localGraph(vault, 'Plan.md', context);
    expect(first).toEqual(second);
    expect(first.nodes.find((n) => n.kind === 'pr')?.label).toBe('planner#1412');
  });

  it('caps the number of nodes and handles a lone note', () => {
    expect(localGraph(vault, 'Plan.md', context, 2, 2).nodes).toHaveLength(2);
    expect(localGraph(vault, 'Alone.md', context).nodes).toHaveLength(1);
    expect(localGraph(vault, 'Missing.md', context).nodes).toHaveLength(0);
  });
});
