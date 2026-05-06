# Storybook Phase 4 — SqlApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 22 exhaustive Storybook stories for `SqlApp.tsx` and extend the existing Tauri mock layer with three window methods (`outerPosition`, `setPosition`, `onMoved`) and one new alias (`@tauri-apps/plugin-clipboard-manager`), all without changing a byte of production code.

**Architecture:** Add one mock module under `.storybook/mocks/` (`tauri-plugin-clipboard-manager.ts`) and one Vite alias entry in `.storybook/main.ts`. Extend `tauri-api-window.ts` with three new methods on `getCurrentWindow()`. The control singleton (`window.__borgdock_storybook_tauri`) gains two fields on `windowSize` (`x`, `y`) and a top-level `clipboardWrites: string[]`. Stories drive state via `parameters.sql.*` consumed by a `SqlHarness` wrapper.

**Tech Stack:** Storybook 9 + `@storybook/react-vite`, Vite 6, React 19, Tailwind v4, TypeScript 5.8 (already installed in Phase 1).

**Spec:** `docs/superpowers/specs/2026-05-05-storybook-phase4-sql-design.md`
**Roadmap:** `docs/superpowers/specs/storybook-roadmap.md`

**All paths in this plan are relative to `src/BorgDock.Tauri/` unless explicitly absolute.**

---

## Task 0: Verify branch state

**Files:** none

- [ ] **Step 1: Verify clean tree on storybook-phase4-sql, rebased on origin/master**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git status && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD
```
Expected: branch `storybook-phase4-sql`, clean tree, HEAD that includes the spec commit on top of `origin/master` (`9308f2e3...`).

---

## Task 1: Extend control surface

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/control.ts`

- [ ] **Step 1: Replace the file with the extended version**

Full new content of `.storybook/mocks/control.ts`:

```ts
// .storybook/mocks/control.ts
//
// Singleton control surface used by the Tauri mocks and by story decorators.
// Lives on window so dynamic-imported mocks and the React tree can both reach it.

import type { Release } from '../../src/types/whats-new';

export interface InvokeRecord {
  command: string;
  args?: unknown;
}

export type ChannelListener = (event: { payload: unknown }) => void;

export type PluginStoreBehavior = 'normal' | 'pending' | 'reject';

export type InvokeResponse = unknown | ((args: unknown) => unknown);

export interface MonitorState {
  size: { width: number; height: number };
  scaleFactor: number;
}

export interface WindowSizeState {
  width: number;
  height: number;
  scaleFactor: number;
  // Phase 4 additions — outer-position state for getCurrentWindow().outerPosition / setPosition.
  x: number;
  y: number;
}

export interface StorybookTauriControl {
  channels: Map<string, Set<ChannelListener>>;
  invocations: InvokeRecord[];
  invokeResponses: Record<string, InvokeResponse>;

  // Phase 2 additions
  windowState: { isMaximized: boolean };
  pluginStore: Map<string, Map<string, unknown>>;
  pluginStoreBehavior: PluginStoreBehavior;
  appVersion: string | null;
  releasesOverride: Release[] | null;

  // Phase 3 additions
  windowSize: WindowSizeState;
  monitorState: MonitorState | null;

  // Phase 4 additions
  clipboardWrites: string[];

  reset(): void;
  emit(channel: string, payload: unknown): void;
}

declare global {
  interface Window {
    __borgdock_storybook_tauri?: StorybookTauriControl;
  }
}

const DEFAULT_WINDOW_SIZE: WindowSizeState = {
  width: 480,
  height: 600,
  scaleFactor: 1,
  x: 100,
  y: 100,
};

function createControl(): StorybookTauriControl {
  const ctrl: StorybookTauriControl = {
    channels: new Map(),
    invocations: [],
    invokeResponses: {},

    windowState: { isMaximized: false },
    pluginStore: new Map(),
    pluginStoreBehavior: 'normal',
    appVersion: null,
    releasesOverride: null,

    windowSize: { ...DEFAULT_WINDOW_SIZE },
    monitorState: null,

    clipboardWrites: [],

    reset() {
      ctrl.channels.clear();
      ctrl.invocations.length = 0;
      for (const k of Object.keys(ctrl.invokeResponses)) delete ctrl.invokeResponses[k];
      ctrl.windowState.isMaximized = false;
      ctrl.pluginStore.clear();
      ctrl.pluginStoreBehavior = 'normal';
      ctrl.appVersion = null;
      ctrl.releasesOverride = null;
      ctrl.windowSize.width = DEFAULT_WINDOW_SIZE.width;
      ctrl.windowSize.height = DEFAULT_WINDOW_SIZE.height;
      ctrl.windowSize.scaleFactor = DEFAULT_WINDOW_SIZE.scaleFactor;
      ctrl.windowSize.x = DEFAULT_WINDOW_SIZE.x;
      ctrl.windowSize.y = DEFAULT_WINDOW_SIZE.y;
      ctrl.monitorState = null;
      ctrl.clipboardWrites.length = 0;
    },
    emit(channel, payload) {
      const set = ctrl.channels.get(channel);
      if (!set) return;
      for (const cb of set) cb({ payload });
    },
  };
  return ctrl;
}

export function getControl(): StorybookTauriControl {
  if (typeof window === 'undefined') {
    throw new Error('storybook tauri mock used outside browser');
  }
  if (!window.__borgdock_storybook_tauri) {
    window.__borgdock_storybook_tauri = createControl();
  }
  return window.__borgdock_storybook_tauri;
}
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add src/BorgDock.Tauri/.storybook/mocks/control.ts
git commit -m "$(cat <<'EOF'
storybook: extend control surface for phase 4 (window position + clipboard)

Adds windowSize.{x,y} for getCurrentWindow().{outerPosition,setPosition}
plus clipboardWrites: string[] for plugin-clipboard-manager.writeText.
reset() now wipes both. Foundation for the SqlApp catalog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `tauri-api-window` mock with position methods

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts`

- [ ] **Step 1: Replace the file with the extended version**

Full new content of `.storybook/mocks/tauri-api-window.ts`:

