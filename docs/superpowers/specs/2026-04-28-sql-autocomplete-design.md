# SQL Autocomplete — Design

**Date:** 2026-04-28
**Window:** BorgDock SQL (`src/components/sql/SqlApp.tsx`)
**Status:** Spec — pending implementation plan

## Goal

Bring SSMS-style autocomplete to the SQL window: as the user types after `FROM` / `JOIN`, suggest table and view names from the currently selected connection. As they type after `SELECT` / `WHERE` / `ON`, suggest columns. Keyword completion comes for free with a real SQL grammar.

The feature has to feel instant on window open — no "loading schema…" pause before the first popup — and stay correct when the database schema changes.

## Non-goals

- Stored procedures, functions, or triggers
- Cross-database `[OtherDb].[dbo].[Table]` completion
- Parameter hints / signature help
- Live error squiggles / linting
- Multi-engine support (MSSQL only — matches the existing `execute_sql_query` scope)

## Architecture

Three boundaries, each with one responsibility.

### Rust — schema fetcher and cache

- **`sql::fetch_sql_schema(connection_name)`** — new `#[tauri::command]` in `src-tauri/src/sql/mod.rs`. Connects via the same `build_config` + `load_sql_password` path as `execute_sql_query`, runs two `INFORMATION_SCHEMA` queries (tables/views, columns), stitches them in Rust, returns a typed payload. Wrapped in `tokio::spawn` + `JoinError::is_panic()` so a panic in tiberius never kills the app — same pattern as `execute_sql_query`.
- **`cache::cache_load_sql_schema` / `cache::cache_save_sql_schema`** — UPSERT pair on a new `cached_sql_schema` table inside the existing `prcache.db`. No new state, no new DB file. `cache_init` gets one extra `CREATE TABLE IF NOT EXISTS`.

### React — schema hook

- **`src/components/sql/use-sql-schema.ts`** — owns stale-while-revalidate. Returns `{ schema, status, refresh }`. On mount and on connection change: read cache → apply (cached) → fire fresh fetch in the background → write cache → swap (fresh). On fetch failure with a cache hit, keep the cached schema and surface a soft error status.

### React — editor

- **`src/components/sql/SqlEditor.tsx`** — replaces the `<textarea>` + hand-rolled `sql-gutter` block in `SqlApp.tsx`. Wraps a single CodeMirror 6 `EditorView`. Schema is fed in through a `Compartment` so the live editor reconfigures without remounting when fresh schema arrives.

`SqlApp.tsx` shrinks: drops the textarea, mounts `<SqlEditor />`, calls `useSqlSchema(selectedConnection)`, and gains a small status pip + refresh button next to the connection picker.

## Data flow

### Window open

```
SqlApp mounts
  → load_settings → pick connection
  → useSqlSchema(connectionName) starts:
      (a) cache_load_sql_schema(connectionName)  ── sqlite, ~5ms ──► apply (cached)
      (b) fetch_sql_schema(connectionName)        ── tiberius, ~200ms-2s ──► save → re-apply (fresh)
  → SqlEditor renders with schema (becomes smarter mid-session if cache was empty)
```

### Connection switch

Same flow, keyed by the new connection name. The previous connection's cache row remains for next time. `useEffect` cleanup uses a `cancelled` flag so an in-flight fetch from the old connection can't overwrite state for the new one.

### Fresh-fetch failure

If `fetch_sql_schema` rejects (network unreachable, auth failure, server down) and we have a cache hit, the editor keeps the cached schema and `status` stays `cached`. Autocomplete continues working from cache instead of going dark. If there's no cache, `status` becomes `error` and the user sees a soft warning in the connection bar.

### Manual refresh

Refresh button next to the connection picker calls `refresh()` from the hook, which re-runs step (b) regardless of cache state. Used after the user adds a table and wants suggestions to know about it.

## Rust details

### Storage

In `cache::cache_init`, append to the existing `execute_batch`:

