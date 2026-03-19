import { describe, expect, it, vi } from 'vitest';
import { getCheckRuns, getCheckRunsForRef, getCheckSuites } from '../checks';
import type { GitHubClient } from '../client';

function createMockClient() {
  return {
    get: vi.fn(),
    getRaw: vi.fn(),
    post: vi.fn(),
    getRateLimit: vi.fn(),
    isRateLimitLow: false,
  } as unknown as GitHubClient;
}

describe('getCheckSuites', () => {
  it('fetches and maps check suites', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      total_count: 1,
      check_suites: [
        {
          id: 100,
          status: 'completed',
          conclusion: 'success',
          head_sha: 'abc123',
        },
      ],
    });

    const result = await getCheckSuites(client, 'owner', 'repo', 'abc123');

    expect(result).toHaveLength(1);
    const suite = result[0]!;
    expect(suite.id).toBe(100);
    expect(suite.status).toBe('completed');
    expect(suite.conclusion).toBe('success');
    expect(suite.headSha).toBe('abc123');
    expect(suite.checkRuns).toEqual([]);

    expect(client.get).toHaveBeenCalledWith('repos/owner/repo/commits/abc123/check-suites');
  });
});

describe('getCheckRuns', () => {
  it('fetches and maps check runs for a suite', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      total_count: 2,
      check_runs: [
        {
          id: 200,
          name: 'build',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-01-15T10:00:00Z',
          completed_at: '2025-01-15T10:05:00Z',
          html_url: 'https://github.com/owner/repo/runs/200',
          check_suite: { id: 100 },
        },
        {
          id: 201,
          name: 'test',
          status: 'completed',
          conclusion: 'failure',
          started_at: '2025-01-15T10:00:00Z',
          completed_at: '2025-01-15T10:10:00Z',
          html_url: 'https://github.com/owner/repo/runs/201',
          check_suite: { id: 100 },
        },
      ],
    });

    const result = await getCheckRuns(client, 'owner', 'repo', 100);

    expect(result).toHaveLength(2);

    const build = result[0]!;
    expect(build.id).toBe(200);
    expect(build.name).toBe('build');
    expect(build.conclusion).toBe('success');
    expect(build.checkSuiteId).toBe(100);

    const test = result[1]!;
    expect(test.id).toBe(201);
    expect(test.name).toBe('test');
    expect(test.conclusion).toBe('failure');

    expect(client.get).toHaveBeenCalledWith('repos/owner/repo/check-suites/100/check-runs');
  });

  it('handles null conclusion', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      total_count: 1,
      check_runs: [
        {
          id: 300,
          name: 'deploy',
          status: 'in_progress',
          conclusion: null,
          started_at: '2025-01-15T10:00:00Z',
          completed_at: null,
          html_url: 'https://github.com/owner/repo/runs/300',
          check_suite: { id: 100 },
        },
      ],
    });

    const result = await getCheckRuns(client, 'owner', 'repo', 100);

    const run = result[0]!;
    expect(run.conclusion).toBeUndefined();
    expect(run.completedAt).toBeUndefined();
  });
});

describe('getCheckRunsForRef', () => {
  it('fetches check runs directly for a ref', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      total_count: 1,
      check_runs: [
        {
          id: 400,
          name: 'lint',
          status: 'completed',
          conclusion: 'success',
          started_at: '2025-01-15T10:00:00Z',
          completed_at: '2025-01-15T10:02:00Z',
          html_url: 'https://github.com/owner/repo/runs/400',
          check_suite: { id: 150 },
        },
      ],
    });

    const result = await getCheckRunsForRef(client, 'owner', 'repo', 'abc123');

    expect(result).toHaveLength(1);
    const run = result[0]!;
    expect(run.id).toBe(400);
    expect(run.checkSuiteId).toBe(150);

    expect(client.get).toHaveBeenCalledWith('repos/owner/repo/commits/abc123/check-runs');
  });
});