```ts
// .storybook/mocks/tauri-api-window.ts
//
// Drop-in replacement for @tauri-apps/api/window. Covers the surfaces
// every window storied so far uses:
//   - getCurrentWindow().close/minimize/maximize/unmaximize/isMaximized  (Phase 2)
//   - getCurrentWindow().hide/setSize/innerSize/scaleFactor              (Phase 3)
//   - getCurrentWindow().outerPosition/setPosition/onMoved               (Phase 4)
//   - currentMonitor()                                                   (Phase 3)
//
// hide() and close() are no-ops — without them, the Worktree palette's
// Esc-to-hide and the WhatsNew "Got it" button would unmount the
// Storybook iframe. setSize() updates the recorded windowSize so a
// follow-up innerSize() reflects the resize, but the iframe itself is
// unaffected (Storybook controls visible bounds).
//
// onMoved() registers under the synthetic channel '__window.onMoved'.
// Stories drive moves with getControl().emit('__window.onMoved', {x,y}).
// The '__window.' prefix is reserved for getCurrentWindow() listener
// emulation so future phases (onCloseRequested, onResized, etc.) can
// reuse the pattern without colliding with real Tauri event names.

import { getControl, type ChannelListener } from './control';

interface MockPhysicalSize {
  width: number;
  height: number;
}

interface MockPhysicalPosition {
  x: number;
  y: number;
}

interface PositionInput {
  x: number;
  y: number;
  // Optional discriminator from LogicalPosition / PhysicalPosition.
  type?: 'Logical' | 'Physical';
}

interface MockWindow {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  hide(): Promise<void>;
  setSize(size: { width: number; height: number }): Promise<void>;
  innerSize(): Promise<MockPhysicalSize>;
  scaleFactor(): Promise<number>;
  outerPosition(): Promise<MockPhysicalPosition>;
  setPosition(pos: PositionInput): Promise<void>;
  onMoved(cb: (event: { payload: MockPhysicalPosition }) => void): Promise<() => void>;
}

const ON_MOVED_CHANNEL = '__window.onMoved';

export function getCurrentWindow(): MockWindow {
  const ctrl = getControl();
  return {
    async close() {
      ctrl.invocations.push({ command: 'window.close' });
    },
    async minimize() {
      ctrl.invocations.push({ command: 'window.minimize' });
    },
    async maximize() {
      ctrl.invocations.push({ command: 'window.maximize' });
      ctrl.windowState.isMaximized = true;
    },
    async unmaximize() {
      ctrl.invocations.push({ command: 'window.unmaximize' });
      ctrl.windowState.isMaximized = false;
    },
    async isMaximized() {
      return ctrl.windowState.isMaximized;
    },
    async hide() {
      ctrl.invocations.push({ command: 'window.hide' });
    },
    async setSize(size) {
      ctrl.invocations.push({ command: 'window.setSize', args: size });
      ctrl.windowSize.width = size.width;
      ctrl.windowSize.height = size.height;
    },
    async innerSize() {
      // Production code expects PhysicalSize, so return width*scaleFactor.
      return {
        width: ctrl.windowSize.width * ctrl.windowSize.scaleFactor,
        height: ctrl.windowSize.height * ctrl.windowSize.scaleFactor,
      };
    },
    async scaleFactor() {
      return ctrl.windowSize.scaleFactor;
    },
    async outerPosition() {
      // Real Tauri returns PhysicalPosition. Multiply by scaleFactor so
      // SqlApp's `pos.x / scale` round-trip lands back at the logical x,y.
      return {
        x: ctrl.windowSize.x * ctrl.windowSize.scaleFactor,
        y: ctrl.windowSize.y * ctrl.windowSize.scaleFactor,
      };
    },
    async setPosition(pos) {
      ctrl.invocations.push({ command: 'window.setPosition', args: pos });
      // Logical inputs scale up; Physical pass through. A plain {x,y} with
      // no type is treated as Logical (matches the most common caller).
      const isPhysical = pos.type === 'Physical';
      const factor = isPhysical ? 1 : ctrl.windowSize.scaleFactor;
      ctrl.windowSize.x = (pos.x * factor) / ctrl.windowSize.scaleFactor;
      ctrl.windowSize.y = (pos.y * factor) / ctrl.windowSize.scaleFactor;
    },
    async onMoved(cb) {
      let set = ctrl.channels.get(ON_MOVED_CHANNEL);
      if (!set) {
        set = new Set();
        ctrl.channels.set(ON_MOVED_CHANNEL, set);
      }
      const wrapped: ChannelListener = (event) =>
        cb(event as { payload: MockPhysicalPosition });
      set.add(wrapped);
      return () => {
        set?.delete(wrapped);
      };
    },
  };
}

export async function currentMonitor() {
  const ctrl = getControl();
  return (
    ctrl.monitorState ?? {
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
    }
  );
}
```

- [ ] **Step 2: Verify tsc clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add src/BorgDock.Tauri/.storybook/mocks/tauri-api-window.ts
git commit -m "$(cat <<'EOF'
storybook: add outerPosition/setPosition/onMoved to window mock

SqlApp restores its saved window position on mount and persists every
move via a getCurrentWindow().onMoved listener. The onMoved listener
registers under the synthetic '__window.onMoved' channel so stories
can drive moves with getControl().emit. setPosition handles both plain
{x,y} objects and LogicalPosition/PhysicalPosition instances.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Mock `@tauri-apps/plugin-clipboard-manager`

**Files:**
- Create: `src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-clipboard-manager.ts`

- [ ] **Step 1: Write the mock**

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

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/.storybook/mocks/tauri-plugin-clipboard-manager.ts
git commit -m "$(cat <<'EOF'
storybook: mock @tauri-apps/plugin-clipboard-manager writeText

writeText pushes onto getControl().clipboardWrites and records a
'clipboard.writeText' invocation. readText is intentionally absent —
add it the day a window needs it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire the new alias in `.storybook/main.ts`

**Files:**
- Modify: `src/BorgDock.Tauri/.storybook/main.ts`

- [ ] **Step 1: Add the alias**

Replace the alias block in `viteFinal` so it reads:

```ts
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@tauri-apps/api/core': resolve(here, 'mocks/tauri-core.ts'),
      '@tauri-apps/api/event': resolve(here, 'mocks/tauri-event.ts'),
      '@tauri-apps/api/window': resolve(here, 'mocks/tauri-api-window.ts'),
      '@tauri-apps/api/app': resolve(here, 'mocks/tauri-api-app.ts'),
      '@tauri-apps/api/dpi': resolve(here, 'mocks/tauri-api-dpi.ts'),
      '@tauri-apps/plugin-opener': resolve(here, 'mocks/tauri-plugin-opener.ts'),
      '@tauri-apps/plugin-store': resolve(here, 'mocks/tauri-plugin-store.ts'),
      '@tauri-apps/plugin-clipboard-manager': resolve(here, 'mocks/tauri-plugin-clipboard-manager.ts'),
      '@/services/windows': resolve(here, 'mocks/services-windows.ts'),
      '@/generated/changelog': resolve(here, 'mocks/generated-changelog.ts'),
      '@': resolve(here, '../src'),
    };
```

