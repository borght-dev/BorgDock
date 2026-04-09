import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubApiError, GitHubAuthError, GitHubClient } from '../client';

function createClient(token = 'test-token') {
  return new GitHubClient(vi.fn().mockResolvedValue(token));
}

function mockResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    headers: new Headers(headers),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function mockHangingFetchWithAbort() {
  return vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal | undefined;
    return new Promise((_resolve, reject) => {
      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }
      signal?.addEventListener(
        'abort',
        () => {
          reject(createAbortError());
        },
        { once: true },
      );
    });
  });
}

describe('GitHubClient', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('getRateLimit', () => {
    it('returns default rate limit when no requests have been made', () => {
      const client = createClient();
      const rl = client.getRateLimit();
      expect(rl.remaining).toBe(-1);
      expect(rl.total).toBe(-1);
      expect(rl.reset).toBeNull();
    });

    it('returns a copy of the rate limit (not a reference)', () => {
      const client = createClient();
      const rl1 = client.getRateLimit();
      const rl2 = client.getRateLimit();
      expect(rl1).not.toBe(rl2);
      expect(rl1).toEqual(rl2);
    });
  });

  describe('isRateLimitLow', () => {
    it('returns false when remaining is -1 (unknown)', () => {
      const client = createClient();
      expect(client.isRateLimitLow).toBe(false);
    });

    it('returns true when remaining is below 500', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        mockResponse(200, { ok: true }, { 'X-RateLimit-Remaining': '100' }),
      );
      await client.get('repos/test');
      expect(client.isRateLimitLow).toBe(true);
    });

    it('returns false when remaining is 500 or more', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        mockResponse(200, { ok: true }, { 'X-RateLimit-Remaining': '500' }),
      );
      await client.get('repos/test');
      expect(client.isRateLimitLow).toBe(false);
    });
  });

  describe('get', () => {
    it('makes a GET request to the correct URL', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(200, { id: 1 }));

      const result = await client.get<{ id: number }>('repos/owner/repo');

      expect(result).toEqual({ id: 1 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.github.com/repos/owner/repo');
      expect(fetchSpy.mock.calls[0]![1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'User-Agent': 'PRDock',
          }),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('caches responses with etag and sends If-None-Match on subsequent requests', async () => {
      const client = createClient();

      // First request returns with etag
      fetchSpy.mockResolvedValueOnce(mockResponse(200, { id: 1 }, { etag: '"abc123"' }));
      const result1 = await client.get<{ id: number }>('repos/owner/repo');
      expect(result1).toEqual({ id: 1 });

      // Second request returns 304
      fetchSpy.mockResolvedValueOnce(mockResponse(304));
      const result2 = await client.get<{ id: number }>('repos/owner/repo');
      expect(result2).toEqual({ id: 1 }); // Returns cached data

      // Verify If-None-Match header was sent
      const secondCallHeaders = fetchSpy.mock.calls[1]![1].headers;
      expect(secondCallHeaders['If-None-Match']).toBe('"abc123"');
    });

    it('throws GitHubAuthError on 401', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(401));

      await expect(client.get('repos/test')).rejects.toThrow(GitHubAuthError);
    });

    it('throws GitHubAuthError on 403 when rate limit is not exhausted', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        mockResponse(403, {}, { 'X-RateLimit-Remaining': '100' }),
      );

      await expect(client.get('repos/test')).rejects.toThrow(GitHubAuthError);
    });

    it('throws GitHubApiError on other non-OK statuses', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(404));

      await expect(client.get('repos/test')).rejects.toThrow(GitHubApiError);
    });

    it('parses rate limit headers from response', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        mockResponse(
          200,
          {},
          {
            'X-RateLimit-Remaining': '4500',
            'X-RateLimit-Limit': '5000',
            'X-RateLimit-Reset': '1700000000',
          },
        ),
      );

      await client.get('repos/test');

      const rl = client.getRateLimit();
      expect(rl.remaining).toBe(4500);
      expect(rl.total).toBe(5000);
      expect(rl.reset).toEqual(new Date(1700000000 * 1000));
    });
  });

  describe('getRaw', () => {
    it('makes a GET request with raw accept header', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(200, 'raw content'));

      const result = await client.getRaw('repos/owner/repo/contents/file.txt');

      expect(result).toBe('raw content');
      const headers = fetchSpy.mock.calls[0]![1].headers;
      expect(headers.Accept).toBe('application/vnd.github.v3.raw');
    });

    it('throws GitHubApiError on non-OK status', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(404));

      await expect(client.getRaw('repos/test')).rejects.toThrow(GitHubApiError);
    });
  });

  describe('post', () => {
    it('makes a POST request with correct body and headers', async () => {
      const client = createClient();
      const responseBody = { id: 1 };
      fetchSpy.mockResolvedValueOnce(mockResponse(201, responseBody));

      const result = await client.post<{ id: number }>('repos/owner/repo', { name: 'test' });

      expect(result).toEqual(responseBody);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.github.com/repos/owner/repo');
      expect(fetchSpy.mock.calls[0]![1]).toEqual(
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ name: 'test' }),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('throws GitHubApiError on non-OK status', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(422));

      await expect(client.post('repos/test', {})).rejects.toThrow(GitHubApiError);
    });

    it('parses rate limit headers', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        mockResponse(200, {}, { 'X-RateLimit-Remaining': '4999' }),
      );

      await client.post('repos/test', {});

      expect(client.getRateLimit().remaining).toBe(4999);
    });
  });

  describe('put', () => {
    it('makes a PUT request with correct body and headers', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(200, { merged: true }));

      const result = await client.put<{ merged: boolean }>('repos/owner/repo/merge', {
        merge_method: 'squash',
      });

      expect(result).toEqual({ merged: true });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.github.com/repos/owner/repo/merge');
      expect(fetchSpy.mock.calls[0]![1]).toEqual(
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ merge_method: 'squash' }),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('throws GitHubApiError on non-OK status', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(409));

      await expect(client.put('repos/test', {})).rejects.toThrow(GitHubApiError);
    });
  });

  describe('patch', () => {
    it('makes a PATCH request with correct body and headers', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(200, { state: 'closed' }));

      const result = await client.patch<{ state: string }>('repos/owner/repo/pulls/1', {
        state: 'closed',
      });

      expect(result).toEqual({ state: 'closed' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.github.com/repos/owner/repo/pulls/1');
      expect(fetchSpy.mock.calls[0]![1]).toEqual(
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ state: 'closed' }),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('throws GitHubApiError on non-OK status', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(400));

      await expect(client.patch('repos/test', {})).rejects.toThrow(GitHubApiError);
    });
  });

  describe('graphql', () => {
    it('makes a GraphQL POST request', async () => {
      const client = createClient();
      const data = { repository: { id: '123' } };
      fetchSpy.mockResolvedValueOnce(mockResponse(200, { data }));

      const result = await client.graphql<{ repository: { id: string } }>(
        'query { repository { id } }',
        { owner: 'test' },
      );

      expect(result).toEqual(data);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![0]).toBe('https://api.github.com/graphql');
      expect(fetchSpy.mock.calls[0]![1]).toEqual(
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            query: 'query { repository { id } }',
            variables: { owner: 'test' },
          }),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('throws GitHubApiError on non-OK status', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(500));

      await expect(client.graphql('query { viewer { login } }')).rejects.toThrow(GitHubApiError);
    });

    it('throws GitHubApiError when response contains GraphQL errors', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        mockResponse(200, {
          errors: [{ message: 'Field not found' }],
          data: null,
        }),
      );

      await expect(client.graphql('query { bad }')).rejects.toThrow(
        'GraphQL error: Field not found',
      );
    });

    it('sends request without variables when not provided', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(200, { data: { viewer: { login: 'me' } } }));

      await client.graphql('query { viewer { login } }');

      const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
      expect(body.query).toBe('query { viewer { login } }');
      expect(body.variables).toBeUndefined();
    });
  });

  describe('fetchWithRetry', () => {
    it('retries on transient 500 error then succeeds', async () => {
      const client = createClient();

      fetchSpy
        .mockResolvedValueOnce(mockResponse(500))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const promise = client.get<{ ok: boolean }>('repos/test');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retries on transient 502 error', async () => {
      const client = createClient();

      fetchSpy
        .mockResolvedValueOnce(mockResponse(502))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const promise = client.get<{ ok: boolean }>('repos/test');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect(result).toEqual({ ok: true });
    });

    it('retries on transient 503 error', async () => {
      const client = createClient();

      fetchSpy
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const promise = client.get<{ ok: boolean }>('repos/test');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect(result).toEqual({ ok: true });
    });

    it('retries on 429 rate limit error', async () => {
      const client = createClient();

      fetchSpy
        .mockResolvedValueOnce(mockResponse(429))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const promise = client.get<{ ok: boolean }>('repos/test');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect(result).toEqual({ ok: true });
    });

    it('returns last transient response after max retries exhausted', async () => {
      const client = createClient();

      fetchSpy.mockResolvedValue(mockResponse(500));

      const promise = client.get('repos/test').catch((e: unknown) => e);
      // Advance enough for all retry delays: 1000 + 2000 + 4000 = 7000ms
      await vi.advanceTimersByTimeAsync(15000);
      const error = await promise;
      expect(error).toBeInstanceOf(GitHubApiError);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('retries on network errors then succeeds', async () => {
      const client = createClient();

      fetchSpy
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const promise = client.get<{ ok: boolean }>('repos/test');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect(result).toEqual({ ok: true });
    });

    it('throws network error after max retries', async () => {
      const client = createClient();

      fetchSpy.mockRejectedValue(new Error('Network error'));

      const promise = client.get('repos/test').catch((e: unknown) => e);
      // Advance enough for all retry delays: 1000 + 2000 + 4000 = 7000ms
      await vi.advanceTimersByTimeAsync(15000);
      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Network error');
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('times out hung GET requests instead of hanging forever', async () => {
      const client = createClient();
      fetchSpy = mockHangingFetchWithAbort();
      vi.stubGlobal('fetch', fetchSpy);

      const promise = client.get('repos/test').catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(60_000);

      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('GitHub request timed out after 10000ms');
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('uses Retry-After header (seconds) for delay', async () => {
      const client = createClient();

      fetchSpy
        .mockResolvedValueOnce(mockResponse(503, {}, { 'Retry-After': '2' }))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const promise = client.get<{ ok: boolean }>('repos/test');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect(result).toEqual({ ok: true });
    });

    it('uses Retry-After header (date) for delay', async () => {
      const client = createClient();
      const futureDate = new Date(Date.now() + 1000).toUTCString();

      fetchSpy
        .mockResolvedValueOnce(mockResponse(503, {}, { 'Retry-After': futureDate }))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const promise = client.get<{ ok: boolean }>('repos/test');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect(result).toEqual({ ok: true });
    });

    it('caps Retry-After delay at 120 seconds', async () => {
      const client = createClient();

      fetchSpy
        .mockResolvedValueOnce(mockResponse(503, {}, { 'Retry-After': '999' }))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const promise = client.get<{ ok: boolean }>('repos/test');
      // Capped at 120s = 120000ms
      await vi.advanceTimersByTimeAsync(130000);
      const result = await promise;
      expect(result).toEqual({ ok: true });
    });

    it('handles rate limit exhaustion with 403 and remaining=0', async () => {
      const client = createClient();
      const resetTime = Math.floor(Date.now() / 1000) + 1; // 1 second from now

      fetchSpy
        .mockResolvedValueOnce(
          mockResponse(
            403,
            {},
            {
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(resetTime),
            },
          ),
        )
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      const promise = client.get<{ ok: boolean }>('repos/test');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect(result).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does not treat 404 as transient', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(404));

      await expect(client.get('repos/test')).rejects.toThrow(GitHubApiError);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('parseRateLimitHeaders', () => {
    it('ignores non-numeric rate limit header values', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(
        mockResponse(200, {}, { 'X-RateLimit-Remaining': 'not-a-number' }),
      );

      await client.get('repos/test');

      expect(client.getRateLimit().remaining).toBe(-1);
    });

    it('handles missing rate limit headers', async () => {
      const client = createClient();
      fetchSpy.mockResolvedValueOnce(mockResponse(200, {}));

      await client.get('repos/test');

      const rl = client.getRateLimit();
      expect(rl.remaining).toBe(-1);
      expect(rl.total).toBe(-1);
      expect(rl.reset).toBeNull();
    });
  });

  describe('non-GET timeouts', () => {
    it('times out hung POST requests', async () => {
      const client = createClient();
      fetchSpy = mockHangingFetchWithAbort();
      vi.stubGlobal('fetch', fetchSpy);

      const promise = client.post('repos/test', {}).catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(15_000);

      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('GitHub request timed out after 10000ms');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('GitHubAuthError', () => {
    it('has correct name and message', () => {
      const error = new GitHubAuthError('Auth failed');
      expect(error.name).toBe('GitHubAuthError');
      expect(error.message).toBe('Auth failed');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('GitHubApiError', () => {
    it('has correct name, message, and status', () => {
      const error = new GitHubApiError('Not found', 404);
      expect(error.name).toBe('GitHubApiError');
      expect(error.message).toBe('Not found');
      expect(error.status).toBe(404);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
