import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { AdoApiError, AdoAuthError, AdoClient } from '../client';

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

/**
 * Default invoke implementation used by the legacy retry/HTTP-method test
 * suites below. It:
 *  - returns a fixed Basic auth header for `ado_resolve_auth_header`
 *  - forwards `ado_fetch` calls to whatever `globalThis.fetch` is currently
 *    stubbed to, reshaping the Response into the AdoFetchResponse shape.
 *
 * The three header-resolution tests at the top set their own per-test
 * implementation via `invokeMock.mockImplementation(...)` after a
 * `mockReset()`, so they don't rely on this default.
 */
const defaultInvokeImpl = async (cmd: string, args?: unknown) => {
  if (cmd === 'ado_resolve_auth_header') {
    return 'Basic OlBBVA==';
  }
  if (cmd === 'ado_fetch') {
    const request = (
      args as {
        request?: {
          url: string;
          method: string;
          headers: Record<string, string>;
          body: string | null;
        };
      }
    )?.request;
    if (!request) throw new Error('ado_fetch called without request payload');
    const { url, method, headers, body } = request;
    const response: Response = await (
      globalThis.fetch as unknown as (u: string, i: RequestInit) => Promise<Response>
    )(url, { method, headers, body });
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    const bodyText = await response.clone().text();
    return {
      status: response.status,
      status_text: response.statusText,
      body: bodyText,
      body_base64: null,
      headers: responseHeaders,
    };
  }
  throw new Error(`Unexpected invoke call: ${cmd}`);
};

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

// ---------------------------------------------------------------------------
// Legacy suites: these stub `globalThis.fetch` and rely on the default invoke
// impl above to forward ado_fetch calls into the stubbed fetch. Each describe
// reinstalls `defaultInvokeImpl` in beforeEach because the top-level describe
// above resets the mock.
// ---------------------------------------------------------------------------

describe('AdoClient retry', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(defaultInvokeImpl);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns immediately on 200', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = new AdoClient('org', 'project', 'pat');
    await client.get('wit/workitems');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 up to 3 times', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = new AdoClient('org', 'project', 'pat');
    await client.get('wit/workitems');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  }, 15_000);

  it('retries on 500, 502, 503', async () => {
    for (const status of [500, 502, 503]) {
      fetchSpy.mockReset();
      fetchSpy
        .mockResolvedValueOnce(new Response('', { status }))
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));
      const client = new AdoClient('org', 'project', 'pat');
      await client.get('wit/workitems');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    }
  }, 15_000);

  // Post-refactor behaviour: on 401 the client refreshes the Authorization
  // header and retries the original request once. So a single 401 response
  // triggers a second fetch. Stub two 401s so the retry also fails and the
  // AdoAuthError propagates.
  it('refreshes auth and retries once on 401 (then throws)', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.get('wit/workitems')).rejects.toThrow(AdoAuthError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 403 (auth error)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 403 }));
    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.get('wit/workitems')).rejects.toThrow(AdoAuthError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 404 (not transient)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }));
    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.get('wit/workitems')).rejects.toThrow(AdoApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns last error response after max retries exhausted', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 503 }));
    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.get('wit/workitems')).rejects.toThrow('503');
    expect(fetchSpy).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  }, 15_000);

  it('retries POST requests on transient errors', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = new AdoClient('org', 'project', 'pat');
    await client.post('wit/workitems', { fields: {} });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  }, 15_000);

  it('respects Retry-After header value', async () => {
    const retryResponse = new Response('', {
      status: 429,
      headers: { 'Retry-After': '2' },
    });
    fetchSpy
      .mockResolvedValueOnce(retryResponse)
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const client = new AdoClient('org', 'project', 'pat');
    await client.get('wit/workitems');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  }, 15_000);
});

describe('AdoClient.getStream', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(defaultInvokeImpl);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a blob on success', async () => {
    const blobContent = new Blob(['file data']);
    const response = new Response(blobContent, { status: 200 });
    fetchSpy.mockResolvedValueOnce(response);

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.getStream('wit/attachments/123');

    // Use duck-typing check since Blob cross-realm instanceof can fail
    expect(typeof result.size).toBe('number');
    expect(typeof result.type).toBe('string');
  });

  // Post-refactor: 401 triggers one header refresh + retry. Stub two 401s.
  it('throws AdoAuthError on 401', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));

    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.getStream('wit/attachments/123')).rejects.toThrow(AdoAuthError);
  });

  it('throws AdoAuthError on 403', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 403 }));

    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.getStream('wit/attachments/123')).rejects.toThrow(AdoAuthError);
  });

  it('throws AdoApiError on non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }));

    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.getStream('wit/attachments/123')).rejects.toThrow(AdoApiError);
  });
});

