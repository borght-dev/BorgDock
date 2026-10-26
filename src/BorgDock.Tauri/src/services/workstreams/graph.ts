import type { NodeKey, Relation, RelationKind } from './types';

/**
 * The relations of a workstream as graphs. `blocks` and `supersedes` must
 * each stay acyclic: "A blocks B blocks A" never resolves.
 */

function adjacency(relations: readonly Relation[], kind: RelationKind): Map<NodeKey, NodeKey[]> {
  const next = new Map<NodeKey, NodeKey[]>();
  for (const relation of relations) {
    if (relation.kind !== kind) continue;
    next.set(relation.from, [...(next.get(relation.from) ?? []), relation.to]);
  }
  return next;
}

/** The nodes from `from` to `to` along the edges, both included, or `null`. */
function pathBetween(
  next: ReadonlyMap<NodeKey, NodeKey[]>,
  from: NodeKey,
  to: NodeKey,
): NodeKey[] | null {
  const cameFrom = new Map<NodeKey, NodeKey | null>([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === to) {
      const path: NodeKey[] = [];
      for (let at: NodeKey | null = node; at !== null; at = cameFrom.get(at) ?? null)
        path.unshift(at);
      return path;
    }
    for (const target of next.get(node) ?? []) {
      if (cameFrom.has(target)) continue;
      cameFrom.set(target, node);
      queue.push(target);
    }
  }
  return null;
}

/**
 * The cycle an edge `from → to` would close, as the nodes around it
 * (`[from, to, …, from]`), or `null` when the edge is safe.
 */
export function wouldCycle(
  relations: readonly Relation[],
  kind: RelationKind,
  from: NodeKey,
  to: NodeKey,
): NodeKey[] | null {
  if (from === to) return [from, from];
  const back = pathBetween(adjacency(relations, kind), to, from);
  return back ? [from, ...back] : null;
}

/**
 * The relations that close a cycle, in a document that came in with one (two
 * machines each added half of it). Relations are taken in order; the one that
 * closes a cycle is flagged, so every machine flags the same one.
 */
export function cyclicRelations(relations: readonly Relation[]): Set<string> {
  const flagged = new Set<string>();
  const accepted: Relation[] = [];
  for (const relation of relations) {
    if (wouldCycle(accepted, relation.kind, relation.from, relation.to)) {
      flagged.add(relation.id);
      continue;
    }
    accepted.push(relation);
  }
  return flagged;
}

// ── Layout ──────────────────────────────────────────────────

export interface LayoutEdge {
  from: NodeKey;
  to: NodeKey;
}

export interface LayoutNode {
  key: NodeKey;
  layer: number;
  /** Position within the layer, from the top. */
  order: number;
}

export interface Layout {
  nodes: Map<NodeKey, LayoutNode>;
  layers: NodeKey[][];
}

/** Longest path from a source: every edge points to a later layer. */
function layersOf(nodes: readonly NodeKey[], edges: readonly LayoutEdge[]): Map<NodeKey, number> {
  const incoming = new Map<NodeKey, NodeKey[]>(nodes.map((node) => [node, []]));
  for (const edge of edges) incoming.get(edge.to)?.push(edge.from);
  const layer = new Map<NodeKey, number>();
  const visiting = new Set<NodeKey>();
  const depth = (node: NodeKey): number => {
    const known = layer.get(node);
    if (known !== undefined) return known;
    if (visiting.has(node)) return 0;
    visiting.add(node);
    const parents = incoming.get(node) ?? [];
    const value = parents.length === 0 ? 0 : Math.max(...parents.map(depth)) + 1;
    visiting.delete(node);
    layer.set(node, value);
    return value;
  };
  for (const node of nodes) depth(node);
  return layer;
}

/** Edges between neighbouring layers that cross each other. */
export function crossings(layout: Layout, edges: readonly LayoutEdge[]): number {
  let count = 0;
  const spans = edges
    .map((edge) => ({ from: layout.nodes.get(edge.from), to: layout.nodes.get(edge.to) }))
    .filter(
      (span): span is { from: LayoutNode; to: LayoutNode } =>
        !!span.from && !!span.to && span.to.layer === span.from.layer + 1,
    );
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!;
      const b = spans[j]!;
      if (a.from.layer !== b.from.layer) continue;
      if ((a.from.order - b.from.order) * (a.to.order - b.to.order) < 0) count++;
    }
  }
  return count;
}

const SWEEPS = 6;

/**
 * Layered layout for the map: longest-path layers, then nodes ordered within
 * each layer by the mean position of their neighbours, sweeping down and up.
 * Workstreams are small, so this beats pulling in a layout library.
 */
export function layeredLayout(nodes: readonly NodeKey[], edges: readonly LayoutEdge[]): Layout {
  const known = new Set(nodes);
  const usable = edges.filter(
    (edge) => known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to,
  );
  const layerOf = layersOf(nodes, usable);
  const layerCount = Math.max(0, ...layerOf.values()) + 1;
  const layers: NodeKey[][] = Array.from({ length: nodes.length === 0 ? 0 : layerCount }, () => []);
  for (const node of nodes) layers[layerOf.get(node) ?? 0]!.push(node);

  const parents = new Map<NodeKey, NodeKey[]>();
  const children = new Map<NodeKey, NodeKey[]>();
  for (const edge of usable) {
    parents.set(edge.to, [...(parents.get(edge.to) ?? []), edge.from]);
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  }
  const position = new Map<NodeKey, number>();
  const index = () => {
    for (const layer of layers) {
      layer.forEach((node, i) => {
        position.set(node, i);
      });
    }
  };
  index();
  const reorder = (layer: NodeKey[], neighbours: Map<NodeKey, NodeKey[]>) => {
    const weight = new Map(
      layer.map((node, i) => {
        const near = (neighbours.get(node) ?? []).map((n) => position.get(n) ?? 0);
        return [node, near.length ? near.reduce((a, b) => a + b, 0) / near.length : i] as const;
      }),
    );
    layer.sort((a, b) => weight.get(a)! - weight.get(b)! || nodes.indexOf(a) - nodes.indexOf(b));
    layer.forEach((node, i) => {
      position.set(node, i);
    });
  };

  let best = layers.map((layer) => [...layer]);
  const score = (candidate: NodeKey[][]) => crossings(toLayout(candidate), usable);
  let bestScore = score(best);
  for (let sweep = 0; sweep < SWEEPS && bestScore > 0; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const layer of order) reorder(layer, down ? parents : children);
    const current = score(layers);
    if (current < bestScore) {
      best = layers.map((layer) => [...layer]);
      bestScore = current;
    }
  }
  return toLayout(best);
}

function toLayout(layers: NodeKey[][]): Layout {
  const placed = new Map<NodeKey, LayoutNode>();
  layers.forEach((layer, layerIndex) => {
    layer.forEach((key, order) => {
      placed.set(key, { key, layer: layerIndex, order });
    });
  });
  return { nodes: placed, layers };
}
