/**
 * The local graph of a note: the note, the notes and references within two
 * links of it, and where to draw each. Pure and deterministic, so the same
 * vault always draws the same picture.
 */
import { isRefToken, type RefToken } from './parse';
import { keyOfToken, type RefContext, resolveLink, type VaultIndex } from './vault-index';

export type GraphNodeKind = 'note' | 'pr' | 'ado' | 't3' | 'workstream';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** The note's path, for note nodes. */
  path: string | null;
  /** The reference, for the others. */
  token: RefToken | null;
  depth: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface LocalGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const noteId = (path: string) => `note:${path}`;

function tokenLabel(token: RefToken) {
  switch (token.kind) {
    case 'pr':
      return `${token.owner ? `${token.owner}/` : ''}${token.repo}#${token.number}`;
    case 'ado':
      return `AB#${token.id}`;
    case 't3':
    case 'workstream':
      return token.label || token.kind;
  }
}

/** Neighbours of one node: a note's links, backlinks and references; a reference's notes. */
function neighbours(
  id: string,
  index: VaultIndex,
  context: RefContext,
  refTokens: Map<string, GraphNode['token']>,
): string[] {
  if (id.startsWith('note:')) {
    const path = id.slice(5);
    const note = index.notes.get(path);
    const out = new Set<string>();
    for (const token of note?.tokens ?? []) {
      if (token.kind === 'wikilink') {
        const target = resolveLink(index, token.target);
        if (target && target !== path) out.add(noteId(target));
      } else if (isRefToken(token) && !(token.kind === 'pr' && token.url)) {
        const key = keyOfToken(token, context);
        if (key) {
          out.add(`ref:${key}`);
          if (!refTokens.has(key)) refTokens.set(key, token);
        }
      }
    }
    for (const mention of index.backlinks.get(path) ?? []) out.add(noteId(mention.path));
    return [...out];
  }
  const key = id.slice(4);
  return (index.mentions.get(key) ?? []).map((m) => noteId(m.path));
}

/** The note at `path` and everything within `depth` links, at most `limit` nodes. */
export function localGraph(
  index: VaultIndex,
  path: string,
  context: RefContext,
  depth = 2,
  limit = 40,
): LocalGraph {
  if (!index.notes.has(path)) return { nodes: [], edges: [] };
  const refTokens = new Map<string, GraphNode['token']>();
  const depthOf = new Map<string, number>([[noteId(path), 0]]);
  const edges = new Map<string, GraphEdge>();
  let frontier = [noteId(path)];
  for (let level = 1; level <= depth && frontier.length; level++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const other of neighbours(id, index, context, refTokens)) {
        const edgeKey = [id, other].sort().join('|');
        if (!depthOf.has(other)) {
          if (depthOf.size >= limit) continue;
          depthOf.set(other, level);
          next.push(other);
        }
        if (!edges.has(edgeKey)) edges.set(edgeKey, { from: id, to: other });
      }
    }
    frontier = next;
  }

  const nodes: GraphNode[] = [...depthOf.entries()].map(([id, d]) => {
    if (id.startsWith('note:')) {
      const notePath = id.slice(5);
      return {
        id,
        kind: 'note',
        label: index.notes.get(notePath)?.title ?? notePath,
        path: notePath,
        token: null,
        depth: d,
        x: 0,
        y: 0,
      };
    }
    const token = refTokens.get(id.slice(4)) ?? null;
    return {
      id,
      kind: (token?.kind ?? 'pr') as GraphNodeKind,
      label: token ? tokenLabel(token) : id.slice(4),
      path: null,
      token,
      depth: d,
      x: 0,
      y: 0,
    };
  });
  layout(nodes, [...edges.values()]);
  return { nodes, edges: [...edges.values()] };
}

/**
 * A small force layout: rings by depth to start, then springs along edges
 * and repulsion between nodes. The open note stays at the centre.
 */
function layout(nodes: GraphNode[], edges: GraphEdge[]) {
  const byDepth = new Map<number, GraphNode[]>();
  for (const node of nodes) byDepth.set(node.depth, [...(byDepth.get(node.depth) ?? []), node]);
  for (const [d, ring] of byDepth) {
    ring.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / ring.length + d * 0.6;
      node.x = d === 0 ? 0 : Math.cos(angle) * 110 * d;
      node.y = d === 0 ? 0 : Math.sin(angle) * 110 * d;
    });
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (let step = 0; step < 160; step++) {
    const cooling = 1 - step / 180;
    const force = new Map(nodes.map((n) => [n.id, { x: 0, y: 0 }]));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = a.x - b.x || 0.01;
        const dy = a.y - b.y || 0.01;
        const dist2 = Math.max(dx * dx + dy * dy, 25);
        const push = 2600 / dist2;
        const dist = Math.sqrt(dist2);
        force.get(a.id)!.x += (dx / dist) * push;
        force.get(a.id)!.y += (dy / dist) * push;
        force.get(b.id)!.x -= (dx / dist) * push;
        force.get(b.id)!.y -= (dy / dist) * push;
      }
    }
    for (const edge of edges) {
      const a = byId.get(edge.from)!;
      const b = byId.get(edge.to)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = (dist - 90) * 0.04;
      force.get(a.id)!.x += (dx / dist) * pull;
      force.get(a.id)!.y += (dy / dist) * pull;
      force.get(b.id)!.x -= (dx / dist) * pull;
      force.get(b.id)!.y -= (dy / dist) * pull;
    }
    for (const node of nodes) {
      if (node.depth === 0) continue;
      const f = force.get(node.id)!;
      node.x += Math.max(-12, Math.min(12, f.x)) * cooling;
      node.y += Math.max(-12, Math.min(12, f.y)) * cooling;
    }
  }
}
