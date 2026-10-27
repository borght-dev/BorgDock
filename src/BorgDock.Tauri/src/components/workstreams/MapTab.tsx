import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';
import { Button, Dot, Pill } from '@/components/shared/primitives';
import { openOriginal } from '@/services/workstreams/actions';
import type { Assessment } from '@/services/workstreams/attention';
import { addRelation, removeRelation } from '@/services/workstreams/edits';
import { type LayoutEdge, layeredLayout } from '@/services/workstreams/graph';
import { decisionKey, outcomeKey } from '@/services/workstreams/identity';
import type { NodeKey, WorkstreamDocument } from '@/services/workstreams/types';
import { nodeLabel } from './labels';
import { RelationSheet } from './RelationSheet';
import { ATTENTION_DOT, FRESHNESS_DOT, wsEdit } from './ws-ui';

interface MapTabProps {
  document: WorkstreamDocument;
  assessment: Assessment | undefined;
  readOnly: boolean;
}

const NODE_W = 210;
const NODE_H = 58;
const GAP_X = 70;
const GAP_Y = 18;
const PAD = 16;

interface MapNode {
  key: NodeKey;
  kind: 'member' | 'outcome' | 'decision';
  label: string;
  sub: string;
  dot: Parameters<typeof Dot>[0]['tone'];
  superseded: boolean;
}

interface MapEdge extends LayoutEdge {
  id: string;
  kind: 'blocks' | 'supersedes' | 'option';
  cyclic: boolean;
}

function nodesOf(document: WorkstreamDocument, assessment: Assessment | undefined): MapNode[] {
  const members = document.members
    .filter((m) => m.role !== 'context')
    .map((m): MapNode => {
      const resolved = assessment?.members.get(m.key);
      return {
        key: m.key,
        kind: 'member',
        label: resolved?.identity ?? m.key,
        sub: resolved ? `${resolved.title} · ${resolved.stateLabel}` : m.label,
        dot: resolved ? FRESHNESS_DOT[resolved.freshness] : 'gray',
        superseded: m.role === 'superseded',
      };
    });
  const outcomes = (assessment?.outcomes ?? []).map(
    (status): MapNode => ({
      key: outcomeKey(status.outcome.id),
      kind: 'outcome',
      label: 'Outcome',
      sub: status.outcome.title,
      dot: status.counts ? 'green' : status.blockers.length > 0 ? 'yellow' : 'gray',
      superseded: false,
    }),
  );
  const decisions = document.decisions.map(
    (d): MapNode => ({
      key: decisionKey(d.id),
      kind: 'decision',
      label: d.status === 'open' ? 'Open decision' : 'Decided',
      sub: d.question,
      dot: d.status === 'open' ? ATTENTION_DOT.warn : 'green',
      superseded: false,
    }),
  );
  return [...decisions, ...members, ...outcomes];
}

function edgesOf(
  document: WorkstreamDocument,
  assessment: Assessment | undefined,
  keys: Set<NodeKey>,
): MapEdge[] {
  const edges: MapEdge[] = document.relations
    .filter((r) => keys.has(r.from) && keys.has(r.to))
    .map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      kind: r.kind,
      cyclic: assessment?.cyclic.has(r.id) ?? false,
    }));
  for (const decision of document.decisions) {
    for (const option of decision.options) {
      if (!keys.has(option)) continue;
      edges.push({
        id: `${decision.id}:${option}`,
        from: decisionKey(decision.id),
        to: option,
        kind: 'option',
        cyclic: false,
      });
    }
  }
  return edges;
}

/**
 * MapTab — the workstream as a graph: decisions, members and outcomes in
 * layers, with what blocks what. Drag from a node's handle onto another, or
 * select a node and press B, to say it blocks the other. Every action here
 * also works from the keyboard.
 */