```sql
CREATE TABLE IF NOT EXISTS cached_sql_schema (
  connection_name TEXT PRIMARY KEY,
  database_name   TEXT NOT NULL,
  json_data       TEXT NOT NULL,
  cached_at       TEXT NOT NULL
);
```

`cache_load_sql_schema(connection_name) -> Option<SqlSchemaPayload>` returns `None` on cache miss, deserializes `json_data` on hit.

`cache_save_sql_schema(connection_name, payload)` UPSERTs a row with the current ISO-8601 timestamp.

### Fetch

```sql
SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
ORDER BY TABLE_SCHEMA, TABLE_NAME;

SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION
FROM INFORMATION_SCHEMA.COLUMNS
ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;
```

Two flat queries instead of a join: easier to decode, slightly faster, no UDT exposure (INFORMATION_SCHEMA is all built-in types so the tiberius UDT-panic risk doesn't apply, but the existing panic-isolation pattern is kept anyway for consistency).

### Payload shape

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlColumn {
    pub name: String,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SqlTableKind {
    Table,
    View,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlTable {
    pub schema: String,
    pub name: String,
    pub kind: SqlTableKind,
    pub columns: Vec<SqlColumn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlSchemaPayload {
    pub database: String,
    pub fetched_at: String,
    pub tables: Vec<SqlTable>,
}
```

Serialized to JSON for storage (`json_data` column) and over the IPC boundary.

## Frontend details

### Dependencies (added to `src/BorgDock.Tauri/package.json`)

- `@codemirror/state`
- `@codemirror/view`
- `@codemirror/lang-sql`
- `@codemirror/autocomplete`
- `@codemirror/commands`
- `codemirror`

Roughly +50–60 KB gz. No theming dependency — `EditorView.theme()` inline-binds to existing `--color-*` CSS variables so the editor matches the rest of the SQL window.

### `SqlEditor.tsx` interface

```ts
interface SqlEditorProps {
  value: string;
  onChange: (next: string) => void;
  onRunQuery: () => void;
  schema: SqlSchemaPayload | null;
  height: number;
}
```

Builds one `EditorState` and a `Compartment` for the SQL config:

```ts
const sqlCompartment = new Compartment();

// initial extension list
[
  basicSetup,
  sqlCompartment.of(sql({ dialect: MSSQL, schema: toCmSchema(schema) })),
  keymap.of([{ key: 'Mod-Enter', run: () => { onRunQuery(); return true; } }]),
  EditorView.updateListener.of((u) => { if (u.docChanged) onChange(u.state.doc.toString()); }),
  EditorView.theme({ /* bind to --color-* */ }),
]
```

On schema update:

```ts
view.dispatch({
  effects: sqlCompartment.reconfigure(
    sql({ dialect: MSSQL, schema: toCmSchema(schema) })
  ),
});
```

`toCmSchema(payload)` converts to CodeMirror's expected shape:

```ts
{
  "Users":      ["id", "email", "createdAt"],
  "dbo.Users":  ["id", "email", "createdAt"],   // schema-qualified key for completion after "dbo."
  "Orders":     ["id", "userId", "total"],
  "dbo.Orders": ["id", "userId", "total"],
}
```

Both bare and `schema.name` keys are emitted so CodeMirror suggests `Users` after `FROM ` and `dbo.Users` after `FROM dbo.`. Views are folded into the same map alongside tables.

### Keybindings

- `Ctrl/Cmd+Enter` → run query (precedence over CodeMirror's `Mod-Enter`)
- `Ctrl+Space` → force-open completion (CodeMirror default)
- `Tab` / `Enter` on highlighted suggestion → accept (CodeMirror default; only fires when popup is open)
- `Esc` → if popup open, CodeMirror closes it; if not, propagates up to the existing window-close handler in `SqlApp.tsx`

### `useSqlSchema` hook

```ts
type SchemaStatus = 'cold' | 'cached' | 'refreshing' | 'fresh' | 'error';

function useSqlSchema(connectionName: string) {
  const [schema, setSchema] = useState<SqlSchemaPayload | null>(null);
  const [status, setStatus] = useState<SchemaStatus>('cold');

  const runFresh = useCallback(async (cancelledRef: { current: boolean }) => {
    setStatus((prev) => (prev === 'cached' ? 'refreshing' : 'cold'));
    try {
      const fresh = await invoke<SqlSchemaPayload>('fetch_sql_schema', { connectionName });
      if (cancelledRef.current) return;
      setSchema(fresh);
      setStatus('fresh');
      await invoke('cache_save_sql_schema', { connectionName, payload: fresh });
    } catch {
      if (cancelledRef.current) return;
      setStatus((prev) => (prev === 'refreshing' ? 'cached' : 'error'));
    }
  }, [connectionName]);

  useEffect(() => {
    if (!connectionName) return;
    const cancelledRef = { current: false };

    (async () => {
      const cached = await invoke<SqlSchemaPayload | null>(
        'cache_load_sql_schema',
        { connectionName },
      );
      if (cancelledRef.current) return;
      if (cached) { setSchema(cached); setStatus('cached'); }
      await runFresh(cancelledRef);
    })();

    return () => { cancelledRef.current = true; };
  }, [connectionName, runFresh]);

  const refresh = useCallback(() => {
    const cancelledRef = { current: false };
    runFresh(cancelledRef);
  }, [runFresh]);

  return { schema, status, refresh };
}
```

The `cancelledRef` flag set during effect cleanup prevents an in-flight fetch from writing state after a connection switch — and gates the post-fetch `cache_save_sql_schema` call so a stale payload never lands in the wrong cache row.

### Status indicator (next to connection picker in `SqlApp.tsx`)

| Status        | UI                                                      |
| ------------- | ------------------------------------------------------- |
| `cold`        | small spinner + "Loading schema…"                       |
| `cached`      | invisible                                               |
| `refreshing`  | faint pulsing dot                                       |
| `fresh`       | invisible                                               |
| `error`       | ⚠ icon, tooltip: "Couldn't refresh schema (using cache)" |

Manual refresh button: existing icon set, fires `refresh()`. Disabled while `cold` or `refreshing`.

## What stays unchanged in `SqlApp.tsx`

- Connection picker, run button, status bar, copy buttons
- Drag-to-resize handle and `editorHeight` state
- Query persistence to `localStorage` (`borgdock-sql-last-query`)
- Window position persistence
- Esc-to-close handler (bubbles from CodeMirror when popup is closed)
- Click-outside-rows clears selection
- Results rendering, error display, empty-results state

## Edge cases

- **No connection selected.** Hook is a no-op (early-return on empty `connectionName`); editor renders with `schema: null`, falling back to keyword-only completion.
- **Connection has zero tables (empty database).** Fetch succeeds with `tables: []`. Cache stores it. Editor still gets keyword completion.
- **Schema cache exists but the connection was deleted from settings.** Stale row in sqlite is harmless — never read because the connection isn't selectable. We don't bother with reactive cleanup; the cache footprint is small.
- **User adds a table during a session.** Click refresh button. Fresh fetch runs, popup updates within a few hundred ms.
- **Connection swap while a fresh fetch is in flight.** The `cancelled` flag in the effect cleanup ensures only the latest connection's payload reaches state.
- **First-ever launch with no cache, slow database.** `cold` status with spinner shows for the duration of the fetch (a few seconds at most). User can still type — autocomplete just doesn't suggest tables until data lands.

## Testing strategy

- **Rust unit:** mock-free integration tests against a known DB instance are out of scope; trust the existing `execute_sql_query` test patterns. The new code is mostly query string + serde.
- **Manual smoke test:** open SQL window, switch connections, type `SELECT * FROM ` → verify popup. Add a column to a table, click refresh, type the table name → verify new column suggested. Disconnect network, reload window → verify cached suggestions still appear.
- **Type checking + build:** `npm run build` and `cargo check` (with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` if running from Git Bash, per CLAUDE.md).

## Open questions

None at spec time. Implementation plan will sequence the Rust changes before the frontend swap so the editor can integrate against a real backend rather than a stub.
