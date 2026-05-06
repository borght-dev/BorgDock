// src/components/work-item-palette/parseOperators.ts
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

export type OperatorKind = 'state' | 'type' | 'assignee' | 'iter' | 'mention' | 'unknown';

export interface ParsedOperator {
  kind: OperatorKind;
  /** The raw operator key as the user typed it (lowercase). For mentions this is undefined; the value is the user-typed name. */
  rawKey?: string;
  value: string;
}

export interface ParsedQuery {
  ops: ParsedOperator[];
  freeText: string;
}

export function parseOperators(query: string): ParsedQuery {
  const re = /(\w+):(\S+)|@(\w+)/g;
  const ops: ParsedOperator[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    if (m[3]) {
      ops.push({ kind: 'mention', value: m[3] });
    } else {
      const rawKey = m[1]!.toLowerCase();
      const kind: OperatorKind =
        rawKey === 'state' || rawKey === 'type' || rawKey === 'assignee' || rawKey === 'iter'
          ? rawKey
          : 'unknown';
      ops.push({ kind, rawKey, value: m[2]! });
    }
  }
  const freeText = query.replace(/(\w+):(\S+)|@(\w+)/g, '').replace(/\s+/g, ' ').trim();
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
        case 'iter':
          return (item.iteration ?? '').toLowerCase().includes(op.value.toLowerCase());
        case 'mention':
          if (op.value.toLowerCase() === 'me') return assignedToMeIds.has(item.id);
          return item.assignedTo.toLowerCase().includes(op.value.toLowerCase());
        default:
          return true;
      }
    }),
  );
}
