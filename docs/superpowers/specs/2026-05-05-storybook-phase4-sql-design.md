# Storybook Phase 4 — SqlApp

**Status:** design approved, plan pending
**Scope:** add an exhaustive Storybook catalog for `src/BorgDock.Tauri/src/components/sql/SqlApp.tsx` (the window mounted by `sql-main.tsx`), extending the Phase 1+2+3 mock layer with three small Tauri-window methods (`outerPosition`, `setPosition`, `onMoved`) and one new alias (`@tauri-apps/plugin-clipboard-manager`). Production code stays byte-identical.

## Why

Per `docs/superpowers/specs/storybook-roadmap.md`, this is the fourth window to be storied. SqlApp is a deliberate Phase 4 pick because:

- It's an M-sized but architecturally rich window — toolbar + collapsible rail + CodeMirror editor + virtualised result grid + modal — so its catalog forces every shared primitive (`Button`, `Pill`, `Kbd`, `IconButton`, `WindowTitleBar`, `WindowStatusBar`) into design review at once.
- It exercises **two Tauri surfaces no prior phase touched**: `getCurrentWindow().{outerPosition, setPosition, onMoved}` for window-position persistence (any future window restoring its own geometry will reuse these) and `@tauri-apps/plugin-clipboard-manager.writeText` for the result-copy actions (the next phase that needs clipboard output — PR Detail, File Viewer — gets it for free).
- It introduces a **panic-recovered error path** (`tiberius` UDT panics surface as friendly `Err(string)` via `tokio::spawn`'s `JoinError::is_panic()`). The story catalog needs to render that recovered error so design review can verify the surface stays calm under panics — useful precedent before the much-bigger Settings window which also has long-running invokes that can fault.
- Three downstream pending windows (File Palette, File Viewer, PR Detail) all need clipboard support. Adding it once here amortises the work.

## Non-Goals

- Per-component stories for `ResultsTable`, `ResultsPanel`, `SnippetsRail`, `SqlEditor`, `SaveSnippetDialog` — deferred to the cross-cutting "component-level stories" phase noted in the roadmap.
- Visual regression integration / Chromatic / Storybook test-runner — still deferred.
- Hero-shot pipeline integration — later phase.
- Touching any production file under `src/components/sql/`, `src/types/sql-schema.ts`, `src/types/settings.ts`, `src/utils/parse-error.ts`, or `src/sql-main.tsx`.
- Stories that drive CodeMirror autocomplete dropdowns. The editor mounts and renders — its keymap and schema integration are tested elsewhere; adding play-driven IME/autocomplete stories is brittle and out of scope.
- Mocking the full `@tauri-apps/plugin-clipboard-manager` surface (`readText`, image copy, MIME variants). Only `writeText` is stubbed; SqlApp uses nothing else.
- Stories for `localStorage` corruption (the production code already swallows JSON parse errors silently and falls back to defaults — no user-visible state to story).

## Constraints

- **No production code changes.** Verified via `git diff origin/master...storybook-phase4-sql -- src/BorgDock.Tauri/src/components/sql src/BorgDock.Tauri/src/types/sql-schema.ts src/BorgDock.Tauri/src/types/settings.ts src/BorgDock.Tauri/src/utils/parse-error.ts src/BorgDock.Tauri/src/sql-main.tsx ':(exclude)src/BorgDock.Tauri/src/components/sql/__fixtures__' ':(exclude)src/BorgDock.Tauri/src/components/sql/*.stories.tsx'` showing zero lines.
- Storybook 9 + React-Vite + Tailwind v4 setup from prior phases stays as-is. Only additive changes to `.storybook/`.
- The control surface (`window.__borgdock_storybook_tauri`) gains zero new fields — `outerPosition` / `setPosition` reuse a tiny new sub-record on `windowSize` (`x`, `y`), and `onMoved` reuses the existing `channels` map keyed under a synthetic `'__window.onMoved'` channel. Backwards-compatible.
- All Phase 1+2+3 stories continue to render unmodified. The `tauri-api-window.ts` extension adds methods only; the new `tauri-plugin-clipboard-manager` mock + alias is purely additive.

## Architecture

### File layout

```
src/BorgDock.Tauri/
├── .storybook/
│   ├── main.ts                                      # +1 alias entry: @tauri-apps/plugin-clipboard-manager
│   └── mocks/
│       ├── control.ts                               # +windowSize.x/y; +clipboardWrites: string[]
│       ├── tauri-api-window.ts                      # +outerPosition, +setPosition, +onMoved
│       └── tauri-plugin-clipboard-manager.ts        # NEW
└── src/components/sql/
    ├── __fixtures__/
    │   └── sql-data.ts                              # synthetic SqlServerConnection / ResultSet / SqlSchema / SqlSnippet factories
    └── SqlApp.stories.tsx                           # ~22 stories
```

### Mock additions

#### `tauri-api-window.ts` extension

`getCurrentWindow()` gains the methods SqlApp calls on top of the Phase 3 surface:

```ts
interface MockWindow {
  // Phase 2
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  // Phase 3
  hide(): Promise<void>;
  setSize(size: { width: number; height: number }): Promise<void>;
  innerSize(): Promise<{ width: number; height: number }>;
  scaleFactor(): Promise<number>;
  // Phase 4
  outerPosition(): Promise<{ x: number; y: number }>;
  setPosition(pos: { x: number; y: number } | { type: 'Logical' | 'Physical'; x: number; y: number }): Promise<void>;
  onMoved(cb: (event: { payload: { x: number; y: number } }) => void): Promise<() => void>;
}
```

- `outerPosition()` reads `getControl().windowSize.{x, y}` (defaults to `{ x: 100, y: 100 }`) and returns it in physical units (multiplied by `scaleFactor` to mirror real Tauri).
- `setPosition(pos)` accepts either a plain object or a `LogicalPosition`/`PhysicalPosition` instance (both expose `.x` / `.y`); records `'window.setPosition'` invocation; updates `getControl().windowSize.{x, y}`. Logical inputs are scaled up; Physical pass through.
- `onMoved(cb)` registers the listener under the synthetic channel `'__window.onMoved'` in `getControl().channels`. Returns an `unlisten` that removes it. Stories drive moves via `getControl().emit('__window.onMoved', { x, y })`.

The `'__window.'` channel-key prefix is reserved for `getCurrentWindow()` listener emulation. Same pattern can be reused if a future phase needs `onCloseRequested`, `onResized`, etc.

#### `tauri-plugin-clipboard-manager.ts` (NEW)

```ts
// .storybook/mocks/tauri-plugin-clipboard-manager.ts
//
// Drop-in replacement for @tauri-apps/plugin-clipboard-manager. Only
// writeText is stubbed (SqlApp's only consumer). Writes are recorded
// in getControl().clipboardWrites so stories can assert what was
// copied without poking at the real OS clipboard.

import { getControl } from './control';

export async function writeText(text: string): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'clipboard.writeText', args: { text } });
  ctrl.clipboardWrites.push(text);
}
```

`readText` is intentionally absent — SqlApp doesn't read the clipboard, and adding an unused mock would be dead code. The next window that needs `readText` adds it then.

#### `control.ts` extensions

```ts
export interface WindowSizeState {
  width: number;
  height: number;
  scaleFactor: number;
  // Phase 4 additions — outer-position state for getCurrentWindow().outerPosition / setPosition.
  x: number;
  y: number;
}

export interface StorybookTauriControl {
  // existing
  channels: Map<string, Set<ChannelListener>>;
  invocations: InvokeRecord[];
  invokeResponses: Record<string, InvokeResponse>;

  // Phase 2
  windowState: { isMaximized: boolean };
  pluginStore: Map<string, Map<string, unknown>>;
  pluginStoreBehavior: PluginStoreBehavior;
  appVersion: string | null;
  releasesOverride: Release[] | null;

  // Phase 3
  windowSize: WindowSizeState;       // x/y are Phase 4 additions on this same record
  monitorState: MonitorState | null;

  // Phase 4
  clipboardWrites: string[];

  reset(): void;
  emit(channel: string, payload: unknown): void;
}
```

`reset()` resets `windowSize.x = 100, windowSize.y = 100` and `clipboardWrites.length = 0`. The defaults match real-world packaged-build positions — small enough to clearly differ from a `setPosition`-driven story value.

#### `.storybook/main.ts` aliases

Add one entry:

```ts
'@tauri-apps/plugin-clipboard-manager': resolve(here, 'mocks/tauri-plugin-clipboard-manager.ts'),
```

### Stories file pattern

`SqlApp.stories.tsx` follows the Phase 2/3 precedent:

- A `SqlHarness` wrapper component reads `parameters.sql.*` from props (passed via `args`) and seeds `getControl()` synchronously before mount. The global `reset()` in `preview.ts` already runs first.
- Per-story `parameters.sql`: `{ settings, schemaResponse, executeResponse, snippetsResponse, savedPosition, monitorState? }`.
  - `settings`: the `AppSettings` object the `load_settings` invoke returns. The harness uses `makeSettings(connections, ui?)` from the fixtures.
  - `schemaResponse`: either a static `SqlSchemaPayload | null` or a function `(args) => SqlSchemaPayload | Promise<…>` (function form unblocks the SchemaError / SchemaPending stories).
  - `executeResponse`: either a static `QueryResult` or a function returning a value or rejection — covers Running / Result / Error / PanicRecovered.
  - `snippetsResponse`: an array of `SqlSnippet` returned from `sql_snippets_list`. The harness also pre-populates `localStorage[FALLBACK_STORAGE_KEY]` so the in-Tauri detection (`'__TAURI_INTERNALS__' in window`) doesn't matter — stories work either way.
  - `savedPosition`: optional `{ x, y }` written to `localStorage['borgdock-sql-position']` before mount. The "saved-position-restore" story uses it.
- Log-only commands the harness sets `undefined` so the `tauri-core` mock returns gracefully: `cache_load_sql_schema`, `cache_save_sql_schema`, `window_ready`, `sql_snippets_save`, `sql_snippets_delete`.
- The harness also wipes the `SqlApp` localStorage keys (`borgdock-sql-position`, `borgdock-sql-last-query`, `borgdock.sql.railWidth`, `borgdock.sql.railCollapsed`, `borgdock.sql.editorHeight`, `borgdock.sql.activeSnippet`, `borgdock.sql.snippets`) before each story render. Without this, layout state leaks between stories on the same Storybook session.

Stories that exercise `onMoved`-driven persistence use `play`:

```ts
play: async () => {
  const { waitFor, expect } = await import('storybook/test');
  getControl().emit('__window.onMoved', { x: 240, y: 180 });
  await waitFor(() => {
    expect(localStorage.getItem('borgdock-sql-position')).toContain('240');
  });
},
```

### Theme

Existing global toolbar (`light` / `dark` / `system`) covers it. SqlApp uses `documentElement.classList.toggle('dark', …)` driven by `settings.ui.theme`. The Storybook toolbar handler in `preview.ts` mirrors this, so every SqlApp story responds to the toolbar correctly without per-story wiring.

### Fixtures

`src/components/sql/__fixtures__/sql-data.ts`:

```ts
import type { AppSettings, SqlServerConnection, UiSettings } from '@/types/settings';
import type { SqlSchemaPayload, SqlTable } from '@/types/sql-schema';
import type { SqlSnippet } from '../snippet-types';

// Mirror SqlApp's local interfaces (not exported from production).
export interface ResultSet {
  columns: string[];
  rows: (string | null)[][];
  rowCount: number;
  truncated: boolean;
}
export interface QueryResult {
  resultSets: ResultSet[];
  executionTimeMs: number;
  totalRowCount: number;
  rowsAffected: number | null;
}

// Factories
export function makeConnection(overrides?: Partial<SqlServerConnection>): SqlServerConnection;
export function makeSnippet(overrides?: Partial<SqlSnippet>): SqlSnippet;
export function makeColumn(name: string, dataType?: string): { name: string; dataType: string };
export function makeTable(overrides?: Partial<SqlTable>): SqlTable;
export function makeSchema(overrides?: Partial<SqlSchemaPayload>): SqlSchemaPayload;
export function makeSettings(connections: SqlServerConnection[], ui?: Partial<UiSettings>): AppSettings;
export function makeResultSet(columns: string[], rows: (string | null)[][], opts?: { truncated?: boolean }): ResultSet;
export function makeQueryResult(resultSets: ResultSet[], opts?: { executionTimeMs?: number; rowsAffected?: number | null }): QueryResult;

// Curated connections
export const connBorgDockDev:   SqlServerConnection;     // 'BorgDock dev', sql auth
export const connHorizonProd:   SqlServerConnection;     // 'Horizon prod',  windows auth
export const connLongName:      SqlServerConnection;     // very long display name
export const connNoAuth:        SqlServerConnection;     // missing username — exotic edge case for the toolbar layout

// Curated schemas
export const schemaSmall:       SqlSchemaPayload;        // 3 tables, 4-6 columns each
export const schemaMedium:      SqlSchemaPayload;        // ~30 tables
export const schemaEmpty:       SqlSchemaPayload;        // 0 tables — schema fetched but database has none

// Curated snippet sets
export const snippetsEmpty:     SqlSnippet[];            // []
export const snippetsFew:       SqlSnippet[];            // 3 snippets, 1 starred
export const snippetsMany:      SqlSnippet[];            // 25+ snippets, mixed stars
export const snippetActiveQuery: SqlSnippet;             // contents matches the default query in 'WithActiveSnippetClean'

// Curated query results
export const resultEmpty:       QueryResult;             // 1 result set, 0 rows
export const resultSingleRow:   QueryResult;             // 1x1 grid
export const resultSmallSelect: QueryResult;             // 4 cols, 12 rows
export const resultLargeSelect: QueryResult;             // 5 cols, 5000 rows (virtualised)
export const resultTruncated:   QueryResult;             // 5 cols, 1000 rows, truncated=true
export const resultMultiSet:    QueryResult;             // 3 result sets
export const resultUpdate:      QueryResult;             // rowsAffected=42, no resultSets
export const resultNullRichness: QueryResult;            // mixed NULL / empty-string / value cells

// Sample queries
export const sampleSelectQuery:  string;                 // a 4-line SELECT — used by Idle / Snippet stories
export const sampleLongQuery:    string;                 // 60-line CTE — used by EditorTallContent
```

`SqlServerConnection`, `AppSettings`, `UiSettings`, `SqlSchemaPayload`, `SqlTable`, `SqlSnippet` are imported from production types — never redeclared. `ResultSet` and `QueryResult` mirror local types in `SqlApp.tsx` (the production ones aren't exported). Same drift-protection precedent as Phase 3's `WorktreeEntry`.

## Story Catalog (exhaustive — 22 stories)

### Loading / connection axis (4)
1. **Loading** — `load_settings` returns a never-resolving promise. Pre-render UI: empty toolbar, "no connection" status.
2. **NoConnections** — `settings.sql.connections = []` — toolbar shows "No connections — open Settings", Run button disabled.
3. **OneConnection** — single connection, schema fetches successfully, no last-used; that one is auto-selected.
4. **MultipleConnections** — three connections, `lastUsedConnection` honoured, dropdown populated.

### Schema axis (3)
5. **SchemaPending** — `cache_load_sql_schema` returns null, `fetch_sql_schema` returns a never-resolving promise. Header shows the spinner + "Loading".
6. **SchemaCached** — `cache_load_sql_schema` returns `schemaSmall`, `fetch_sql_schema` returns the same payload after 200ms. Header transitions cached → refreshing → fresh.
7. **SchemaError** — `cache_load_sql_schema` returns null, `fetch_sql_schema` rejects. Header shows "Schema error".

### Editor / snippets axis (4)
8. **NoSnippetsEmptyEditor** — `snippetsResponse: snippetsEmpty`, no `borgdock-sql-last-query`. Editor empty, snippet count 0, rail empty-state copy visible.
9. **NoSnippetsDirtyEditor** — same as above but `borgdock-sql-last-query = sampleSelectQuery`. Editor pre-populated, "● modified" + "unsaved" pill visible (no active snippet).
10. **WithActiveSnippetClean** — `snippetsResponse: snippetsFew`, `borgdock.sql.activeSnippet` localStorage = first snippet's id, `borgdock-sql-last-query = snippetActiveQuery.body`. No "modified" pill.
11. **WithActiveSnippetDirty** — same setup, but query in localStorage differs from snippet body. "● modified" appears.

### Run / result axis (5)
12. **ResultIdle** — connections + schema OK, query empty, `hasRun=false`. Results panel shows "Ready when you are".
13. **ResultRunning** — `executeResponse` returns a never-resolving promise; `play` clicks Run. Spinner visible in toolbar Run button + "running…" pill in results header.
14. **ResultSuccessSelect** — `executeResponse: resultSmallSelect`. Header shows "12 rows", grid populated.
15. **ResultSuccessUpdate** — `executeResponse: resultUpdate`. Header shows "42 affected", grid empty (`populated.length === 0` branch with `rowsAffected != null`).
16. **ResultMultiSet** — `executeResponse: resultMultiSet`. Three "Result N" headers, three sub-grids.

### Error / panic axis (3)
17. **ResultError** — `executeResponse` rejects with a parsed-error string ("Login failed for user 'sa'."). Pill="query failed", error row visible.
18. **ResultPanicRecovered** — `executeResponse` rejects with the literal panic-recovered message used by `sql::execute_sql_query` (`"Internal error: the query result contains an unsupported column type. Try selecting specific columns instead of *."`). Documents the panic path's surface.
19. **ResultTruncated** — `executeResponse: resultTruncated`. "truncated" badge visible in results header.

### Layout / interaction axis (3)
20. **RailCollapsed** — `localStorage['borgdock.sql.railCollapsed'] = '1'` before mount. Snippets rail in collapsed state with the vertical-pip stack.
21. **CopyValuesRoundtrip** — `executeResponse: resultSmallSelect`. `play` clicks Run, then "Values"; story asserts `getControl().clipboardWrites[0]` contains a tab-separated row from the result.
22. **PositionPersistedAfterMove** — `play` emits `__window.onMoved` with `{ x: 240, y: 180 }` after mount; asserts `localStorage['borgdock-sql-position']` contains the new x. (Saved-position restore is also implicit at every story's mount via the `setPosition` mock; an additional `SavedPositionRestoreOnMount` story would be redundant — covered by virtue of the lifecycle running.)

**Total: 22 stories.**

The catalog deliberately drops a few axes the brainstorm flagged:
- **Keyboard shortcuts** — Esc/Ctrl+S/Ctrl+Enter are exercised implicitly by the existing `useEffect` keymaps. Adding play stories that simulate keyboard events on top of CodeMirror is fragile in jsdom-free Storybook. Coverage of keyboard handlers belongs to the per-component CodeMirror story phase.
- **Theme** — the global toolbar already toggles every story; no per-story dark-mode counterparts.
- **Settings panic-recovered** path — same surface as `ResultPanicRecovered`; one story documents the design and the spec mentions that the failure is friendly.

## Tooling additions

### `package.json`
No changes. Storybook deps installed in Phase 1 are sufficient. `storybook/test` is bundled with `storybook` 9.x already.

### `tsconfig.json`
The fixtures and stories paths are already covered by the existing globs (`src/**/*.tsx`). No changes.

### Biome
Already extended to cover `.storybook/`. Nothing to add.

### Test suites
- **Vitest**: untouched. The fixtures file is plain TypeScript that may incidentally be imported by future tests, but Phase 4 doesn't add any vitest tests.
- **Playwright**: untouched. No e2e suite for SqlApp today; if one lands later, it drives the real Tauri webview.

## Risks & mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Adding `outerPosition` / `setPosition` / `onMoved` to the existing `MockWindow` interface silently breaks Phase 2/3 stories that don't set the new fields | low | Methods read defaults off `getControl().windowSize` (`x: 100, y: 100, scaleFactor: 1`) — every prior story keeps working unmodified. Acceptance gate: every Phase 1/2/3 story still renders. |
| `setPosition` accepting either a plain object or a `LogicalPosition` instance creates a brittle type-narrowing path | low | The mock duck-types — both inputs expose `.x` / `.y`. Dynamic-imported real `LogicalPosition` from the Phase 3 mock has `type: 'Logical'` which the mock branches on for the scale-factor multiply. Documented in the implementation. |
| `onMoved`'s synthetic `'__window.onMoved'` channel collides with a real Tauri event of the same name | very low | Tauri's real event names use the `tauri://` URI scheme; `'__window.onMoved'` is unmistakably Storybook-internal. Adding a comment in the mock makes intent explicit. |
| `localStorage` keys leak between stories | medium | Harness explicitly clears all SqlApp-owned keys before mount. Documented in the harness's comment block. |
| CodeMirror tries to render in Storybook's iframe and fails to read CSS variables | low | The Vite alias map and the global `index.css` import in `preview.ts` cover the editor's CSS variable usage. Phase 1 already validated this for FlyoutApp's CodeMirror-free chrome; the `SqlEditor.tsx` test suite renders identically under jsdom. If the editor fails to mount, stories fall back to a host div with no content — visible in design review, not a blocker. |
| `useVirtualizer` (TanStack) needs a measurable scroll element; Storybook's `layout: 'fullscreen'` may lay it out at zero height | low | The harness wraps `<SqlApp />` in a fixed-size container (`width: 1280, height: 800`) so the virtualiser has dimensions. Same pattern as Phase 3. |
| `sql_snippets_list` returns `undefined` when no story sets it, so `useSnippets` falls back to `localStorage` and gets stale data from a previous story | low | Harness clears `borgdock.sql.snippets` localStorage key on every mount. Mock returns `[]` when `invokeResponses['sql_snippets_list']` is unset. |
| The 5000-row `resultLargeSelect` blows up CI render time | low | The virtualiser only renders the viewport's worth of rows (~30) regardless of total count. Verified mentally; if it bloats CI, drop to 500 rows — still demonstrates virtualisation. |
| `borgdock-sql-position`'s `setPosition` call reads `screen.width` / `screen.height` to validate the saved coords are on-screen | low | jsdom's `screen` defaults work; the position fixture uses values comfortably inside any reasonable monitor. |

## Acceptance criteria

1. `cd src/BorgDock.Tauri && npm run storybook` boots without errors. All 22 SqlApp stories render alongside Phase 1+2+3 stories (no regressions).
2. Light/dark toolbar toggle re-renders every SqlApp story without reload.
3. `npm run build-storybook` completes cleanly.
4. `npm run lint` and `npm run test` pass on macOS and Windows CI runners.
5. **Production code is byte-identical** — verified by:
   ```bash
   git diff origin/master...storybook-phase4-sql -- \
     src/BorgDock.Tauri/src/sql-main.tsx \
     src/BorgDock.Tauri/src/components/sql \
     ':(exclude)src/BorgDock.Tauri/src/components/sql/__fixtures__' \
     ':(exclude)src/BorgDock.Tauri/src/components/sql/*.stories.tsx'
   ```
   shows zero lines.
6. Mock layer ends with: one new file (`.storybook/mocks/tauri-plugin-clipboard-manager.ts`), one new alias (`@tauri-apps/plugin-clipboard-manager`), `tauri-api-window.ts` extended with `outerPosition` / `setPosition` / `onMoved`, `control.ts` gains `windowSize.x` / `windowSize.y` and `clipboardWrites: string[]`.
7. The roadmap (`docs/superpowers/specs/storybook-roadmap.md`) is updated in the same PR:
   - SQL row moves Pending → Done with spec/plan/PR links.
   - "Mock layer extensions" gains `@tauri-apps/plugin-clipboard-manager → mocks/tauri-plugin-clipboard-manager.ts` and a one-line note that `tauri-api-window` now also exposes `outerPosition` / `setPosition` / `onMoved` and that `control` records `clipboardWrites`.
8. CI: vitest green on macOS and Windows. Playwright is allowed to fail (pre-existing flakiness — established Phase 2/3 precedent).

## What comes next (out of scope here)

- **Phase 5 candidate:** Agent Overview (PR #17 in flight, parallel work) and Work Item Detail (PR #16 in flight, parallel work) are already lined up. After those, File Palette and Work Item Palette become cheap because the palette / `currentMonitor` / `setSize` mock infrastructure has been in place since Phase 3, and the clipboard mock from this phase covers File Viewer's primary side-effect.
- **Component-level stories** for `ResultsTable`, `ResultsPanel`, `SnippetsRail`, `SqlEditor`, `SaveSnippetDialog` — easier now that the window-level catalog surfaces every realistic state.
- **Visual regression tooling decision** — three windows storied was the threshold the roadmap set; with this phase landing it's four. The decision becomes the next cross-cutting workstream.
