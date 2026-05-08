import { describe, expect, it } from 'vitest';
import { serializeHandlers } from '../../../tests/e2e/helpers/mock-tauri';

describe('serializeHandlers', () => {
  it('serializes a value handler', () => {
    expect(serializeHandlers({ load_settings: { theme: 'dark' } })).toEqual({
      load_settings: { type: 'value', data: { theme: 'dark' } },
    });
  });

  it('serializes a function handler to its source', () => {
    const handler = (args: unknown) => `got ${JSON.stringify(args)}`;
    const result = serializeHandlers({ check_github_auth: handler });
    expect(result.check_github_auth!.type).toBe('fn');
    expect(typeof result.check_github_auth!.data).toBe('string');
    expect(result.check_github_auth!.data as string).toContain('JSON.stringify');
  });

  it('handles an empty handler map', () => {
    expect(serializeHandlers({})).toEqual({});
  });
});