export function MapTab({ document, assessment, readOnly }: MapTabProps) {
  const nodes = useMemo(() => nodesOf(document, assessment), [document, assessment]);
  const keys = useMemo(() => new Set(nodes.map((n) => n.key)), [nodes]);
  const edges = useMemo(() => edgesOf(document, assessment, keys), [document, assessment, keys]);
  // Nodes nothing points to or from sit in a grid under the graph, not in one long first column.
  const linked = useMemo(() => new Set(edges.flatMap((e) => [e.from, e.to])), [edges]);
  const layout = useMemo(
    () =>
      layeredLayout(
        nodes.filter((n) => linked.has(n.key)).map((n) => n.key),
        edges.filter((e) => !e.cyclic),
      ),
    [nodes, edges, linked],
  );
  const loose = nodes.filter((n) => !linked.has(n.key));
  const [selected, setSelected] = useState<NodeKey | null>(null);
  const [linkingFrom, setLinkingFrom] = useState<NodeKey | null>(null);
  const [drag, setDrag] = useState<{ from: NodeKey; x: number; y: number } | null>(null);
  const [relationFrom, setRelationFrom] = useState<NodeKey | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const graphHeight =
    layout.layers.length === 0
      ? 0
      : Math.max(...layout.layers.map((l) => l.length)) * (NODE_H + GAP_Y);
  const columns = Math.max(3, layout.layers.length);
  const looseTop = PAD + graphHeight + (graphHeight > 0 && loose.length > 0 ? GAP_Y * 2 : 0);
  const position = (key: NodeKey) => {
    const placed = layout.nodes.get(key);
    if (placed) {
      return { x: PAD + placed.layer * (NODE_W + GAP_X), y: PAD + placed.order * (NODE_H + GAP_Y) };
    }
    const index = Math.max(
      0,
      loose.findIndex((n) => n.key === key),
    );
    return {
      x: PAD + (index % columns) * (NODE_W + GAP_X),
      y: looseTop + Math.floor(index / columns) * (NODE_H + GAP_Y),
    };
  };
  const width = PAD * 2 + columns * (NODE_W + GAP_X) - GAP_X;
  const height =
    looseTop +
    Math.ceil(loose.length / columns) * (NODE_H + GAP_Y) -
    (loose.length > 0 ? GAP_Y : 0) +
    PAD;

  const link = (from: NodeKey, to: NodeKey) => {
    setLinkingFrom(null);
    if (from === to) return;
    wsEdit(document.id, (d, c) => addRelation(d, 'blocks', from, to, '', c));
  };

  const pick = (key: NodeKey) => {
    if (linkingFrom) link(linkingFrom, key);
    else setSelected(key === selected ? null : key);
  };

  const pointerAt = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const scroll = canvasRef.current;
    return {
      x: e.clientX - (rect?.left ?? 0) + (scroll?.scrollLeft ?? 0),
      y: e.clientY - (rect?.top ?? 0) + (scroll?.scrollTop ?? 0),
    };
  };

  const selectedNode = nodes.find((n) => n.key === selected);
  const relationsOfSelected = selected
    ? document.relations.filter((r) => r.from === selected || r.to === selected)
    : [];

  if (nodes.length === 0) {
    return (
      <div className="bd-wb-empty">
        <p>The map fills up once the workstream has records, outcomes or decisions.</p>
      </div>
    );
  }

  return (
    <div className="bd-ws-map">
      <div
        ref={canvasRef}
        className="bd-ws-map__canvas"
        role="application"
        aria-label="Workstream map"
        aria-roledescription="graph"
        onPointerMove={(e) => {
          if (drag) setDrag({ ...drag, ...pointerAt(e) });
        }}
        onPointerUp={() => setDrag(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && (linkingFrom || selected)) {
            e.preventDefault();
            e.stopPropagation();
            if (linkingFrom) setLinkingFrom(null);
            else setSelected(null);
          }
          if ((e.key === 'b' || e.key === 'B') && selected && !readOnly) {
            e.preventDefault();
            e.stopPropagation();
            setLinkingFrom(selected);
          }
        }}
      >
        <svg className="bd-ws-map__edges" width={width} height={height} aria-hidden="true">
          <defs>
            <marker
              id="bd-ws-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" className="bd-ws-map__arrow" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const a = position(edge.from);
            const b = position(edge.to);
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            const backwards = x2 <= x1;
            const d = backwards
              ? `M${a.x + NODE_W / 2},${a.y + NODE_H} C${a.x + NODE_W / 2},${a.y + NODE_H + 40} ${b.x + NODE_W / 2},${b.y + NODE_H + 40} ${b.x + NODE_W / 2},${b.y + NODE_H}`
              : `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
            return (
              <path
                key={edge.id}
                d={d}
                className={clsx(
                  'bd-ws-map__edge',
                  `bd-ws-map__edge--${edge.kind}`,
                  edge.cyclic && 'bd-ws-map__edge--cyclic',
                )}
                markerEnd={edge.kind === 'option' ? undefined : 'url(#bd-ws-arrow)'}
              />
            );
          })}
          {drag && (
            <line
              x1={position(drag.from).x + NODE_W}
              y1={position(drag.from).y + NODE_H / 2}
              x2={drag.x}
              y2={drag.y}
              className="bd-ws-map__edge bd-ws-map__edge--drag"
            />
          )}
        </svg>
        <div className="bd-ws-map__nodes" style={{ width, height }}>
          {nodes.map((node) => {
            const { x, y } = position(node.key);
            return (
              // style: each node sits where the layered layout put it
              <div
                key={node.key}
                className="bd-ws-map__node-wrap"
                style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
                onPointerUp={() => {
                  if (drag && drag.from !== node.key) link(drag.from, node.key);
                }}
              >
                <button
                  type="button"
                  className={clsx(
                    'bd-ws-map__node',
                    `bd-ws-map__node--${node.kind}`,
                    node.superseded && 'bd-ws-map__node--superseded',
                    selected === node.key && 'bd-ws-map__node--selected',
                    linkingFrom && linkingFrom !== node.key && 'bd-ws-map__node--target',
                  )}
                  aria-pressed={selected === node.key}
                  aria-label={`${nodeLabel(document, assessment, node.key)}${linkingFrom && linkingFrom !== node.key ? '. Press Enter: blocked by the selected node' : ''}`}
                  onClick={() => pick(node.key)}
                  onDoubleClick={() => {
                    const resolved = assessment?.members.get(node.key);
                    if (resolved) openOriginal(resolved);
                  }}
                >
                  <span className="bd-ws-map__node-head">
                    <Dot tone={node.dot} size={6} />
                    <span>{node.label}</span>
                  </span>
                  <span className="bd-ws-map__node-sub">{node.sub}</span>
                </button>
                {!readOnly && (
                  <span
                    className="bd-ws-map__handle"
                    title="Drag onto what this blocks"
                    aria-hidden="true"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      (e.target as Element).releasePointerCapture?.(e.pointerId);
                      setDrag({ from: node.key, ...pointerAt(e) });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <aside className="bd-ws-map__side" aria-label="Selected">
        {linkingFrom ? (
          <p className="bd-ws-muted" role="status">
            Pick what {nodeLabel(document, assessment, linkingFrom)} blocks. Esc cancels.
          </p>
        ) : selectedNode ? (
          <>
            <h3 className="bd-ws-panel__title">
              {nodeLabel(document, assessment, selectedNode.key)}
            </h3>
            <p className="bd-ws-muted">{selectedNode.sub}</p>
            {selectedNode.superseded && <Pill tone="ghost">Superseded</Pill>}
            {relationsOfSelected.length > 0 && (
              <ul className="bd-ws-map__relations">
                {relationsOfSelected.map((relation) => (
                  <li key={relation.id}>
                    <span>
                      {relation.from === selected
                        ? `${relation.kind === 'blocks' ? 'Blocks' : 'Supersedes'} ${nodeLabel(document, assessment, relation.to)}`
                        : `${relation.kind === 'blocks' ? 'Blocked by' : 'Superseded by'} ${nodeLabel(document, assessment, relation.from)}`}
                      {assessment?.cyclic.has(relation.id) && ' (makes a circle)'}
                    </span>
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          wsEdit(document.id, (d, c) => removeRelation(d, relation.id, c))
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && (
              <div className="bd-ws-panel__actions">
                <Button
                  variant="secondary"
                  size="sm"
                  aria-keyshortcuts="B"
                  onClick={() => setLinkingFrom(selectedNode.key)}
                >
                  Blocks…
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRelationFrom(selectedNode.key)}>
                  Add a relation…
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="bd-ws-muted">
            Select a node to see its relations. Drag from a node's handle onto another, or select
            one and press B, to say it blocks the other.
          </p>
        )}
        <dl className="bd-ws-map__legend">
          <div>
            <dt className="bd-ws-map__key bd-ws-map__key--blocks" />
            <dd>blocks</dd>
          </div>
          <div>
            <dt className="bd-ws-map__key bd-ws-map__key--supersedes" />
            <dd>supersedes</dd>
          </div>
          <div>
            <dt className="bd-ws-map__key bd-ws-map__key--option" />
            <dd>alternative in a decision</dd>
          </div>
        </dl>
      </aside>
      {relationFrom && (
        <RelationSheet
          document={document}
          assessment={assessment}
          preset={{ from: relationFrom }}
          onClose={() => setRelationFrom(null)}
        />
      )}
    </div>
  );
}
