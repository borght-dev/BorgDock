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
      let payload: SqlSchemaPayload;
      try {
        payload = await invoke<SqlSchemaPayload>('fetch_sql_schema', { connectionName });
      } catch (err) {
        if (cancelledRef.current) return;
        setStatus(hadCache ? 'cached' : 'error');
        // eslint-disable-next-line no-console
        console.warn('fetch_sql_schema failed:', err);
        return;
      }
      if (cancelledRef.current) return;
      setSchema(payload);
      setStatus('fresh');
      try {
        await invoke('cache_save_sql_schema', { connectionName, payload });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('cache_save_sql_schema failed (schema is fresh in memory):', err);
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
