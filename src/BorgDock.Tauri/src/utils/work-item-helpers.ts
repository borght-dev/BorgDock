import type { AdoQuery, WorkItem } from '@/types';

// ---- Helpers ----

export function getField(item: WorkItem, field: string): string {
  const value = item.fields[field];
  if (typeof value === 'string') return value;
  // ADO identity fields are objects with displayName
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.displayName === 'string') return obj.displayName;
    if (typeof obj.uniqueName === 'string') return obj.uniqueName;
  }
  return '';
}

// ---- Query tree helpers ----

export function flattenQueries(queries: AdoQuery[]): AdoQuery[] {
  const result: AdoQuery[] = [];
  for (const q of queries) {
    result.push(q);
    if (q.children.length > 0) {
      result.push(...flattenQueries(q.children));
    }
  }
  return result;
}
