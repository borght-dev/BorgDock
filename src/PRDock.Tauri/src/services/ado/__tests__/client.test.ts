import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdoClient, AdoAuthError, AdoApiError } from '../client';

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
});