The order matters: deep `@/` aliases come before the catch-all `@`.

- [ ] **Step 2: Smoke-test that Storybook still boots**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri && timeout 30 npm run storybook 2>&1 | head -30 || true
```
Expected: "Storybook started" / "for preview" lines, no resolver errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add src/BorgDock.Tauri/.storybook/main.ts
git commit -m "$(cat <<'EOF'
storybook: register @tauri-apps/plugin-clipboard-manager alias

Maps the package to .storybook/mocks/tauri-plugin-clipboard-manager.ts
so SqlApp stories don't try to spawn the real Rust clipboard plugin.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: SQL fixtures

**Files:**
- Create: `src/BorgDock.Tauri/src/components/sql/__fixtures__/sql-data.ts`

- [ ] **Step 1: Write the fixtures**

```ts
// Synthetic fixtures for SqlApp stories.
//
// `ResultSet` and `QueryResult` mirror the local interfaces inside
// SqlApp.tsx (the production interfaces are not exported). If they
// drift, stories fail to type-check at the call site — caught by
// `npm run lint` / `npm run test`.

import type {
  AppSettings,
  SqlServerConnection,
  UiSettings,
} from '@/types/settings';
import type { SqlSchemaPayload, SqlTable } from '@/types/sql-schema';
import type { SqlSnippet } from '../snippet-types';

// ── Local-mirror types ──────────────────────────────────────────────

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

// ── Factories ───────────────────────────────────────────────────────

export function makeConnection(
  overrides?: Partial<SqlServerConnection>,
): SqlServerConnection {
  return {
    name: 'BorgDock dev',
    server: 'localhost',
    port: 1433,
    database: 'BorgDock_Dev',
    authentication: 'sql',
    username: 'sa',
    password: '',
    trustServerCertificate: true,
    ...overrides,
  };
}

export function makeSnippet(overrides?: Partial<SqlSnippet>): SqlSnippet {
  return {
    id: `s${Math.random().toString(36).slice(2, 8)}`,
    name: 'Sample query',
    body: 'SELECT 1',
    starred: false,
    lastRun: '—',
    ...overrides,
  };
}

export function makeColumn(name: string, dataType = 'nvarchar(255)') {
  return { name, dataType };
}

export function makeTable(overrides?: Partial<SqlTable>): SqlTable {
  return {
    schema: 'dbo',
    name: 'Customer',
    kind: 'table',
    columns: [
      makeColumn('Id', 'int'),
      makeColumn('Name', 'nvarchar(200)'),
      makeColumn('Email', 'nvarchar(320)'),
      makeColumn('CreatedAt', 'datetime2'),
    ],
    ...overrides,
  };
}

export function makeSchema(
  overrides?: Partial<SqlSchemaPayload>,
): SqlSchemaPayload {
  return {
    database: 'BorgDock_Dev',
    fetchedAt: '2026-05-05T12:00:00Z',
    tables: [makeTable()],
    ...overrides,
  };
}

const BASE_UI: UiSettings = {
  sidebarEdge: 'right',
  sidebarMode: 'pinned',
  sidebarWidthPx: 380,
  theme: 'system',
  globalHotkey: 'CommandOrControl+Shift+B',
  flyoutHotkey: 'CommandOrControl+Shift+F',
  editorCommand: 'code',
  runAtStartup: false,
  quickReviewHotkey: 'CommandOrControl+Shift+R',
  startMinimizedToTray: false,
  restoreLastSelection: true,
};

export function makeSettings(
  connections: SqlServerConnection[],
  ui?: Partial<UiSettings>,
): AppSettings {
  return {
    setupComplete: true,
    gitHub: {
      authMethod: 'ghCli',
      pollIntervalSeconds: 30,
      username: 'storybook',
    },
    repos: [],
    ui: { ...BASE_UI, ...(ui ?? {}) },
    notifications: {
      desktopEnabled: true,
      soundEnabled: false,
      categories: {
        prFailures: true,
        prMerged: true,
        ciFailures: true,
        ciSucceeded: false,
        worktreeReady: true,
      },
    },
    claudeCode: {
      executablePath: 'claude',
      autoLaunchOnFailure: false,
      autoOpenWindowOnLaunch: true,
    },
    claudeApi: {
      apiKeyConfigured: false,
      reviewModel: 'claude-sonnet-4-7',
      maxOutputTokens: 8192,
    },
    claudeReview: {
      autoReviewOnPrLoad: false,
      includeReviewerComments: true,
    },
    updates: {
      channel: 'stable',
      autoCheckOnStart: true,
      lastCheckedIso: null,
      lastSeenVersion: null,
    },
    azureDevOps: {
      organizationUrl: '',
      project: '',
      authMethod: 'azCli',
      authAutoDetected: false,
      pollIntervalSeconds: 60,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      linkMatchBy: 'branch',
      showWorkItemStateOnPrCard: true,
      updatePrStatusWhenWiDone: false,
    },
    sql: {
      connections,
      lastUsedConnection: connections[0]?.name,
      readOnlyByDefault: false,
      confirmDestructiveWithoutWhere: true,
    },
    repoPriority: {},
  };
}

export function makeResultSet(
  columns: string[],
  rows: (string | null)[][],
  opts?: { truncated?: boolean },
): ResultSet {
  return {
    columns,
    rows,
    rowCount: rows.length,
    truncated: opts?.truncated ?? false,
  };
}

export function makeQueryResult(
  resultSets: ResultSet[],
  opts?: { executionTimeMs?: number; rowsAffected?: number | null },
): QueryResult {
  return {
    resultSets,
    executionTimeMs: opts?.executionTimeMs ?? 42,
    totalRowCount: resultSets.reduce((sum, rs) => sum + rs.rows.length, 0),
    rowsAffected: opts?.rowsAffected ?? null,
  };
}

// ── Curated connections ─────────────────────────────────────────────

export const connBorgDockDev: SqlServerConnection = makeConnection({
  name: 'BorgDock dev',
  server: 'localhost',
  database: 'BorgDock_Dev',
  authentication: 'sql',
  username: 'sa',
});

