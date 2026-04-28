use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SqlColumn {
    pub name: String,
    pub data_type: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SqlTableKind {
    Table,
    View,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SqlTable {
    pub schema: String,
    pub name: String,
    pub kind: SqlTableKind,
    pub columns: Vec<SqlColumn>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SqlSchemaPayload {
    pub database: String,
    pub fetched_at: String,
    pub tables: Vec<SqlTable>,
}

/// One INFORMATION_SCHEMA.TABLES row (decoded from tiberius).
#[derive(Debug, Clone)]
pub struct RawTableRow {
    pub schema: String,
    pub name: String,
    pub table_type: String, // "BASE TABLE" or "VIEW"
}

/// One INFORMATION_SCHEMA.COLUMNS row (decoded from tiberius).
#[derive(Debug, Clone)]
pub struct RawColumnRow {
    pub schema: String,
    pub table: String,
    pub name: String,
    pub data_type: String,
}

/// Stitch flat TABLES + COLUMNS result rows into the typed payload.
/// Tables are kept in input order; columns within a table are kept in the
/// order they arrive (callers should ORDER BY ORDINAL_POSITION).
/// Tables with no matching column rows still appear (empty `columns`).
pub fn stitch_schema(
    database: String,
    fetched_at: String,
    tables: Vec<RawTableRow>,
    columns: Vec<RawColumnRow>,
) -> SqlSchemaPayload {
    use std::collections::HashMap;

    let mut by_table: HashMap<(String, String), Vec<SqlColumn>> = HashMap::new();
    for c in columns {
        by_table
            .entry((c.schema, c.table))
            .or_default()
            .push(SqlColumn { name: c.name, data_type: c.data_type });
    }

    let stitched = tables
        .into_iter()
        .map(|t| {
            let cols = by_table
                .remove(&(t.schema.clone(), t.name.clone()))
                .unwrap_or_default();
            let kind = if t.table_type == "VIEW" {
                SqlTableKind::View
            } else {
                SqlTableKind::Table
            };
            SqlTable {
                schema: t.schema,
                name: t.name,
                kind,
                columns: cols,
            }
        })
        .collect();

    SqlSchemaPayload {
        database,
        fetched_at,
        tables: stitched,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stitch_pairs_columns_with_their_table() {
        let tables = vec![
            RawTableRow { schema: "dbo".into(), name: "Users".into(), table_type: "BASE TABLE".into() },
            RawTableRow { schema: "dbo".into(), name: "ActiveUsers".into(), table_type: "VIEW".into() },
        ];
        let columns = vec![
            RawColumnRow { schema: "dbo".into(), table: "Users".into(), name: "id".into(), data_type: "int".into() },
            RawColumnRow { schema: "dbo".into(), table: "Users".into(), name: "email".into(), data_type: "nvarchar".into() },
            RawColumnRow { schema: "dbo".into(), table: "ActiveUsers".into(), name: "id".into(), data_type: "int".into() },
        ];

        let payload = stitch_schema("AppDb".into(), "2026-04-28T00:00:00Z".into(), tables, columns);

        assert_eq!(payload.database, "AppDb");
        assert_eq!(payload.tables.len(), 2);

        let users = &payload.tables[0];
        assert_eq!(users.name, "Users");
        assert_eq!(users.kind, SqlTableKind::Table);
        assert_eq!(users.columns.len(), 2);
        assert_eq!(users.columns[0].name, "id");
        assert_eq!(users.columns[1].name, "email");

        let active = &payload.tables[1];
        assert_eq!(active.kind, SqlTableKind::View);
        assert_eq!(active.columns.len(), 1);
    }

    #[test]
    fn stitch_keeps_tables_with_no_columns() {
        let tables = vec![
            RawTableRow { schema: "dbo".into(), name: "Empty".into(), table_type: "BASE TABLE".into() },
        ];
        let columns: Vec<RawColumnRow> = vec![];

        let payload = stitch_schema("AppDb".into(), "ts".into(), tables, columns);

        assert_eq!(payload.tables.len(), 1);
        assert!(payload.tables[0].columns.is_empty());
    }
}
