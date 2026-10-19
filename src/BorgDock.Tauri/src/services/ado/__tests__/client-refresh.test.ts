import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import { AdoAuthExpiredError, AdoClient } from '../client';

const ipc = vi.mocked(invoke);

describe('ADO sign-in recovery', () => {
  beforeEach(() => ipc.mockReset());

  it.each([
    [302, {}, ''],
    [200, { 'content-type': 'text/html' }, '<html>Sign in</html>'],
    [200, {}, '  <!DOCTYPE html><html>Sign in</html>'],
  ])('refreshes cached auth after a sign-in response (%s, %j)', async (status, headers, body) => {
    const requests: unknown[] = [];
    ipc.mockImplementation(async (command, args) => {
      if (command === 'ado_resolve_auth_header') {
        return (args as { forceRefresh: boolean }).forceRefresh ? 'Bearer fresh' : 'Bearer expired';
      }
      if (command !== 'ado_fetch') return null;
      const request = (args as { request: { headers: { Authorization: string } } }).request;
      requests.push(request);
      return request.headers.Authorization === 'Bearer fresh'
        ? { status: 200, status_text: 'OK', body: '{"workItems":[{"id":1}]}', headers: {} }
        : { status, status_text: '', body, headers };
    });
    const client = new AdoClient('org', 'project', '', 'azCli');
    await expect(client.post('wit/wiql', { query: 'assigned items' })).resolves.toEqual({
      workItems: [{ id: 1 }],
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({
      ...(requests[0] as object),
      headers: { Authorization: 'Bearer fresh', 'Content-Type': 'application/json' },
    });
  });

  it('stops after one refresh when sign-in is still required', async () => {
    ipc.mockImplementation(async (command) =>
      command === 'ado_resolve_auth_header'
        ? 'Bearer expired'
        : { status: 200, status_text: 'OK', body: '<html>Sign in</html>', headers: {} },
    );
    await expect(new AdoClient('org', 'project', '', 'azCli').get('wit/workitems')).rejects.toThrow(
      AdoAuthExpiredError,
    );
    expect(ipc.mock.calls.filter(([command]) => command === 'ado_fetch')).toHaveLength(2);
  });

  it('allows HTML attachments without treating them as sign-in pages', async () => {
    ipc.mockImplementation(async (command) =>
      command === 'ado_resolve_auth_header'
        ? 'Bearer valid'
        : {
            status: 200,
            status_text: 'OK',
            body: '<html>Attached report</html>',
            headers: { 'content-type': 'text/html' },
          },
    );
    const report = await new AdoClient('org', 'project', '', 'azCli').getStream(
      'wit/attachments/report',
    );
    expect(report.size).toBeGreaterThan(0);
    expect(ipc.mock.calls.filter(([command]) => command === 'ado_fetch')).toHaveLength(1);
  });
});