export const connHorizonProd: SqlServerConnection = makeConnection({
  name: 'Horizon prod',
  server: 'horizon-prod.example.com',
  port: 1433,
  database: 'Horizon',
  authentication: 'windows',
  username: undefined,
  password: undefined,
});

export const connLongName: SqlServerConnection = makeConnection({
  name: 'A particularly long connection display name that might wrap',
  server: 'sql-007.dev.internal.example.com',
  database: 'BigDatabaseName_With_Lots_Of_Tables',
});

export const connNoAuth: SqlServerConnection = makeConnection({
  name: 'Sandbox',
  authentication: 'sql',
  username: undefined,
  password: undefined,
});

// ── Curated schemas ─────────────────────────────────────────────────

export const schemaSmall: SqlSchemaPayload = makeSchema({
  database: 'BorgDock_Dev',
  tables: [
    makeTable({
      name: 'Customer',
      columns: [
        makeColumn('Id', 'int'),
        makeColumn('Name', 'nvarchar(200)'),
        makeColumn('Email', 'nvarchar(320)'),
      ],
    }),
    makeTable({
      name: 'Order',
      columns: [
        makeColumn('Id', 'int'),
        makeColumn('CustomerId', 'int'),
        makeColumn('Total', 'decimal(18,2)'),
        makeColumn('PlacedAt', 'datetime2'),
      ],
    }),
    makeTable({
      schema: 'audit',
      name: 'EventLog',
      kind: 'view',
      columns: [
        makeColumn('Id', 'bigint'),
        makeColumn('Action', 'nvarchar(64)'),
        makeColumn('At', 'datetime2'),
      ],
    }),
  ],
});

export const schemaMedium: SqlSchemaPayload = makeSchema({
  database: 'Horizon',
  tables: Array.from({ length: 30 }, (_, i) =>
    makeTable({
      name: `Table${i + 1}`,
      columns: [
        makeColumn('Id', 'int'),
        makeColumn('Name', 'nvarchar(200)'),
        makeColumn('CreatedAt', 'datetime2'),
      ],
    }),
  ),
});

export const schemaEmpty: SqlSchemaPayload = makeSchema({
  database: 'EmptyDb',
  tables: [],
});

// ── Curated snippet sets ────────────────────────────────────────────

export const snippetActiveQuery: SqlSnippet = makeSnippet({
  id: 'snip-active',
  name: 'Recent customers',
  body: 'SELECT TOP 10 Id, Name, Email\nFROM dbo.Customer\nORDER BY CreatedAt DESC;',
  starred: true,
  lastRun: '2 minutes ago',
});

export const snippetsEmpty: SqlSnippet[] = [];

export const snippetsFew: SqlSnippet[] = [
  snippetActiveQuery,
  makeSnippet({
    id: 'snip-orders',
    name: 'Open orders',
    body: 'SELECT * FROM dbo.[Order] WHERE Status = \'open\';',
    starred: false,
    lastRun: '15 minutes ago',
  }),
  makeSnippet({
    id: 'snip-audit',
    name: 'Today\'s audit log',
    body: 'SELECT * FROM audit.EventLog WHERE At >= CAST(GETDATE() AS date);',
    starred: false,
    lastRun: 'yesterday',
  }),
];

export const snippetsMany: SqlSnippet[] = [
  ...snippetsFew,
  ...Array.from({ length: 22 }, (_, i) =>
    makeSnippet({
      id: `snip-extra-${i}`,
      name: `Saved query ${i + 1}`,
      body: `SELECT * FROM dbo.Table${i + 1};`,
      starred: i % 5 === 0,
      lastRun: i < 3 ? 'just now' : 'last week',
    }),
  ),
];

// ── Curated query results ───────────────────────────────────────────

export const resultEmpty: QueryResult = makeQueryResult([
  makeResultSet(['Id', 'Name'], []),
]);

export const resultSingleRow: QueryResult = makeQueryResult([
  makeResultSet(['Id'], [['1']]),
]);

export const resultSmallSelect: QueryResult = makeQueryResult(
  [
    makeResultSet(
      ['Id', 'Name', 'Email', 'CreatedAt'],
      Array.from({ length: 12 }, (_, i) => [
        String(i + 1),
        `Customer ${i + 1}`,
        `customer${i + 1}@example.com`,
        `2026-04-${String(20 + (i % 10)).padStart(2, '0')} 10:0${i % 6}:00`,
      ]),
    ),
  ],
  { executionTimeMs: 28 },
);

export const resultLargeSelect: QueryResult = makeQueryResult(
  [
    makeResultSet(
      ['Id', 'Name', 'Email', 'Status', 'CreatedAt'],
      Array.from({ length: 5000 }, (_, i) => [
        String(i + 1),
        `Customer ${i + 1}`,
        `customer${i + 1}@example.com`,
        i % 7 === 0 ? null : 'active',
        `2026-04-${String(1 + (i % 28)).padStart(2, '0')} 09:00:00`,
      ]),
    ),
  ],
  { executionTimeMs: 312 },
);

export const resultTruncated: QueryResult = makeQueryResult(
  [
    makeResultSet(
      ['Id', 'Sku', 'Name', 'Price', 'StockQty'],
      Array.from({ length: 1000 }, (_, i) => [
        String(i + 1),
        `SKU-${String(i + 1).padStart(5, '0')}`,
        `Product ${i + 1}`,
        (10 + (i % 50)).toFixed(2),
        String(i % 200),
      ]),
      { truncated: true },
    ),
  ],
  { executionTimeMs: 198 },
);

export const resultMultiSet: QueryResult = makeQueryResult(
  [
    makeResultSet(
      ['CountAll'],
      [['1234']],
    ),
    makeResultSet(
      ['Status', 'Total'],
      [
        ['active', '987'],
        ['archived', '247'],
      ],
    ),
    makeResultSet(
      ['Id', 'Name'],
      Array.from({ length: 5 }, (_, i) => [String(i + 1), `Slice ${i + 1}`]),
    ),
  ],
  { executionTimeMs: 64 },
);

export const resultUpdate: QueryResult = makeQueryResult([], {
  executionTimeMs: 18,
  rowsAffected: 42,
});

export const resultNullRichness: QueryResult = makeQueryResult(
  [
    makeResultSet(
      ['Id', 'Name', 'Note', 'DeletedAt'],
      [
        ['1', 'Alice', 'A real note.', null],
        ['2', 'Bob', '', '2026-04-12 10:00:00'],
        ['3', null, null, null],
        ['4', 'Carol', 'Another note', null],
      ],
    ),
  ],
  { executionTimeMs: 11 },
);