describe('AdoClient.delete', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(defaultInvokeImpl);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('succeeds on 200', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 200 }));

    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.delete('wit/workitems/123')).resolves.toBeUndefined();
  });

  // Post-refactor: 401 triggers one header refresh + retry. Stub two 401s.
  it('throws AdoAuthError on 401', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));

    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.delete('wit/workitems/123')).rejects.toThrow(AdoAuthError);
  });

  it('throws AdoAuthError on 403', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 403 }));

    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.delete('wit/workitems/123')).rejects.toThrow(AdoAuthError);
  });

  it('throws AdoApiError on non-auth non-OK response (404)', async () => {
    // Use 404 which is not transient, so no retry delays
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404, statusText: 'Not Found' }));

    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.delete('wit/workitems/123')).rejects.toThrow(AdoApiError);
  });
});

describe('AdoClient.testConnection', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(defaultInvokeImpl);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null on successful connection', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection();

    expect(result).toBeNull();
  });

  // Post-refactor: testConnection goes through fetchWithRetry which does the
  // 401 refresh-and-retry. Stub two 401s so the retry also fails and the
  // handler returns the auth-failed message. Also: the message wording
  // changed from "Invalid Personal Access Token." to a mode-neutral string.
  it('returns error message on 401', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));

    const client = new AdoClient('org', 'project', 'bad-pat');
    const result = await client.testConnection();

    expect(result).toBe('Authentication failed. Check your credentials.');
  });

  it('returns error message on 404', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }));

    const client = new AdoClient('wrong-org', 'wrong-project', 'pat');
    const result = await client.testConnection();

    expect(result).toBe('Organization or project not found.');
  });

  it('returns error message on other non-OK status', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 409, statusText: 'Conflict' }));

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection();

    expect(result).toBe('Connection failed: 409 Conflict');
  });

  it('returns error message on AbortError', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    fetchSpy.mockRejectedValueOnce(abortError);

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection();

    expect(result).toBe('Connection timed out.');
  });

  it('returns error message on generic Error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('DNS resolution failed'));

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection();

    expect(result).toBe('Connection failed: DNS resolution failed');
  });

  // Post-refactor: non-Error throws from the Tauri resolver are re-thrown
  // so the UI can dispatch on the structured `kind` field instead of the
  // old "Unknown error" fallback string. This is intentional per the plan.
  it('re-throws non-Error values from the resolver', async () => {
    // Override the default invoke impl for this test: make ado_fetch reject
    // with a non-Error value (simulating a structured Tauri error).
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'ado_resolve_auth_header') return 'Basic OlBBVA==';
      if (cmd === 'ado_fetch') throw 'something weird';
      throw new Error(`Unexpected invoke call: ${cmd}`);
    });

    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.testConnection()).rejects.toBe('something weird');
  });
});

describe('AdoClient.isConfigured', () => {
  it('returns true when all fields are non-empty (pat mode)', () => {
    const client = new AdoClient('org', 'project', 'pat');
    expect(client.isConfigured).toBe(true);
  });

  it('returns false when org is empty', () => {
    const client = new AdoClient('', 'project', 'pat');
    expect(client.isConfigured).toBe(false);
  });

  it('returns false when project is empty', () => {
    const client = new AdoClient('org', '', 'pat');
    expect(client.isConfigured).toBe(false);
  });

  it('returns false when pat is empty (pat mode)', () => {
    const client = new AdoClient('org', 'project', '');
    expect(client.isConfigured).toBe(false);
  });

  it('returns false when fields are whitespace', () => {
    const client = new AdoClient('  ', 'project', 'pat');
    expect(client.isConfigured).toBe(false);
  });

  // New behavior: azCli mode doesn't require a PAT — the short-circuit in
  // isConfigured skips the PAT check when authMethod === 'azCli'.
  it('returns true in azCli mode even when pat is empty', () => {
    const client = new AdoClient('org', 'project', '', 'azCli');
    expect(client.isConfigured).toBe(true);
  });
});

describe('AdoClient.patch', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(defaultInvokeImpl);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends PATCH request with correct content type', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const client = new AdoClient('org', 'project', 'pat');
    await client.patch('wit/workitems/123', [{ op: 'add' }], 'application/json-patch+json');

    const callArgs = fetchSpy.mock.calls[0]!;
    expect(callArgs[1].method).toBe('PATCH');
    expect(callArgs[1].headers['Content-Type']).toBe('application/json-patch+json');
  });

  it('defaults content type to application/json', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const client = new AdoClient('org', 'project', 'pat');
    await client.patch('wit/workitems/123', { field: 'value' });

    const callArgs = fetchSpy.mock.calls[0]!;
    expect(callArgs[1].headers['Content-Type']).toBe('application/json');
  });
});

describe('AdoClient.getOrgLevel', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(defaultInvokeImpl);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds correct org-level URL', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const client = new AdoClient('myorg', 'myproject', 'mypat');
    await client.getOrgLevel('connectionData');

    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toBe('https://dev.azure.com/myorg/_apis/connectionData?api-version=7.1');
  });
});
