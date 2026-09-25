import { describe, expect, it, vi } from 'vitest';
import {
  getCheckRuns,
  getCheckRunsForRef,
  getCheckSuites,
  getJobLog,
  rerunFailedChecks,
  rerunWorkflow,
} from '../checks';
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

    expect(client.get).toHaveBeenCalledWith(
      'repos/owner/repo/commits/abc123/check-runs?per_page=100&page=1',
    );
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

describe('getCheckRunsForRef workflow names', () => {
  it('names Actions runs after their workflow, looked up once for the head commit', async () => {
    const client = createMockClient();
    const dto = (id: number, suite: number, url: string) => ({
      id,
      name: `job ${id}`,
      status: 'completed',
      conclusion: 'success',
      started_at: null,
      completed_at: null,
      html_url: url,
      check_suite: { id: suite },
      head_sha: 'sha9',
    });
    vi.mocked(client.get)
      .mockResolvedValueOnce({
        total_count: 3,
        check_runs: [
          dto(1, 11, 'https://github.com/o/r/actions/runs/70/job/1'),
          dto(2, 12, 'https://github.com/o/r/actions/runs/71/job/2'),
          dto(3, 13, 'https://codecov.io/x'),
        ],
      })
      .mockResolvedValueOnce({
        total_count: 2,
        workflow_runs: [
          { id: 70, name: 'CI', check_suite_id: 11 },
          { id: 71, name: 'Docs', check_suite_id: 12 },
        ],
      });

    const runs = await getCheckRunsForRef(client, 'o', 'r', 'feature/x');

    expect(client.get).toHaveBeenLastCalledWith(
      'repos/o/r/actions/runs?head_sha=sha9&per_page=100',
    );
    expect(runs.map((r) => r.workflowName)).toEqual(['CI', 'Docs', undefined]);
  });

  it('keeps the runs when the lookup fails, and skips it without Actions runs', async () => {
    const client = createMockClient();
    const run = {
      id: 1,
      name: 'job',
      status: 'completed',
      conclusion: 'success',
      started_at: null,
      completed_at: null,
      html_url: 'https://github.com/o/r/actions/runs/70/job/1',
      check_suite: { id: 11 },
      head_sha: 'sha9',
    };
    vi.mocked(client.get)
      .mockResolvedValueOnce({ total_count: 1, check_runs: [run] })
      .mockRejectedValueOnce(new Error('403'));
    expect(await getCheckRunsForRef(client, 'o', 'r', 'x')).toHaveLength(1);

    vi.mocked(client.get).mockReset();
    vi.mocked(client.get).mockResolvedValueOnce({
      total_count: 1,
      check_runs: [{ ...run, html_url: 'https://github.com/o/r/runs/1' }],
    });
    await getCheckRunsForRef(client, 'o', 'r', 'x');
    expect(client.get).toHaveBeenCalledTimes(1);
  });
});

describe('rerunFailedChecks', () => {
  const failed = (id: number, htmlUrl: string, checkSuiteId = 50) => ({
    id,
    name: `check ${id}`,
    status: 'completed',
    conclusion: 'failure',
    htmlUrl,
    checkSuiteId,
  });

  it('reruns the failed jobs of each Actions workflow run once', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValue(undefined);
    const plan = await rerunFailedChecks(client, 'o', 'r', [
      failed(1, 'https://github.com/o/r/actions/runs/70/job/1'),
      failed(2, 'https://github.com/o/r/actions/runs/70/job/2'),
      failed(3, 'https://github.com/o/r/actions/runs/71/job/3'),
    ]);
    expect(plan).toEqual({ workflowRunIds: [70, 71], checkSuiteIds: [] });
    expect(vi.mocked(client.post).mock.calls).toEqual([
      ['repos/o/r/actions/runs/70/rerun-failed-jobs', {}],
      ['repos/o/r/actions/runs/71/rerun-failed-jobs', {}],
    ]);
  });

  it('rerequests the check suite of checks from other apps', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockResolvedValue(undefined);
    await rerunFailedChecks(client, 'o', 'r', [
      failed(1, 'https://codecov.io/gh/o/r', 90),
      failed(2, 'https://vercel.com/o/r', 90),
    ]);
    expect(vi.mocked(client.post).mock.calls).toEqual([
      ['repos/o/r/check-suites/90/rerequest', {}],
    ]);
  });

  it('does both for a mix, tries every request and rethrows the first failure', async () => {
    const client = createMockClient();
    vi.mocked(client.post).mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce(undefined);
    await expect(
      rerunFailedChecks(client, 'o', 'r', [
        failed(1, 'https://github.com/o/r/actions/runs/70/job/1', 11),
        failed(2, 'https://codecov.io/gh/o/r', 90),
        failed(3, 'no url', 0),
      ]),
    ).rejects.toThrow('403');
    expect(vi.mocked(client.post).mock.calls).toEqual([
      ['repos/o/r/actions/runs/70/rerun-failed-jobs', {}],
      ['repos/o/r/check-suites/90/rerequest', {}],
    ]);
  });
});

describe('getJobLog', () => {
  it('fetches raw log content for a job', async () => {
    const client = createMockClient();
    vi.mocked(client.getRaw).mockResolvedValueOnce(
      '2025-01-15 Build started\n2025-01-15 Build completed',
    );

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

    expect(client.post).toHaveBeenCalledWith('repos/owner/repo/actions/runs/67890/rerun', {});
  });
});
