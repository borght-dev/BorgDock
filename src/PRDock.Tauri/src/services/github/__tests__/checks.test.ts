import { describe, expect, it, vi } from 'vitest';
import { getCheckRuns, getCheckRunsForRef, getCheckSuites, getJobLog, rerunWorkflow } from '../checks';
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

  it('handles null conclusion in check suites', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      total_count: 1,
      check_suites: [
        {
          id: 200,
          status: 'in_progress',
          conclusion: null,
          head_sha: 'xyz789',
        },
      ],
    });

    const result = await getCheckSuites(client, 'owner', 'repo', 'xyz789');

    expect(result[0]!.conclusion).toBeUndefined();
    expect(result[0]!.status).toBe('in_progress');
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

  it('falls back to checkSuiteId when check_suite is null', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      total_count: 1,
      check_runs: [
        {
          id: 500,
          name: 'deploy',
          status: 'completed',
          conclusion: 'success',
          started_at: null,
          completed_at: null,
          html_url: 'https://github.com/owner/repo/runs/500',
          check_suite: null,
        },
      ],
    });

    const result = await getCheckRuns(client, 'owner', 'repo', 200);

    expect(result[0]!.checkSuiteId).toBe(200);
    expect(result[0]!.startedAt).toBeUndefined();
    expect(result[0]!.completedAt).toBeUndefined();
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

  it('falls back to 0 for checkSuiteId when check_suite is null', async () => {
    const client = createMockClient();
    vi.mocked(client.get).mockResolvedValueOnce({
      total_count: 1,
      check_runs: [
        {
          id: 500,
          name: 'deploy',
          status: 'completed',
          conclusion: 'success',
          started_at: null,
          completed_at: null,
          html_url: 'https://github.com/owner/repo/runs/500',
          check_suite: null,
        },
      ],
    });

    const result = await getCheckRunsForRef(client, 'owner', 'repo', 'abc123');

    expect(result[0]!.checkSuiteId).toBe(0);
  });
});

describe('getJobLog', () => {
  it('fetches raw log content for a job', async () => {
    const client = createMockClient();
    vi.mocked(client.getRaw).mockResolvedValueOnce('2025-01-15 Build started\n2025-01-15 Build completed');

    const result = await getJobLog(client, 'owner', 'repo', 12345);

    expect(result).toBe('2025-01-15 Build started\n2025-01-15 Build completed');
    expect(client.getRaw).toHaveBeenCalledWith('repos/owner/repo/actions/jobs/12345/logs');
  });
});

describe('rerunWorkflow', () => {
  it('triggers a workflow rerun', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValueOnce(undefined);

    await rerunWorkflow(client, 'owner', 'repo', 67890);

    expect(client.post).toHaveBeenCalledWith(
      'repos/owner/repo/actions/runs/67890/rerun',
      {},
    );
  });
});
