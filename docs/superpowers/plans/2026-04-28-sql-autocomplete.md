# SQL Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SSMS-style table/view/column autocomplete to the BorgDock SQL window, with a stale-while-revalidate schema cache stored in the existing `prcache.db`.

**Architecture:** Replace the hand-rolled `<textarea>` editor in `SqlApp.tsx` with a CodeMirror 6 editor (`@codemirror/lang-sql`). On window open and connection switch, a React hook reads the schema from sqlite synchronously, applies it to the editor for instant autocomplete, then runs a fresh `INFORMATION_SCHEMA` fetch in the background and hot-swaps the result into the live editor via a CodeMirror `Compartment`.

**Tech Stack:** Rust (tiberius, rusqlite, tokio), React 19, TypeScript, CodeMirror 6, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-28-sql-autocomplete-design.md`

**Working directory note:** all `cargo` commands assume Git Bash on Windows. Prefix with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` if you see `"C:/Program" "Files/Git/Brepro-"` errors during `libsqlite3-sys` build (see `CLAUDE.md`).

---

### Task 1: Add `cached_sql_schema` table to cache schema

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/cache/mod.rs` (extend the `execute_batch` inside `cache_init`)

- [ ] **Step 1: Extend the cache_init batch with the new table**

In `cache_init`, find the existing `conn.execute_batch(...)` call (currently three `CREATE TABLE` statements). Append a fourth:

```rust
conn.execute_batch(
    "CREATE TABLE IF NOT EXISTS cached_prs (
        id INTEGER PRIMARY KEY,
        repo_owner TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        json_data TEXT NOT NULL,
        cached_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cached_tab_data (
        repo_owner TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        data_type TEXT NOT NULL,
        json_data TEXT NOT NULL,
        pr_updated_at TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        PRIMARY KEY (repo_owner, repo_name, pr_number, data_type)
    );

    CREATE TABLE IF NOT EXISTS cached_etags (
        url TEXT PRIMARY KEY,
        etag TEXT NOT NULL,
        json_data TEXT NOT NULL,
        cached_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cached_sql_schema (
        connection_name TEXT PRIMARY KEY,
        database_name   TEXT NOT NULL,
        json_data       TEXT NOT NULL,
        cached_at       TEXT NOT NULL
    );",
)
.map_err(|e| format!("Failed to create cache tables: {e}"))?;
```

- [ ] **Step 2: Verify cargo check passes**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check`
Expected: `Finished` with no errors. The new statement compiles into the existing batch.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/cache/mod.rs
git commit -m "feat(sql): add cached_sql_schema table for autocomplete cache"
```

---

### Task 2: Add SqlSchemaPayload types and table-stitching helper (with unit test)

**Files:**
- Create: `src/BorgDock.Tauri/src-tauri/src/sql/schema.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/sql/mod.rs:1-10` (add `pub mod schema;`)

- [ ] **Step 1: Write the failing unit test**

Create `src/BorgDock.Tauri/src-tauri/src/sql/schema.rs` with payload structs and a stitching helper, plus a test that drives the helper from raw rows:

```rust
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
```

Then in `src/BorgDock.Tauri/src-tauri/src/sql/mod.rs`, add `pub mod schema;` near the top of the file (after the existing `use` lines):

```rust
use keyring::Entry;
use serde::Serialize;
use tiberius::{AuthMethod, Client, Config, Row};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

use crate::settings;

pub mod schema;
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib sql::schema::tests`
Expected: `test result: ok. 2 passed`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/sql/schema.rs src/BorgDock.Tauri/src-tauri/src/sql/mod.rs
git commit -m "feat(sql): add SqlSchemaPayload types and stitch_schema helper"
```

---

### Task 3: Implement `fetch_sql_schema` Tauri command

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/sql/mod.rs` (add command at the end)
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs:233-235` (register in invoke_handler)

- [ ] **Step 1: Add the command at the end of `sql/mod.rs`**

Append to `src-tauri/src/sql/mod.rs` (after `test_sql_connection`):

```rust
#[tauri::command]
pub async fn fetch_sql_schema(
    window: tauri::Window,
    connection_name: String,
) -> Result<schema::SqlSchemaPayload, String> {
    if window.label() != "sql" {
        return Err("SQL commands can only be executed from the SQL window".to_string());
    }
    log::info!("fetch_sql_schema: connection '{}'", connection_name);

    let settings = settings::load_settings_internal()
        .map_err(|e| format!("Failed to load settings: {e}"))?;

    let conn_config = settings
        .sql
        .connections
        .iter()
        .find(|c| c.name == connection_name)
        .ok_or_else(|| format!("Connection '{}' not found", connection_name))?;

    let hydrated_password = if conn_config.authentication == "sql" {
        conn_config
            .password
            .clone()
            .or_else(|| load_sql_password(&conn_config.name))
    } else {
        None
    };
    if conn_config.authentication == "sql" && hydrated_password.is_none() {
        return Err(format!(
            "No password stored in keychain for SQL connection '{}'.",
            conn_config.name
        ));
    }

    let config = build_config(
        &conn_config.server,
        conn_config.port,
        &conn_config.database,
        &conn_config.authentication,
        conn_config.username.as_deref(),
        hydrated_password.as_deref(),
        conn_config.trust_server_certificate,
    )?;

    let server = conn_config.server.clone();
    let port = conn_config.port;
    let database = conn_config.database.clone();

    // Same panic-isolation as execute_sql_query — INFORMATION_SCHEMA is
    // built-in types so we don't expect tiberius UDT panics here, but the
    // pattern is cheap and matches the sibling command.
    let handle = tokio::spawn(async move {
        let mut client = connect(&server, port, config).await?;

        let tables_stream = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            client.query(
                "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE \
                 FROM INFORMATION_SCHEMA.TABLES \
                 ORDER BY TABLE_SCHEMA, TABLE_NAME",
                &[],
            ),
        )
        .await
        .map_err(|_| "Schema (tables) query timed out".to_string())?
        .map_err(|e| format!("Tables query failed: {e}"))?;

        let table_rows = tables_stream
            .into_first_result()
            .await
            .map_err(|e| format!("Failed to read tables: {e}"))?;

        let raw_tables: Vec<schema::RawTableRow> = table_rows
            .iter()
            .filter_map(|r| {
                let schema_s: &str = r.try_get("TABLE_SCHEMA").ok().flatten()?;
                let name: &str = r.try_get("TABLE_NAME").ok().flatten()?;
                let table_type: &str = r.try_get("TABLE_TYPE").ok().flatten()?;
                Some(schema::RawTableRow {
                    schema: schema_s.to_string(),
                    name: name.to_string(),
                    table_type: table_type.to_string(),
                })
            })
            .collect();

        let cols_stream = tokio::time::timeout(
            std::time::Duration::from_secs(60),
            client.query(
                "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION \
                 FROM INFORMATION_SCHEMA.COLUMNS \
                 ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION",
                &[],
            ),
        )
        .await
        .map_err(|_| "Schema (columns) query timed out".to_string())?
        .map_err(|e| format!("Columns query failed: {e}"))?;

        let col_rows = cols_stream
            .into_first_result()
            .await
            .map_err(|e| format!("Failed to read columns: {e}"))?;

        let raw_columns: Vec<schema::RawColumnRow> = col_rows
            .iter()
            .filter_map(|r| {
                let schema_s: &str = r.try_get("TABLE_SCHEMA").ok().flatten()?;
                let table: &str = r.try_get("TABLE_NAME").ok().flatten()?;
                let name: &str = r.try_get("COLUMN_NAME").ok().flatten()?;
                let data_type: &str = r.try_get("DATA_TYPE").ok().flatten()?;
                Some(schema::RawColumnRow {
                    schema: schema_s.to_string(),
                    table: table.to_string(),
                    name: name.to_string(),
                    data_type: data_type.to_string(),
                })
            })
            .collect();

        let now = chrono::Utc::now().to_rfc3339();
        Ok::<schema::SqlSchemaPayload, String>(schema::stitch_schema(
            database,
            now,
            raw_tables,
            raw_columns,
        ))
    });

    match handle.await {
        Ok(result) => result,
        Err(join_err) if join_err.is_panic() => {
            let panic = join_err.into_panic();
            let msg = panic
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| panic.downcast_ref::<&str>().map(|s| s.to_string()))
                .unwrap_or_else(|| "unknown panic".to_string());
            log::error!("fetch_sql_schema: tiberius panic caught: {msg}");
            Err(format!("Schema fetch failed: {msg}"))
        }
        Err(join_err) => Err(format!("Schema fetch task failed: {join_err}")),
    }
}
```

- [ ] **Step 2: Register the command in `lib.rs`**

In `src-tauri/src/lib.rs`, find the SQL section in `invoke_handler` (around line 233):

```rust
            // SQL
            sql::execute_sql_query,
            sql::test_sql_connection,
```

Add the new command:

```rust
            // SQL
            sql::execute_sql_query,
            sql::test_sql_connection,
            sql::fetch_sql_schema,
```

- [ ] **Step 3: Verify cargo check passes**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check`
Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/sql/mod.rs src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "feat(sql): add fetch_sql_schema Tauri command"
```

---

### Task 4: Implement schema cache load/save commands

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/cache/mod.rs` (append two commands)
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs:225-232` (register them)

- [ ] **Step 1: Append load + save commands to `cache/mod.rs`**

At the end of `cache/mod.rs` (after `cache_load_etags` / `cache_cleanup`), add:

```rust
#[tauri::command]
pub fn cache_load_sql_schema(
    state: State<'_, PrCache>,
    connection_name: String,
) -> Result<Option<crate::sql::schema::SqlSchemaPayload>, String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    let mut stmt = conn
        .prepare(
            "SELECT json_data FROM cached_sql_schema WHERE connection_name = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {e}"))?;

    let result = stmt.query_row(rusqlite::params![connection_name], |row| {
        let json_str: String = row.get(0)?;
        Ok(json_str)
    });

    match result {
        Ok(json_str) => {
            let payload: crate::sql::schema::SqlSchemaPayload =
                serde_json::from_str(&json_str)
                    .map_err(|e| format!("JSON parse error: {e}"))?;
            Ok(Some(payload))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to load schema cache: {e}")),
    }
}

#[tauri::command]
pub fn cache_save_sql_schema(
    state: State<'_, PrCache>,
    connection_name: String,
    payload: crate::sql::schema::SqlSchemaPayload,
) -> Result<(), String> {
    let lock = state
        .conn
        .lock()
        .map_err(|e| format!("Lock poisoned: {e}"))?;
    let conn = lock.as_ref().ok_or("Cache not initialized")?;

    let json_str = serde_json::to_string(&payload)
        .map_err(|e| format!("JSON serialize error: {e}"))?;
    let now = chrono_now();

    conn.execute(
        "INSERT OR REPLACE INTO cached_sql_schema
         (connection_name, database_name, json_data, cached_at)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![connection_name, payload.database, json_str, now],
    )
    .map_err(|e| format!("Failed to save schema cache: {e}"))?;

    Ok(())
}
```

Note: `chrono_now()` already exists in `cache/mod.rs` (used by `cache_save_prs` etc.). No new import needed.

- [ ] **Step 2: Register the new commands in `lib.rs`**

In `src-tauri/src/lib.rs`, in the Cache section of `invoke_handler` (around lines 224–232):

```rust
            // Cache
            cache::cache_init,
            cache::cache_load_prs,
            cache::cache_save_prs,
            cache::cache_cleanup,
            cache::cache_save_tab_data,
            cache::cache_load_tab_data,
            cache::cache_save_etags,
            cache::cache_load_etags,
            cache::cache_load_sql_schema,
            cache::cache_save_sql_schema,
```

- [ ] **Step 3: Verify cargo check passes**

Run: `cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check`
Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/cache/mod.rs src/BorgDock.Tauri/src-tauri/src/lib.rs
git commit -m "feat(sql): add cache_load_sql_schema and cache_save_sql_schema commands"
```

---

### Task 5: Add CodeMirror dependencies

**Files:**
- Modify: `src/BorgDock.Tauri/package.json` (add 6 dependencies)

- [ ] **Step 1: Install the dependencies**

Run from `src/BorgDock.Tauri/`:

```bash
npm install --save \
  @codemirror/state \
  @codemirror/view \
  @codemirror/lang-sql \
  @codemirror/autocomplete \
  @codemirror/commands \
  codemirror
```

This updates `package.json` and `package-lock.json`.

- [ ] **Step 2: Verify the build still passes**

Run: `cd src/BorgDock.Tauri && npm run build`
Expected: tsc + vite build complete with no errors. Bundle size grows by ~50–60 KB gz.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/package.json src/BorgDock.Tauri/package-lock.json
git commit -m "feat(sql): add CodeMirror 6 dependencies for SQL autocomplete"
```

---

### Task 6: Add SqlSchemaPayload TypeScript type

**Files:**
- Create: `src/BorgDock.Tauri/src/types/sql-schema.ts`

- [ ] **Step 1: Create the type file**

Create `src/BorgDock.Tauri/src/types/sql-schema.ts`:

```ts
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
```

These mirror the Rust `serde(rename_all = "camelCase")` payload exactly.

- [ ] **Step 2: Verify tsc passes**

Run: `cd src/BorgDock.Tauri && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/types/sql-schema.ts
git commit -m "feat(sql): add SqlSchemaPayload TypeScript types"
```

---

### Task 7: Add `toCmSchema` helper with unit test

**Files:**
- Create: `src/BorgDock.Tauri/src/components/sql/to-cm-schema.ts`
- Create: `src/BorgDock.Tauri/src/components/sql/__tests__/to-cm-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/BorgDock.Tauri/src/components/sql/__tests__/to-cm-schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SqlSchemaPayload } from '@/types/sql-schema';
import { toCmSchema } from '../to-cm-schema';

const fixture: SqlSchemaPayload = {
  database: 'AppDb',
  fetchedAt: '2026-04-28T00:00:00Z',
  tables: [
    {
      schema: 'dbo',
      name: 'Users',
      kind: 'table',
      columns: [
        { name: 'id', dataType: 'int' },
        { name: 'email', dataType: 'nvarchar' },
      ],
    },
    {
      schema: 'dbo',
      name: 'ActiveUsers',
      kind: 'view',
      columns: [{ name: 'id', dataType: 'int' }],
    },
  ],
};

describe('toCmSchema', () => {
  it('emits both bare and schema-qualified keys for each table', () => {
    const cm = toCmSchema(fixture);
    expect(cm.Users).toEqual(['id', 'email']);
    expect(cm['dbo.Users']).toEqual(['id', 'email']);
    expect(cm.ActiveUsers).toEqual(['id']);
    expect(cm['dbo.ActiveUsers']).toEqual(['id']);
  });

  it('returns an empty object when payload is null', () => {
    expect(toCmSchema(null)).toEqual({});
  });

  it('handles tables with no columns', () => {
    const empty: SqlSchemaPayload = {
      database: 'X',
      fetchedAt: 'ts',
      tables: [{ schema: 'dbo', name: 'Empty', kind: 'table', columns: [] }],
    };
    const cm = toCmSchema(empty);
    expect(cm.Empty).toEqual([]);
    expect(cm['dbo.Empty']).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd src/BorgDock.Tauri && npx vitest run src/components/sql/__tests__/to-cm-schema.test.ts`
Expected: FAIL — `Cannot find module '../to-cm-schema'`.

- [ ] **Step 3: Implement `toCmSchema`**

Create `src/BorgDock.Tauri/src/components/sql/to-cm-schema.ts`:

```ts
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
```

- [ ] **Step 4: Re-run the test**

Run: `cd src/BorgDock.Tauri && npx vitest run src/components/sql/__tests__/to-cm-schema.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/sql/to-cm-schema.ts src/BorgDock.Tauri/src/components/sql/__tests__/to-cm-schema.test.ts
git commit -m "feat(sql): add toCmSchema helper for CodeMirror schema map"
```

---

### Task 8: Implement `useSqlSchema` hook with tests

**Files:**
- Create: `src/BorgDock.Tauri/src/components/sql/use-sql-schema.ts`
- Create: `src/BorgDock.Tauri/src/components/sql/__tests__/use-sql-schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/BorgDock.Tauri/src/components/sql/__tests__/use-sql-schema.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqlSchemaPayload } from '@/types/sql-schema';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { useSqlSchema } from '../use-sql-schema';

const cached: SqlSchemaPayload = {
  database: 'AppDb',
  fetchedAt: '2026-04-27T00:00:00Z',
  tables: [{ schema: 'dbo', name: 'OldTable', kind: 'table', columns: [] }],
};

const fresh: SqlSchemaPayload = {
  database: 'AppDb',
  fetchedAt: '2026-04-28T00:00:00Z',
  tables: [{ schema: 'dbo', name: 'NewTable', kind: 'table', columns: [] }],
};

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSqlSchema', () => {
  it('returns cached schema first, then swaps in fresh', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'cache_load_sql_schema') return cached;
      if (cmd === 'fetch_sql_schema') return fresh;
      if (cmd === 'cache_save_sql_schema') return undefined;
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useSqlSchema('local'));

    await waitFor(() => expect(result.current.schema).toEqual(cached));
    expect(result.current.status).toBe('cached');

    await waitFor(() => expect(result.current.schema).toEqual(fresh));
    expect(result.current.status).toBe('fresh');
    expect(mockInvoke).toHaveBeenCalledWith('cache_save_sql_schema', {
      connectionName: 'local',
      payload: fresh,
    });
  });

  it('falls back to error status on cold cache + fetch failure', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'cache_load_sql_schema') return null;
      if (cmd === 'fetch_sql_schema') throw new Error('boom');
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useSqlSchema('local'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.schema).toBeNull();
  });

  it('keeps cached schema if revalidate fails', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'cache_load_sql_schema') return cached;
      if (cmd === 'fetch_sql_schema') throw new Error('network down');
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useSqlSchema('local'));

    await waitFor(() => expect(result.current.status).toBe('cached'));
    expect(result.current.schema).toEqual(cached);
  });

  it('does nothing when connectionName is empty', async () => {
    const { result } = renderHook(() => useSqlSchema(''));
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.schema).toBeNull();
    expect(result.current.status).toBe('cold');
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd src/BorgDock.Tauri && npx vitest run src/components/sql/__tests__/use-sql-schema.test.ts`
Expected: FAIL — `Cannot find module '../use-sql-schema'`.

- [ ] **Step 3: Implement the hook**

Create `src/BorgDock.Tauri/src/components/sql/use-sql-schema.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SqlSchemaPayload } from '@/types/sql-schema';

export type SchemaStatus = 'cold' | 'cached' | 'refreshing' | 'fresh' | 'error';

export interface UseSqlSchemaResult {
  schema: SqlSchemaPayload | null;
  status: SchemaStatus;
  refresh: () => void;
}

export function useSqlSchema(connectionName: string): UseSqlSchemaResult {
  const [schema, setSchema] = useState<SqlSchemaPayload | null>(null);
  const [status, setStatus] = useState<SchemaStatus>('cold');
  const cancelledRef = useRef(false);

  const runFresh = useCallback(
    async (hadCache: boolean) => {
      if (!connectionName) return;
      setStatus(hadCache ? 'refreshing' : 'cold');
      try {
        const payload = await invoke<SqlSchemaPayload>('fetch_sql_schema', { connectionName });
        if (cancelledRef.current) return;
        setSchema(payload);
        setStatus('fresh');
        await invoke('cache_save_sql_schema', { connectionName, payload });
      } catch (err) {
        if (cancelledRef.current) return;
        // On revalidate failure with a cache hit: keep cached data.
        // On cold-cache failure: surface error.
        setStatus(hadCache ? 'cached' : 'error');
        // eslint-disable-next-line no-console
        console.warn('fetch_sql_schema failed:', err);
      }
    },
    [connectionName],
  );

  useEffect(() => {
    if (!connectionName) {
      setSchema(null);
      setStatus('cold');
      return;
    }

    cancelledRef.current = false;

    (async () => {
      try {
        const cached = await invoke<SqlSchemaPayload | null>('cache_load_sql_schema', {
          connectionName,
        });
        if (cancelledRef.current) return;
        if (cached) {
          setSchema(cached);
          setStatus('cached');
        }
        await runFresh(!!cached);
      } catch (err) {
        if (cancelledRef.current) return;
        // eslint-disable-next-line no-console
        console.warn('cache_load_sql_schema failed:', err);
        await runFresh(false);
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [connectionName, runFresh]);

  const refresh = useCallback(() => {
    cancelledRef.current = false;
    void runFresh(schema !== null);
  }, [runFresh, schema]);

  return { schema, status, refresh };
}
```

- [ ] **Step 4: Re-run the tests**

Run: `cd src/BorgDock.Tauri && npx vitest run src/components/sql/__tests__/use-sql-schema.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/sql/use-sql-schema.ts src/BorgDock.Tauri/src/components/sql/__tests__/use-sql-schema.test.ts
git commit -m "feat(sql): add useSqlSchema hook with stale-while-revalidate"
```

---

### Task 9: Implement `SqlEditor` component

**Files:**
- Create: `src/BorgDock.Tauri/src/components/sql/SqlEditor.tsx`

- [ ] **Step 1: Create the editor component**

Create `src/BorgDock.Tauri/src/components/sql/SqlEditor.tsx`:

```tsx
import { autocompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { MSSQL, sql } from '@codemirror/lang-sql';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import type { SqlSchemaPayload } from '@/types/sql-schema';
import { toCmSchema } from './to-cm-schema';

interface SqlEditorProps {
  value: string;
  onChange: (next: string) => void;
  onRunQuery: () => void;
  schema: SqlSchemaPayload | null;
  height: number;
}

function buildSqlExtension(schema: SqlSchemaPayload | null) {
  return sql({
    dialect: MSSQL,
    schema: toCmSchema(schema),
    upperCaseKeywords: true,
  });
}

export function SqlEditor({ value, onChange, onRunQuery, schema, height }: SqlEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const sqlCompartmentRef = useRef<Compartment | null>(null);
  // Latest callbacks, refreshed each render so closures inside the editor see them.
  const onChangeRef = useRef(onChange);
  const onRunQueryRef = useRef(onRunQuery);
  onChangeRef.current = onChange;
  onRunQueryRef.current = onRunQuery;

  // Mount once, dispose on unmount.
  useEffect(() => {
    if (!hostRef.current) return;
    const sqlCompartment = new Compartment();
    sqlCompartmentRef.current = sqlCompartment;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        autocompletion(),
        sqlCompartment.of(buildSqlExtension(schema)),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onRunQueryRef.current();
              return true;
            },
            preventDefault: true,
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { fontFamily: 'var(--font-mono, monospace)' },
          '.cm-content': { caretColor: 'var(--color-text-primary)' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
      sqlCompartmentRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hot-swap the SQL config (and thus the autocomplete schema) when schema changes.
  useEffect(() => {
    const view = viewRef.current;
    const compartment = sqlCompartmentRef.current;
    if (!view || !compartment) return;
    view.dispatch({
      effects: compartment.reconfigure(buildSqlExtension(schema)),
    });
  }, [schema]);

  // Keep the editor doc in sync if `value` is reassigned externally
  // (e.g. when the user explicitly clears the query).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      className="sql-editor-cm"
      // editorHeight is user-resizable via the existing drag handle in SqlApp.
      style={{ height }}
    />
  );
}
```

- [ ] **Step 2: Verify tsc passes**

Run: `cd src/BorgDock.Tauri && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/sql/SqlEditor.tsx
git commit -m "feat(sql): add CodeMirror-based SqlEditor component"
```

---

### Task 10: Wire SqlEditor and useSqlSchema into SqlApp

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/sql/SqlApp.tsx` (replace textarea + gutter, add status pip + refresh button)
- Modify: `src/BorgDock.Tauri/src/components/sql/__tests__/SqlApp.test.tsx` (mock new commands)

- [ ] **Step 1: Update SqlApp.tsx**

In `src/BorgDock.Tauri/src/components/sql/SqlApp.tsx`:

1. **Add imports** at the top of the imports block:

```tsx
import { SqlEditor } from './SqlEditor';
import { useSqlSchema } from './use-sql-schema';
```

2. **Remove unused refs and state.** Delete these lines:

```tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);
```

Then remove the `useRef` import if no other usage remains. Also remove the `lineCount` derivation and the `handleTextareaKeyDown` callback — both are now owned by `SqlEditor`.

3. **Inside `SqlApp`**, after `selectedConnection` state, add:

```tsx
const { schema, status: schemaStatus, refresh: refreshSchema } = useSqlSchema(selectedConnection);
```

4. **Update `runQuery`.** The current implementation reads `textareaRef.current.selectionStart/selectionEnd` to support running only the highlighted block. Drop that for the first cut — run the whole `query` always. (Selection-aware run can come back later as a `SqlEditor` ref API.) Replace:

```tsx
const runQuery = useCallback(async () => {
  if (!selectedConnection) return;

  const ta = textareaRef.current;
  const selected =
    ta && ta.selectionStart !== ta.selectionEnd
      ? query.slice(ta.selectionStart, ta.selectionEnd)
      : '';
  const toRun = (selected || query).trim();
  if (!toRun) return;
  // ...
}, [selectedConnection, query]);
```

with:

```tsx
const runQuery = useCallback(async () => {
  if (!selectedConnection) return;
  const toRun = query.trim();
  if (!toRun) return;

  setIsRunning(true);
  setError('');
  setResult(null);
  setSelectedRowsMap(new Map());

  try {
    const res = await invoke<QueryResult>('execute_sql_query', {
      connectionName: selectedConnection,
      query: toRun,
    });
    setResult(res);
  } catch (err) {
    setError(parseError(err).message);
  } finally {
    setIsRunning(false);
  }
}, [selectedConnection, query]);
```

5. **Replace the editor JSX.** Find the block that begins:

```tsx
{/* ── Editor area ─────────────────────────────────── */}
<div
  id="sql-editor-area"
  data-sql-editor
  className="sql-editor-area"
  style={{ height: editorHeight }}
