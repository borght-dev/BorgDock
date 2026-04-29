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
    // Manually-resolved fetch promise so the test can observe the cached /
    // refreshing phase deterministically. A timeout-based delay races with
    // CI scheduling: if the runner is slow enough that the 50ms timer fires
    // between waitFor resolving and the next assertion, status has already
    // advanced to 'fresh' and the cached/refreshing assertion fails.
    let resolveFetch: (payload: SqlSchemaPayload) => void = () => {};
    const fetchPromise = new Promise<SqlSchemaPayload>((resolve) => {
      resolveFetch = resolve;
    });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'cache_load_sql_schema') return cached;
      if (cmd === 'fetch_sql_schema') return fetchPromise;
      if (cmd === 'cache_save_sql_schema') return undefined;
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useSqlSchema('local'));

    await waitFor(() => expect(result.current.schema).toEqual(cached));
    expect(['cached', 'refreshing']).toContain(result.current.status);

    resolveFetch(fresh);

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