// ── Sample queries ──────────────────────────────────────────────────

export const sampleSelectQuery = `SELECT TOP 100 c.Id, c.Name, c.Email
FROM dbo.Customer c
WHERE c.CreatedAt > DATEADD(day, -7, GETDATE())
ORDER BY c.CreatedAt DESC;`;

export const sampleLongQuery = [
  'WITH recent_orders AS (',
  '  SELECT o.Id, o.CustomerId, o.Total, o.PlacedAt',
  '  FROM dbo.[Order] o',
  '  WHERE o.PlacedAt > DATEADD(day, -30, GETDATE())',
  '),',
  'top_customers AS (',
  '  SELECT TOP 50 ro.CustomerId, SUM(ro.Total) AS Spend',
  '  FROM recent_orders ro',
  '  GROUP BY ro.CustomerId',
  '  ORDER BY SUM(ro.Total) DESC',
  ')',
  'SELECT c.Id, c.Name, c.Email, tc.Spend',
  'FROM top_customers tc',
  'INNER JOIN dbo.Customer c ON c.Id = tc.CustomerId',
  'ORDER BY tc.Spend DESC;',
].join('\n');
```

- [ ] **Step 2: Verify tsc + lint clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri && npx tsc --noEmit && npm run lint
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add src/BorgDock.Tauri/src/components/sql/__fixtures__/sql-data.ts
git commit -m "$(cat <<'EOF'
storybook: sql fixture factories + curated edge-case data

makeConnection / makeSchema / makeSettings / makeResultSet / makeQueryResult
factories plus curated connections (BorgDock dev, Horizon prod, long-name,
no-auth), schemas (small, medium, empty), snippet sets (empty, few, many,
active), and query results (empty, single row, small select, large select
with 5k rows, truncated, multi-set, update, NULL-rich).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Story file scaffold + harness

**Files:**
- Create: `src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx`

- [ ] **Step 1: Write the file with meta, harness, helper, and the first two stories**

```tsx
// src/components/sql/SqlApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import type { AppSettings } from '@/types/settings';
import type { SqlSchemaPayload } from '@/types/sql-schema';
import type { SqlSnippet } from './snippet-types';
import { SqlApp } from './SqlApp';
import {
  connBorgDockDev,
  connHorizonProd,
  connLongName,
  makeQueryResult,
  makeResultSet,
  makeSettings,
  resultEmpty,
  resultLargeSelect,
  resultMultiSet,
  resultNullRichness,
  resultSmallSelect,
  resultTruncated,
  resultUpdate,
  sampleSelectQuery,
  schemaEmpty,
  schemaSmall,
  snippetActiveQuery,
  snippetsEmpty,
  snippetsFew,
  type QueryResult,
} from './__fixtures__/sql-data';

// Keys SqlApp persists state to. Cleared before every story so stories
// don't bleed layout / position / snippet selections into each other.
const SQL_LOCALSTORAGE_KEYS = [
  'borgdock-sql-position',
  'borgdock-sql-last-query',
  'borgdock.sql.railWidth',
  'borgdock.sql.railCollapsed',
  'borgdock.sql.editorHeight',
  'borgdock.sql.activeSnippet',
  'borgdock.sql.snippets',
];

interface SqlStoryParams {
  /** AppSettings the load_settings invoke returns. */
  settings?: AppSettings;
  /** When true, load_settings returns a never-resolving promise. */
  loadSettingsPending?: boolean;
  /** Static schema OR fn (args) => schema | Promise<schema>. */
  schemaResponse?:
    | SqlSchemaPayload
    | null
    | ((args: { connectionName: string }) => SqlSchemaPayload | null | Promise<SqlSchemaPayload | null>);
  /** Cached schema returned from cache_load_sql_schema. */
  cachedSchema?: SqlSchemaPayload | null;
  /** Static result OR fn returning a result, value, or rejection. */
  executeResponse?:
    | QueryResult
    | ((args: { connectionName: string; query: string }) => QueryResult | Promise<QueryResult>);
  /** Snippets returned by sql_snippets_list (and pre-seeded into localStorage). */
  snippetsResponse?: SqlSnippet[];
  /** Pre-populated borgdock-sql-last-query so the editor mounts non-empty. */
  initialQuery?: string;
  /** Active snippet id pre-seeded into localStorage. */
  activeSnippetId?: string;
  /** When set, localStorage['borgdock.sql.railCollapsed'] is set before mount. */
  railCollapsed?: boolean;
  /** Saved window position written to localStorage before mount. */
  savedPosition?: { x: number; y: number };
  /** When provided, currentMonitor() returns this. */
  monitorState?: { size: { width: number; height: number }; scaleFactor: number } | null;
}

