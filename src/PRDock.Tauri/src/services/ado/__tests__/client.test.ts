import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { AdoClient } from '../client';

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

describe('AdoClient header resolution', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('resolves the header once and reuses it across requests', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'ado_resolve_auth_header') return 'Bearer tok-1';
      if (cmd === 'ado_fetch') {
        return {
          status: 200,
          status_text: 'OK',
          body: '{"ok":true}',
          body_base64: null,
          headers: {},
        };
      }
      throw new Error('unexpected command: ' + cmd);
    });

    const client = new AdoClient('org', 'proj', 'pat-unused', 'azCli');
    await client.get('projects');
    await client.get('projects');

    const resolveCalls = invokeMock.mock.calls.filter((c) => c[0] === 'ado_resolve_auth_header');
    expect(resolveCalls).toHaveLength(1);
  });

  it('refreshes the header and retries once on a 401', async () => {
    const resolveResponses = ['Bearer tok-1', 'Bearer tok-2'];
    let resolveIdx = 0;
    const fetchResponses = [
      { status: 401, status_text: 'Unauthorized', body: '', body_base64: null, headers: {} },
      { status: 200, status_text: 'OK', body: '{"ok":true}', body_base64: null, headers: {} },
    ];
    let fetchIdx = 0;
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'ado_resolve_auth_header') return resolveResponses[resolveIdx++];
      if (cmd === 'ado_fetch') return fetchResponses[fetchIdx++];
      throw new Error('unexpected');
    });

    const client = new AdoClient('org', 'proj', 'p', 'azCli');
    const result = await client.get<{ ok: boolean }>('projects');

    expect(result).toEqual({ ok: true });
    expect(resolveIdx).toBe(2);
    expect(fetchIdx).toBe(2);
  });

  it('surfaces AdoAuthError when the 401 persists after the retry', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'ado_resolve_auth_header') return 'Bearer tok';
      if (cmd === 'ado_fetch') {
        return { status: 401, status_text: 'Unauthorized', body: '', body_base64: null, headers: {} };
      }
      throw new Error('unexpected');
    });

    const client = new AdoClient('org', 'proj', 'p', 'azCli');
    await expect(client.get('projects')).rejects.toThrow(/authentication failed/i);
  });
});