>
  {/* Line numbers gutter */}
  <div className="sql-gutter" aria-hidden="true">
    {Array.from({ length: Math.max(lineCount, 6) }, (_, i) => (
      <div key={i} className="sql-gutter-line">
        {i + 1}
      </div>
    ))}
  </div>
  {/* Textarea */}
  <textarea
    ref={textareaRef}
    className="sql-textarea"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    onKeyDown={handleTextareaKeyDown}
    placeholder="SELECT * FROM ..."
    spellCheck={false}
    autoCapitalize="off"
    autoCorrect="off"
  />
</div>
```

Replace the entire block with:

```tsx
{/* ── Editor area ─────────────────────────────────── */}
<div
  id="sql-editor-area"
  data-sql-editor
  className="sql-editor-area"
  style={{ height: editorHeight }}
>
  <SqlEditor
    value={query}
    onChange={setQuery}
    onRunQuery={runQuery}
    schema={schema}
    height={editorHeight}
  />
</div>
```

6. **Add a small status indicator + refresh button** to the toolbar. Find this in `SqlApp.tsx` (currently around line 388):

```tsx
        {/* Separator */}
        <div className="sql-toolbar-separator" />

        {/* Run button */}
        <Button
```

Insert the new controls **immediately before** the existing separator, so the final ordering is `picker → status → refresh → separator → Run`:

```tsx
        {schemaStatus === 'cold' && hasConnections && (
          <span className="sql-schema-status sql-schema-status--cold" title="Loading schema…">
            <SpinnerIcon /> schema
          </span>
        )}
        {schemaStatus === 'refreshing' && (
          <span className="sql-schema-status sql-schema-status--refreshing" title="Refreshing schema…">
            <SpinnerIcon />
          </span>
        )}
        {schemaStatus === 'error' && (
          <span
            className="sql-schema-status sql-schema-status--error"
            title="Couldn't refresh schema (using cached version if available)"
          >
            ⚠
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          data-action="refresh-schema"
          className="sql-refresh-schema"
          disabled={!hasConnections || schemaStatus === 'cold' || schemaStatus === 'refreshing'}
          onClick={refreshSchema}
          aria-label="Refresh schema"
          title="Refresh schema (re-fetch tables and columns)"
        >
          ↻
        </Button>

        {/* Separator */}
        <div className="sql-toolbar-separator" />
```

The existing separator stays as the divider between the schema controls and the Run button — we don't add a second one.

- [ ] **Step 2: Update existing SqlApp test mock**

In `src/BorgDock.Tauri/src/components/sql/__tests__/SqlApp.test.tsx`, the existing `vi.mocked(invoke)` setup mocks `load_settings`. Now `useSqlSchema` will also call `cache_load_sql_schema` and `fetch_sql_schema` on mount — they need handlers or the test will warn.

Locate the `beforeEach` (or wherever the mock implementation is set) and ensure the `invoke` mock returns `null` for `cache_load_sql_schema` and either succeeds or rejects for `fetch_sql_schema`. Example handler addition (adapt to whatever shape the existing mock has):

```ts
mockInvoke.mockImplementation(async (cmd: string) => {
  if (cmd === 'load_settings') return /* existing settings fixture */;
  if (cmd === 'cache_load_sql_schema') return null;
  if (cmd === 'fetch_sql_schema') return {
    database: 'AppDb',
    fetchedAt: '2026-04-28T00:00:00Z',
    tables: [],
  };
  if (cmd === 'cache_save_sql_schema') return undefined;
  // ...other existing handlers...
  throw new Error(`unexpected ${cmd}`);
});
```

If the existing test already uses `mockResolvedValue` or per-call mocking, switch to `mockImplementation` as above to handle the new commands cleanly.

- [ ] **Step 3: Run all SQL tests**

Run: `cd src/BorgDock.Tauri && npx vitest run src/components/sql`
Expected: all tests pass — `to-cm-schema`, `use-sql-schema`, `SqlApp`, `ResultsTable`.

- [ ] **Step 4: Run the full build**

Run: `cd src/BorgDock.Tauri && npm run build`
Expected: tsc + vite complete with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/sql/SqlApp.tsx src/BorgDock.Tauri/src/components/sql/__tests__/SqlApp.test.tsx
git commit -m "feat(sql): wire CodeMirror editor and schema autocomplete into SqlApp"
```

---

### Task 11: Style the new editor + status indicators to match the SQL window

**Files:**
- Modify: `src/BorgDock.Tauri/src/styles/index.css` (existing SQL rules live around lines 1589–1635)

- [ ] **Step 1: Remove now-unused rules**

In `src/BorgDock.Tauri/src/styles/index.css`, delete the rules for `.sql-textarea`, `.sql-textarea::placeholder`, `.sql-gutter`, and `.sql-gutter-line` (CodeMirror provides its own gutter and textarea-equivalent). Keep `.sql-editor-area` — it's now the wrapper around `<SqlEditor />`.

- [ ] **Step 2: Add styles for the CodeMirror host and the new toolbar pieces**

Add to the same stylesheet:

```css
.sql-editor-area .sql-editor-cm {
  height: 100%;
  width: 100%;
}

.sql-editor-cm .cm-editor {
  height: 100%;
  background: var(--color-surface-base);
  color: var(--color-text-primary);
}

.sql-editor-cm .cm-gutters {
  background: var(--color-surface-subtle);
  border-right: 1px solid var(--color-border-subtle);
  color: var(--color-text-tertiary);
}

.sql-editor-cm .cm-activeLineGutter,
.sql-editor-cm .cm-activeLine {
  background: var(--color-surface-hover);
}

.sql-editor-cm .cm-focused {
  outline: none;
}

.sql-editor-cm .cm-tooltip-autocomplete {
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.sql-editor-cm .cm-tooltip-autocomplete > ul > li[aria-selected] {
  background: var(--color-accent-subtle);
  color: var(--color-text-primary);
}

.sql-schema-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-text-tertiary);
  padding: 0 4px;
}

.sql-schema-status--error {
  color: var(--color-status-red);
}

.sql-refresh-schema {
  font-size: 14px;
  line-height: 1;
  padding: 2px 6px;
}
```

(Variable names are illustrative — match whatever the rest of the SQL window already uses. `git grep "var(--color-" src/components/sql` reveals the established palette.)

- [ ] **Step 3: Verify visually**

Run `cd src/BorgDock.Tauri && npm run dev` (or `npm run tauri dev`), open the SQL window. Confirm:
- The editor renders with the same dark/light theme as the rest of the window
- Line numbers are visible in CodeMirror's gutter
- The autocomplete popup uses the surface-elevated background
- The schema status pip and refresh button are visually integrated with the toolbar

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/styles/index.css
git commit -m "style(sql): theme CodeMirror editor and schema status indicators"
```

---

### Task 12: Manual smoke test pass

This task does not produce code changes — it produces a written confirmation that the feature works end-to-end against a real SQL Server. Skip if no test database is available; in that case, document the limitation in the eventual PR description.

**Pre-flight:**
- Have a SQL Server (local Docker container or networked instance) reachable
- Have BorgDock configured with at least one connection that authenticates

- [ ] **Step 1: Cold-cache flow**

1. Delete `prcache.db` (close BorgDock first):
   - Windows: `del "%APPDATA%\BorgDock\prcache.db"`
2. Launch BorgDock and open the SQL window.
3. Expected: small "schema" indicator with spinner appears next to the connection picker for a brief period (< a few seconds on a normal DB), then disappears.
4. Type `SELECT * FROM ` and wait for the popup.
5. Expected: a list of tables (and views) from the connected DB. Pick one — it auto-completes.
6. Type a table alias `u.` after `SELECT ` and `FROM dbo.Users u`.
7. Expected: column list for `Users` appears.

- [ ] **Step 2: Warm-cache flow**

1. Close the SQL window and reopen it (do **not** delete `prcache.db`).
2. Expected: no spinner — autocomplete works on first keystroke. A faint "refreshing" pulse appears briefly while the background revalidate runs, then disappears.

- [ ] **Step 3: Stale-cache flow**

1. Add a new table to the database (`CREATE TABLE dbo.Smoke (id int)`).
2. In the SQL window, type `SELECT * FROM Smo` — the new table is **not** suggested (cache hasn't been refreshed).
3. Click the refresh button.
4. After a moment, type `Smo` again.
5. Expected: `Smoke` appears in the popup.

- [ ] **Step 4: Network-failure flow**

1. With the SQL window already open and a cached schema present, disconnect from the network (or stop the SQL Server container).
2. Reopen the window or click refresh.
3. Expected: the ⚠ status pip appears with the tooltip "Couldn't refresh schema (using cached version)". Autocomplete continues to work from cache.

- [ ] **Step 5: Document the run**

Add a short note to the eventual PR description listing which scenarios were verified. No commit needed — this is documentation for the reviewer.

---

## Execution notes

- **Order matters for the first 4 tasks.** The cache table must exist before `cache_load_sql_schema` can return rows; the schema types must exist before the cache commands can take them as parameters.
- **CodeMirror's autocomplete is keyword-only without a schema.** Tasks 1–8 all need to land before the user sees table completions, but each one builds on top of compiling code, so checkpoints between tasks are real.
- **Selection-aware "Run highlighted block."** This was a feature of the textarea version (`textareaRef.current.selectionStart/selectionEnd`). Task 10 drops it. To restore: expose a `getSelectedText()` ref API on `SqlEditor` that reads `view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)`, then `SqlApp.runQuery` consumes it. Out of scope for this plan.
