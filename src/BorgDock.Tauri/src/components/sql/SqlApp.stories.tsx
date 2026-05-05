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
  makeSettings,
  schemaSmall,
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
