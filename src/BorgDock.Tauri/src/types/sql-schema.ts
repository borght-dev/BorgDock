export type SqlTableKind = 'table' | 'view';

export interface SqlColumn {
  name: string;
  dataType: string;
}

export interface SqlTable {
  schema: string;
  name: string;
  kind: SqlTableKind;
  columns: SqlColumn[];
}

export interface SqlSchemaPayload {
  database: string;
  fetchedAt: string;
  tables: SqlTable[];
}
