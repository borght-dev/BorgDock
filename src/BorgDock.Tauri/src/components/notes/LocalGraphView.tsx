import { openReference } from '@/services/notes/chips';
import { type GraphNode, localGraph } from '@/services/notes/graph';
import { useNotesStore } from '@/stores/notes-store';

const RADIUS: Record<GraphNode['kind'], number> = {
  note: 5,
  pr: 4.5,
  ado: 4.5,
  t3: 4.5,
  workstream: 5,
};

function open(node: GraphNode) {
  const store = useNotesStore.getState();
  if (node.path) store.open(node.path);
  else if (node.token) void openReference(node.token, store.context);
}

/**
 * LocalGraphView — the open note and what lies within two links of it:
 * notes, pull requests, work items, threads and workstreams. Click a node to
 * open it.
 */
export function LocalGraphView({ path }: { path: string }) {
  const index = useNotesStore((s) => s.index);
  const context = useNotesStore((s) => s.context);
  const graph = localGraph(index, path, context);
  if (graph.nodes.length <= 1) {
    return <p className="bd-notes-side__empty">Link this note to see its neighbours.</p>;
  }
  const xs = graph.nodes.map((n) => n.x);
  const ys = graph.nodes.map((n) => n.y);
  const pad = 46;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) - minX + pad;
  const height = Math.max(...ys) - minY + pad;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return (
    <svg
      className="bd-notes-graph"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      role="img"
      aria-label={`Local graph: ${graph.nodes.length} notes and references`}
    >
      {graph.edges.map((edge) => {
        const a = byId.get(edge.from)!;
        const b = byId.get(edge.to)!;
        return (
          <line
            key={`${edge.from}|${edge.to}`}
            className="bd-notes-graph__edge"
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
          />
        );
      })}
      {graph.nodes.map((node) => (
        <g
          key={node.id}
          className="bd-notes-graph__node"
          data-kind={node.kind}
          data-center={node.depth === 0 || undefined}
          transform={`translate(${node.x} ${node.y})`}
          role="button"
          tabIndex={0}
          aria-label={`Open ${node.label}`}
          onClick={() => open(node)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open(node);
            }
          }}
        >
          {node.kind === 'workstream' ? (
            <rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" />
          ) : (
            <circle r={node.depth === 0 ? 7.5 : RADIUS[node.kind]} />
          )}
          <text y={node.depth === 0 ? 20 : 16} textAnchor="middle">
            {node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
