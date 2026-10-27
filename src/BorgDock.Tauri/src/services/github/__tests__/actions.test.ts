import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetWorkflowRunCacheForTests,
  getActionsJob,
  getCheckRunOutput,
  getFailureAnnotations,
  getRunAttemptJobs,
  getWorkflowRun,
  listBranchPushRuns,
} from '../actions';
import type { GitHubClient } from '../client';

function client(get: (path: string) => unknown) {
  return { get: vi.fn(async (path: string) => get(path)) } as unknown as GitHubClient & {
    get: ReturnType<typeof vi.fn>;
  };
}

const JOB = {
  id: 7,
  run_id: 70,
  run_attempt: 2,
  head_sha: 'abc',
  head_branch: 'feat/x',
  name: 'e2e (chromium)',
  status: 'completed',
  conclusion: 'failure',
  runner_name: 'GitHub Actions 12',
  runner_group_name: 'GitHub Actions',
  labels: ['ubuntu-latest'],
  steps: [
    { name: 'Set up job', number: 1, status: 'completed', conclusion: 'success' },
    { name: 'Run e2e', number: 4, status: 'completed', conclusion: 'failure' },
    { name: 'Post Run actions/checkout@v4', number: 9, status: 'completed', conclusion: 'success' },
  ],
};

describe('actions', () => {
  beforeEach(() => __resetWorkflowRunCacheForTests());

  it('reads a job with its attempt, tested SHA, runner and failed step', async () => {
    const c = client(() => JOB);
    const job = await getActionsJob(c, 'o', 'r', 7);
    expect(c.get).toHaveBeenCalledWith('repos/o/r/actions/jobs/7');
    expect(job).toMatchObject({
      runId: 70,
      runAttempt: 2,
      headSha: 'abc',
      runnerGroup: 'GitHub Actions',
      labels: ['ubuntu-latest'],
      failedStep: { name: 'Run e2e', number: 4 },
    });
  });

  it('lists the jobs of an earlier attempt', async () => {
    const c = client(() => ({ jobs: [{ ...JOB, id: 6, run_attempt: 1 }] }));
    const jobs = await getRunAttemptJobs(c, 'o', 'r', 70, 1);
    expect(c.get).toHaveBeenCalledWith('repos/o/r/actions/runs/70/attempts/1/jobs?per_page=100');
    expect(jobs.map((j) => [j.id, j.runAttempt])).toEqual([[6, 1]]);
  });

  it('caches workflow runs and drops the ref from reusable workflow paths', async () => {
    const c = client(() => ({
      id: 70,
      path: '.github/workflows/ci.yml@refs/heads/main',
      workflow_id: 3,
      event: 'pull_request',
      head_sha: 'abc',
      run_number: 12,
    }));
    const run = await getWorkflowRun(c, 'o', 'r', 70);
    await getWorkflowRun(c, 'o', 'r', 70);
    expect(run).toMatchObject({ path: '.github/workflows/ci.yml', workflowId: 3, runNumber: 12 });
    expect(c.get).toHaveBeenCalledTimes(1);
  });

  it('lists push runs on a branch', async () => {
    const c = client(() => ({
      workflow_runs: [{ id: 1, head_sha: 'a', conclusion: 'failure', path: 'ci.yml' }],
    }));
    const listed = await listBranchPushRuns(c, 'o', 'r', 'main');
    expect(c.get).toHaveBeenCalledWith('repos/o/r/actions/runs?branch=main&event=push&per_page=20');
    expect(listed[0]?.conclusion).toBe('failure');
  });

  it('keeps failure annotations only', async () => {
    const c = client(() => [
      {
        path: 'src/a.ts',
        start_line: 3,
        annotation_level: 'failure',
        title: 'TS2322',
        message: 'bad',
      },
      {
        path: '.github',
        annotation_level: 'failure',
        message: 'Process completed with exit code 1.',
      },
      { path: 'src/b.ts', annotation_level: 'warning', message: 'meh' },
    ]);
    expect(await getFailureAnnotations(c, 'o', 'r', 7)).toEqual([
      { path: 'src/a.ts', line: 3, level: 'failure', title: 'TS2322', message: 'bad' },
      {
        path: null,
        line: null,
        level: 'failure',
        title: null,
        message: 'Process completed with exit code 1.',
      },
    ]);
  });

  it('caps other apps check output', async () => {
    const c = client(() => ({
      name: 'sonar',
      head_sha: 'a',
      conclusion: 'failure',
      app: { slug: 'sonarcloud' },
      output: { title: 'Quality gate failed', summary: 'x'.repeat(20_000) },
    }));
    const output = await getCheckRunOutput(c, 'o', 'r', 9);
    expect(output.appSlug).toBe('sonarcloud');
    expect(output.summary).toHaveLength(8 * 1024);
    expect(output.text).toBeNull();
  });
});
