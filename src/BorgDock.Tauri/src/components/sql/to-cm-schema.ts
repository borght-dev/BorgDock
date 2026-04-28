import type { SqlSchemaPayload } from '@/types/sql-schema';

/**
 * Convert a SqlSchemaPayload to the shape CodeMirror's SQL completion expects:
 *   { tableName: ['col1', 'col2', ...] }
 *
 * Both the bare table name and the schema-qualified `schema.name` form are
 * emitted so completions work after `FROM ` and after `FROM dbo.`.
 */
export function toCmSchema(payload: SqlSchemaPayload | null): Record<string, string[]> {
  if (!payload) return {};
  const out: Record<string, string[]> = {};
  for (const t of payload.tables) {
    const cols = t.columns.map((c) => c.name);
    out[t.name] = cols;
    out[`${t.schema}.${t.name}`] = cols;
  }
  return out;
}
