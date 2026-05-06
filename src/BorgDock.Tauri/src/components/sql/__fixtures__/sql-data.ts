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
      toastOnCheckStatusChange: false,
      toastOnNewPR: false,
      toastOnReviewUpdate: false,
      toastOnMergeable: false,
      onlyMyPRs: true,
      playMergeSound: false,
      reviewNudgeEnabled: false,
      reviewNudgeIntervalMinutes: 30,
      reviewNudgeEscalation: false,
      deduplicationWindowSeconds: 60,
      channels: { tray: true, system: false, sound: false, emailDigest: false },
    },
    claudeCode: { defaultPostFixAction: 'none' },
    claudeApi: {
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
      prSummaryEnabled: false,
      diffExplanationsEnabled: false,
      reviewNudgePhrasingEnabled: false,
      commitMessageSuggestionsEnabled: false,
    },
    claudeReview: { botUsername: 'claude[bot]' },
    updates: { autoCheckEnabled: false, autoDownload: false },
    azureDevOps: {
      organization: '',
      project: '',
      authMethod: 'azCli',
      authAutoDetected: false,
      pollIntervalSeconds: 30,
      favoriteQueryIds: [],
      trackedWorkItemIds: [],
      workingOnWorkItemIds: [],
      workItemWorktreePaths: {},
      recentWorkItemIds: [],
      linkMatchBy: 'branch',
      showWorkItemStateOnPrCard: false,
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
    body: "SELECT * FROM dbo.[Order] WHERE Status = 'open';",
    starred: false,
    lastRun: '15 minutes ago',
  }),
  makeSnippet({
    id: 'snip-audit',
    name: "Today's audit log",
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
    makeResultSet(['CountAll'], [['1234']]),
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