function clearSqlLocalStorage() {
  for (const key of SQL_LOCALSTORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

function SqlHarness({ params }: { params: SqlStoryParams }) {
  // Clear leftover state and seed fresh state synchronously, before
  // SqlApp's first render. Global preview decorator already called reset().
  clearSqlLocalStorage();

  const ctrl = getControl();

  if (params.loadSettingsPending) {
    ctrl.invokeResponses['load_settings'] = () => new Promise(() => {});
  } else if (params.settings) {
    ctrl.invokeResponses['load_settings'] = params.settings;
  } else {
    ctrl.invokeResponses['load_settings'] = makeSettings([connBorgDockDev]);
  }

  if (params.schemaResponse !== undefined) {
    ctrl.invokeResponses['fetch_sql_schema'] = params.schemaResponse;
  } else {
    ctrl.invokeResponses['fetch_sql_schema'] = schemaSmall;
  }
  ctrl.invokeResponses['cache_load_sql_schema'] = params.cachedSchema ?? null;
  ctrl.invokeResponses['cache_save_sql_schema'] = undefined;

  if (params.executeResponse !== undefined) {
    ctrl.invokeResponses['execute_sql_query'] = params.executeResponse;
  }

  ctrl.invokeResponses['sql_snippets_list'] = params.snippetsResponse ?? [];
  ctrl.invokeResponses['sql_snippets_save'] = undefined;
  ctrl.invokeResponses['sql_snippets_delete'] = undefined;
  ctrl.invokeResponses['window_ready'] = undefined;

  if (params.initialQuery !== undefined) {
    try {
      localStorage.setItem('borgdock-sql-last-query', params.initialQuery);
    } catch {
      /* ignore */
    }
  }

  if (params.activeSnippetId !== undefined) {
    try {
      localStorage.setItem('borgdock.sql.activeSnippet', params.activeSnippetId);
    } catch {
      /* ignore */
    }
  }

  if (params.railCollapsed) {
    try {
      localStorage.setItem('borgdock.sql.railCollapsed', '1');
    } catch {
      /* ignore */
    }
  }

  if (params.savedPosition) {
    try {
      localStorage.setItem(
        'borgdock-sql-position',
        JSON.stringify(params.savedPosition),
      );
    } catch {
      /* ignore */
    }
  }

  if (params.monitorState !== undefined) ctrl.monitorState = params.monitorState;

  // Cleanup on unmount so a follow-up story's beforeEach gets a clean slate
  // even if its own clearSqlLocalStorage() ran before mount of the previous
  // story's last useEffect cleanup.
  useEffect(() => {
    return () => {
      clearSqlLocalStorage();
    };
  }, []);

  return (
    <div style={{ width: 1280, height: 800 }}>
      <SqlApp />
    </div>
  );
}

const meta: Meta<typeof SqlHarness> = {
  title: 'Sql/SqlApp',
  component: SqlHarness,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof SqlHarness>;

function story(params: SqlStoryParams): Story {
  return { args: { params } };
}

// ---------------------------------------------------------------------------
// 1. Loading / connection axis
// ---------------------------------------------------------------------------

export const Loading = story({ loadSettingsPending: true });

export const NoConnections = story({
  settings: makeSettings([]),
});
```

- [ ] **Step 2: Verify Storybook discovers the file and the two stories render**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri && timeout 30 npm run storybook 2>&1 | head -25 || true
```

Story count check:
```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
```
Expected: `2`.

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: SqlApp.stories.tsx scaffold + Loading/NoConnections stories

SqlHarness clears every SqlApp localStorage key on mount and unmount,
seeds load_settings / fetch_sql_schema / cache_load_sql_schema /
execute_sql_query / sql_snippets_list / cache_save_sql_schema /
sql_snippets_save / sql_snippets_delete / window_ready invokeResponses,
honours initialQuery, activeSnippetId, railCollapsed, savedPosition,
and monitorState parameters. Renders SqlApp inside a 1280x800 host div
so TanStack's virtualiser has measurable bounds.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Connection / schema stories (5)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx`

- [ ] **Step 1: Append the five stories at the end of the file**

```tsx
export const OneConnection = story({
  settings: makeSettings([connBorgDockDev]),
});

export const MultipleConnections = story({
  settings: (() => {
    const s = makeSettings([connHorizonProd, connBorgDockDev, connLongName]);
    s.sql.lastUsedConnection = connBorgDockDev.name;
    return s;
  })(),
});

// ---------------------------------------------------------------------------
// 2. Schema axis
// ---------------------------------------------------------------------------

export const SchemaPending = story({
  settings: makeSettings([connBorgDockDev]),
  cachedSchema: null,
  schemaResponse: () => new Promise<SqlSchemaPayload>(() => {}),
});

export const SchemaCached = story({
  settings: makeSettings([connBorgDockDev]),
  cachedSchema: schemaSmall,
  schemaResponse: schemaSmall,
});

export const SchemaError = story({
  settings: makeSettings([connBorgDockDev]),
  cachedSchema: null,
  schemaResponse: () => Promise.reject(new Error('TLS handshake failed')),
});
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
```
Expected: `7` (2 + 5).

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: sql connection + schema stories (5)

OneConnection (single auto-selected), MultipleConnections (lastUsed
honoured, dropdown populated), SchemaPending (fetch never resolves),
SchemaCached (cache → fresh transition), SchemaError (fetch rejects;
header shows Schema error).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Editor / snippets stories (4)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx`

- [ ] **Step 1: Append the four stories at the end of the file**

```tsx
// ---------------------------------------------------------------------------
// 3. Editor / snippets axis
// ---------------------------------------------------------------------------

export const NoSnippetsEmptyEditor = story({
  settings: makeSettings([connBorgDockDev]),
  snippetsResponse: snippetsEmpty,
});

export const NoSnippetsDirtyEditor = story({
  settings: makeSettings([connBorgDockDev]),
  snippetsResponse: snippetsEmpty,
  initialQuery: sampleSelectQuery,
});

export const WithActiveSnippetClean = story({
  settings: makeSettings([connBorgDockDev]),
  snippetsResponse: snippetsFew,
  activeSnippetId: snippetActiveQuery.id,
  initialQuery: snippetActiveQuery.body,
});

export const WithActiveSnippetDirty = story({
  settings: makeSettings([connBorgDockDev]),
  snippetsResponse: snippetsFew,
  activeSnippetId: snippetActiveQuery.id,
  initialQuery: `${snippetActiveQuery.body}\n-- modified locally\n`,
});
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
```
Expected: `11` (7 + 4).

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: sql editor / snippets stories (4)

NoSnippetsEmptyEditor (cold start), NoSnippetsDirtyEditor (recovered
from localStorage, no active snippet → unsaved pill),
WithActiveSnippetClean (snippet body matches editor), WithActiveSnippetDirty
(snippet body diverges from editor → modified pill).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Run / result stories (5)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx`

- [ ] **Step 1: Append the five stories at the end of the file**

```tsx
// ---------------------------------------------------------------------------
// 4. Run / result axis
// ---------------------------------------------------------------------------

export const ResultIdle = story({
  settings: makeSettings([connBorgDockDev]),
  cachedSchema: schemaSmall,
});

export const ResultRunning: Story = {
  args: {
    params: {
      settings: makeSettings([connBorgDockDev]),
      cachedSchema: schemaSmall,
      initialQuery: sampleSelectQuery,
      executeResponse: () => new Promise<QueryResult>(() => {}),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const runBtn = await canvas.findByRole('button', { name: /run/i });
    await userEvent.click(runBtn);
  },
};

export const ResultSuccessSelect: Story = {
  args: {
    params: {
      settings: makeSettings([connBorgDockDev]),
      cachedSchema: schemaSmall,
      initialQuery: sampleSelectQuery,
      executeResponse: resultSmallSelect,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const runBtn = await canvas.findByRole('button', { name: /run/i });
    await userEvent.click(runBtn);
  },
};

export const ResultSuccessUpdate: Story = {
  args: {
    params: {
      settings: makeSettings([connBorgDockDev]),
      cachedSchema: schemaSmall,
      initialQuery: 'UPDATE dbo.Customer SET IsActive = 1 WHERE Region = \'EU\';',
      executeResponse: resultUpdate,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const runBtn = await canvas.findByRole('button', { name: /run/i });
    await userEvent.click(runBtn);
  },
};

export const ResultMultiSet: Story = {
  args: {
    params: {
      settings: makeSettings([connBorgDockDev]),
      cachedSchema: schemaSmall,
      initialQuery: 'SELECT COUNT(*) FROM dbo.Customer;\nSELECT Status, COUNT(*) FROM dbo.[Order] GROUP BY Status;',
      executeResponse: resultMultiSet,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const runBtn = await canvas.findByRole('button', { name: /run/i });
    await userEvent.click(runBtn);
  },
};
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
```
Expected: `16` (11 + 5).

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: sql run / result stories (5)

ResultIdle (no run yet), ResultRunning (executeResponse never resolves;
toolbar Run + results pill show running), ResultSuccessSelect (12 rows,
small grid), ResultSuccessUpdate (rowsAffected=42, no grid),
ResultMultiSet (3 result sets with per-set headers).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Error / panic stories (3)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx`

- [ ] **Step 1: Append the three stories at the end of the file**

```tsx
// ---------------------------------------------------------------------------
// 5. Error / panic axis
// ---------------------------------------------------------------------------

export const ResultError: Story = {
  args: {
    params: {
      settings: makeSettings([connBorgDockDev]),
      cachedSchema: schemaSmall,
      initialQuery: 'SELECT * FROM dbo.SomeTable;',
      executeResponse: () => Promise.reject(new Error("Login failed for user 'sa'.")),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const runBtn = await canvas.findByRole('button', { name: /run/i });
    await userEvent.click(runBtn);
  },
};

export const ResultPanicRecovered: Story = {
  args: {
    params: {
      settings: makeSettings([connBorgDockDev]),
      cachedSchema: schemaSmall,
      initialQuery: 'SELECT * FROM sys.geometries;',
      executeResponse: () =>
        Promise.reject(
          new Error(
            'Internal error: the query result contains an unsupported column type. Try selecting specific columns instead of *.',
          ),
        ),
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const runBtn = await canvas.findByRole('button', { name: /run/i });
    await userEvent.click(runBtn);
  },
};

export const ResultTruncated: Story = {
  args: {
    params: {
      settings: makeSettings([connBorgDockDev]),
      cachedSchema: schemaSmall,
      initialQuery: 'SELECT * FROM dbo.Product;',
      executeResponse: resultTruncated,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('storybook/test');
    const canvas = within(canvasElement);
    const runBtn = await canvas.findByRole('button', { name: /run/i });
    await userEvent.click(runBtn);
  },
};
```

- [ ] **Step 2: Story count check**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
```
Expected: `19` (16 + 3).

- [ ] **Step 3: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: sql error / panic stories (3)

ResultError (auth failure surfaces parsed message),
ResultPanicRecovered (tiberius UDT panic surfaces as friendly Err
string per src-tauri/src/sql.rs), ResultTruncated (truncated badge in
results header).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Layout / interaction stories (3)

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx`

- [ ] **Step 1: Append the three stories at the end of the file**

```tsx
// ---------------------------------------------------------------------------
// 6. Layout / interaction axis
// ---------------------------------------------------------------------------

export const RailCollapsed = story({
  settings: makeSettings([connBorgDockDev]),
  snippetsResponse: snippetsFew,
  railCollapsed: true,
});

export const CopyValuesRoundtrip: Story = {
  args: {
    params: {
      settings: makeSettings([connBorgDockDev]),
      cachedSchema: schemaSmall,
      initialQuery: sampleSelectQuery,
      executeResponse: resultSmallSelect,
    },
  },
  play: async ({ canvasElement }) => {
    const { within, userEvent, waitFor, expect } = await import('storybook/test');
    const canvas = within(canvasElement);
    const runBtn = await canvas.findByRole('button', { name: /run/i });
    await userEvent.click(runBtn);

    const valuesBtn = await canvas.findByRole('button', { name: /^values$/i });
    await userEvent.click(valuesBtn);

    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.clipboardWrites.length).toBeGreaterThan(0);
      // First row of resultSmallSelect → '1\tCustomer 1\t...'
      expect(ctrl.clipboardWrites[0]).toContain('Customer 1');
    });
  },
};

export const PositionPersistedAfterMove: Story = {
  args: {
    params: {
      settings: makeSettings([connBorgDockDev]),
      cachedSchema: schemaSmall,
    },
  },
  play: async () => {
    const { waitFor, expect } = await import('storybook/test');

    // Wait for the onMoved listener to register before emitting.
    await waitFor(() => {
      const ctrl = getControl();
      expect(ctrl.channels.has('__window.onMoved')).toBe(true);
    });

    getControl().emit('__window.onMoved', { x: 240, y: 180 });

    await waitFor(() => {
      const raw = localStorage.getItem('borgdock-sql-position');
      expect(raw).toBeTruthy();
      expect(raw!).toContain('240');
    });
  },
};
```

- [ ] **Step 2: Story count check (must equal 22)**

```bash
grep -c "^export const " /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
```
Expected: `22` (19 + 3).

- [ ] **Step 3: Acknowledge unused fixtures**

The following fixtures are exported by `sql-data.ts` but not consumed by any story: `connNoAuth`, `schemaMedium`, `schemaEmpty`, `snippetsMany`, `resultEmpty`, `resultSingleRow`, `resultLargeSelect`, `resultNullRichness`, `sampleLongQuery`. They are intentionally part of the fixture API for future per-component stories. Biome considers an exported symbol "used" by virtue of the export — no lint warning expected.

If lint complains about an unused import in `SqlApp.stories.tsx`, prune the unused imports — only the fixtures that the catalog references should be imported by the story file.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add src/BorgDock.Tauri/src/components/sql/SqlApp.stories.tsx
git commit -m "$(cat <<'EOF'
storybook: sql layout / interaction stories (3)

RailCollapsed (snippets rail in collapsed mode), CopyValuesRoundtrip
(play clicks Run then Values; asserts clipboardWrites recorded a
tab-separated row), PositionPersistedAfterMove (play emits the
synthetic __window.onMoved channel; asserts borgdock-sql-position
localStorage was updated).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update the roadmap

**Files:**
- Modify: `docs/superpowers/specs/storybook-roadmap.md`

- [ ] **Step 1: Move SQL from Pending to Done**

In the Done table, append the SQL row:

```
| 4 | SQL | `sql-main.tsx` → `components/sql/SqlApp.tsx` | `2026-05-05-storybook-phase4-sql-design.md` | `2026-05-05-storybook-phase4-sql.md` | _(filled in after PR opens)_ |
```

In the Pending table, delete the SQL row.

- [ ] **Step 2: Update the "Mock layer extensions" list**

Add one bullet under the existing aliases list:

```
- `@tauri-apps/plugin-clipboard-manager` → `mocks/tauri-plugin-clipboard-manager.ts`
```

Append a one-line note after the Phase 3 note:

```
> **Phase 4 mock-layer extensions:** `tauri-api-window` now also exposes
> `getCurrentWindow().{outerPosition, setPosition, onMoved}`. `control.ts`
> records `clipboardWrites: string[]` (populated by every
> `clipboard.writeText` invocation) and `windowSize` gains `x` / `y`
> fields for the position round-trip used by SqlApp's saved-position
> persistence.
```

- [ ] **Step 3: Verify the roadmap is consistent**

```bash
grep -n "SQL\|sql\|clipboard" /Users/koenvdb/projects/borgdock-storybook-sql/docs/superpowers/specs/storybook-roadmap.md | head -20
```
Expected: no row for SQL in the Pending table; SQL appears in the Done table.

- [ ] **Step 4: Commit**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git add docs/superpowers/specs/storybook-roadmap.md
git commit -m "$(cat <<'EOF'
roadmap: mark sql done, register plugin-clipboard-manager + window position mocks

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Final verification

**Files:** none

- [ ] **Step 1: Confirm production tree is byte-identical to master**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git diff origin/master...HEAD -- \
  src/BorgDock.Tauri/src/sql-main.tsx \
  src/BorgDock.Tauri/src/components/sql \
  ':(exclude)src/BorgDock.Tauri/src/components/sql/__fixtures__' \
  ':(exclude)src/BorgDock.Tauri/src/components/sql/*.stories.tsx'
```
Expected: empty output. If anything is shown, STOP and revert that file.

- [ ] **Step 2: Lint clean**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri && npm run lint
```
Expected: green (warnings allowed, errors not).

- [ ] **Step 3: Build Storybook (10-min timeout)**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri && npm run build-storybook
```
Expected: green.

- [ ] **Step 4: Vitest (10-min timeout)**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql/src/BorgDock.Tauri && npm run test
```
Expected: green.

No commit in this task.

---

## Task 14: Push and open PR

**Files:** none

- [ ] **Step 1: Switch to personal gh account**

```bash
gh auth switch --user borght-dev && gh auth status
```
Verify `Active account: true` next to `borght-dev`.

- [ ] **Step 2: Push the branch**

```bash
cd /Users/koenvdb/projects/borgdock-storybook-sql && git push -u origin storybook-phase4-sql
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base master --head storybook-phase4-sql --title "storybook phase 4: SQL window catalog" --body "$(cat <<'EOF'
## Summary
- Adds **22 exhaustive Storybook stories** for `SqlApp.tsx` covering loading / connection (4), schema (3), editor / snippets (4), run / result (5), error / panic (3), and layout / interaction (3) axes.
- Extends the mock layer with `getCurrentWindow().{outerPosition, setPosition, onMoved}` and a new `@tauri-apps/plugin-clipboard-manager` alias backed by `.storybook/mocks/tauri-plugin-clipboard-manager.ts` that records every `writeText` into `getControl().clipboardWrites`.
- Production code (`SqlApp.tsx`, all SQL children, `sql-main.tsx`) is byte-identical to master.
- Updates the roadmap: SQL row moves Pending → Done, mock-layer list gains the new clipboard alias and a note about the new window position methods.

Spec: `docs/superpowers/specs/2026-05-05-storybook-phase4-sql-design.md`
Plan: `docs/superpowers/plans/2026-05-05-storybook-phase4-sql.md`

## Test plan
- [ ] `npm run storybook` boots; all 22 SqlApp stories load alongside Phase 1+2+3 stories without console errors
- [ ] Theme toolbar (light/dark/system) toggles every story without reload
- [ ] `CopyValuesRoundtrip` and `PositionPersistedAfterMove` play functions complete (clipboardWrites populated; localStorage[borgdock-sql-position] updated)
- [ ] `npm run build-storybook` completes
- [ ] `npm run test` (vitest) green on macOS and Windows
- [ ] `npm run lint` (Biome) clean
- [ ] `git diff origin/master...HEAD -- src/BorgDock.Tauri/src/sql-main.tsx src/BorgDock.Tauri/src/components/sql ':(exclude)src/BorgDock.Tauri/src/components/sql/__fixtures__' ':(exclude)src/BorgDock.Tauri/src/components/sql/*.stories.tsx'` shows zero changes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Switch gh back to enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha && gh auth status
```
Verify `KvanderBorght_gomocha` is active again.

- [ ] **Step 5: Capture PR URL and watch CI**

The URL printed by `gh pr create` is the watch target. Run:

```bash
gh pr checks <PR-URL> --watch
```
Wait for vitest (macOS + Windows) to go green. Playwright is allowed to fail (pre-existing flakiness — same precedent as Phase 2/3).

---

## Self-Review Notes

- **Spec coverage:**
  - Mock layer extensions (`outerPosition`, `setPosition`, `onMoved`, plugin-clipboard-manager) — Tasks 2, 3, 4.
  - Control surface extensions (`windowSize.{x,y}`, `clipboardWrites`) — Task 1.
  - Fixtures (factories + curated connections / schemas / snippets / results / queries) — Task 5.
  - 22 stories — Tasks 6–11 (2 + 5 + 4 + 5 + 3 + 3 = 22).
  - Roadmap update — Task 12.
  - Acceptance criteria — Task 13.
  - PR creation — Task 14.
- **No prod code changes:** verified explicitly in Task 13 step 1.
- **Type consistency:** `SqlServerConnection`, `AppSettings`, `UiSettings`, `SqlSchemaPayload`, `SqlTable`, `SqlSnippet` imported from production sources only; never redeclared. `ResultSet` and `QueryResult` mirror local types in `SqlApp.tsx` (the production interfaces are not exported — same drift-protection precedent as Phase 3's `WorktreeEntry`).
- **Bite-sized steps:** every task has 2–4 steps; every code-changing step shows the literal code; every commit step has the literal command.
- **Out of scope:** per-component stories, visual regression, hero shots, CodeMirror autocomplete play stories — all deferred per spec.
