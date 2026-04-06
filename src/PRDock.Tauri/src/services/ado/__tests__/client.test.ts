import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdoApiError, AdoAuthError, AdoClient } from '../client';

describe('AdoClient retry', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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
  });

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
  });

  it('does NOT retry on 401 (auth error)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 401 }));
    const client = new AdoClient('org', 'project', 'pat');
    await expect(client.get('wit/workitems')).rejects.toThrow(AdoAuthError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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
  });

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
  });
});

describe('AdoClient.getStream', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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

  it('throws AdoAuthError on 401', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 401 }));

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

  it('throws AdoAuthError on 401', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 401 }));

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
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null on successful connection', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection('org', 'project', 'test-pat');

    expect(result).toBeNull();
  });

  it('returns error message on 401', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 401 }));

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection('org', 'project', 'bad-pat');

    expect(result).toBe('Invalid Personal Access Token.');
  });

  it('returns error message on 404', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 404 }));

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection('wrong-org', 'wrong-project', 'pat');

    expect(result).toBe('Organization or project not found.');
  });

  it('returns error message on other non-OK status', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500, statusText: 'Internal Server Error' }));

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection('org', 'project', 'pat');

    expect(result).toBe('Connection failed: 500 Internal Server Error');
  });

  it('returns error message on AbortError', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    fetchSpy.mockRejectedValueOnce(abortError);

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection('org', 'project', 'pat');

    expect(result).toBe('Connection timed out.');
  });

  it('returns error message on generic Error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('DNS resolution failed'));

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection('org', 'project', 'pat');

    expect(result).toBe('Connection failed: DNS resolution failed');
  });

  it('returns unknown error for non-Error throws', async () => {
    fetchSpy.mockRejectedValueOnce('something weird');

    const client = new AdoClient('org', 'project', 'pat');
    const result = await client.testConnection('org', 'project', 'pat');

    expect(result).toBe('Connection failed: Unknown error');
  });
});

describe('AdoClient.isConfigured', () => {
  it('returns true when all fields are non-empty', () => {
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

  it('returns false when pat is empty', () => {
    const client = new AdoClient('org', 'project', '');
    expect(client.isConfigured).toBe(false);
  });

  it('returns false when fields are whitespace', () => {
    const client = new AdoClient('  ', 'project', 'pat');
    expect(client.isConfigured).toBe(false);
  });
});

describe('AdoClient.patch', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
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
