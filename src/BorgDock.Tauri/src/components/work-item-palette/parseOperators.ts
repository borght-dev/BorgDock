// src/components/work-item-palette/parseOperators.ts
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

export type OperatorKind = 'state' | 'type' | 'assignee' | 'iter' | 'mention' | 'unknown';

export interface ParsedOperator {
  kind: OperatorKind;
  value: string;
}

export interface ParsedQuery {
  ops: ParsedOperator[];
  freeText: string;
}

const OP_RE = /(\w+):(\S+)|@(\w+)/g;

export function parseOperators(query: string): ParsedQuery {
  const ops: ParsedOperator[] = [];
  let m: RegExpExecArray | null;
  while ((m = OP_RE.exec(query)) !== null) {
    if (m[3]) {
      ops.push({ kind: 'mention', value: m[3] });
    } else {
      const key = m[1]!.toLowerCase();
      const kind: OperatorKind =
        key === 'state' || key === 'type' || key === 'assignee' || key === 'iter'
          ? key
          : 'unknown';
      ops.push({ kind, value: m[2]! });
    }
  }
  const freeText = query.replace(OP_RE, '').replace(/\s+/g, ' ').trim();
  return { ops, freeText };
}

export function applyOperators(
  items: ResultItem[],
  ops: ParsedOperator[],
  assignedToMeIds: Set<number>,
): ResultItem[] {
  if (ops.length === 0) return items;
  return items.filter((item) =>
    ops.every((op) => {
      switch (op.kind) {
        case 'state':
          return item.state.toLowerCase().includes(op.value.toLowerCase());
        case 'type':
          return item.workItemType.toLowerCase().includes(op.value.toLowerCase());
        case 'assignee':
          return item.assignedTo.toLowerCase().includes(op.value.toLowerCase());
        case 'mention':
          if (op.value.toLowerCase() === 'me') return assignedToMeIds.has(item.id);
          return item.assignedTo.toLowerCase().includes(op.value.toLowerCase());
        default:
          return true;
      }
    }),
  );
}
