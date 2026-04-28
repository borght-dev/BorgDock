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
