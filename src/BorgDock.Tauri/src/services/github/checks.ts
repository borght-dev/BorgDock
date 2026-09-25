import { createLogger } from '@/services/logger';
import type { CheckRun, CheckSuite } from '@/types';
import { isActionsJob, planRerun, type RerunPlan } from './check-runs';
import type { GitHubClient } from './client';

const log = createLogger('github-checks');

// --- GitHub API DTOs ---

interface GitHubCheckSuiteDto {
  id: number;
  status: string;
  conclusion: string | null;
  head_sha: string;
}

interface GitHubCheckRunDto {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  check_suite: { id: number } | null;
  head_sha?: string;
}

interface GitHubWorkflowRunDto {
  id: number;
  name: string | null;
  check_suite_id: number;
}

interface GitHubWorkflowRunsResponse {
  total_count: number;
  workflow_runs: GitHubWorkflowRunDto[];
}

interface GitHubCheckSuitesResponse {
  total_count: number;
  check_suites: GitHubCheckSuiteDto[];
}

interface GitHubCheckRunsResponse {
  total_count: number;
  check_runs: GitHubCheckRunDto[];
}

// --- Public API ---

export async function getCheckSuites(
  client: GitHubClient,
  owner: string,
  repo: string,
  ref: string,
): Promise<CheckSuite[]> {
  const encodedRef = encodeURIComponent(ref);
  const response = await client.get<GitHubCheckSuitesResponse>(
    `repos/${owner}/${repo}/commits/${encodedRef}/check-suites`,
  );

  return response.check_suites.map((dto) => ({
    id: dto.id,
    status: dto.status,
    conclusion: dto.conclusion ?? undefined,
    headSha: dto.head_sha,
    checkRuns: [],
  }));
}

export async function getCheckRuns(
  client: GitHubClient,
  owner: string,
  repo: string,
  checkSuiteId: number,
): Promise<CheckRun[]> {
  const response = await client.get<GitHubCheckRunsResponse>(
    `repos/${owner}/${repo}/check-suites/${checkSuiteId}/check-runs`,
  );

  return response.check_runs.map((dto) => ({
    id: dto.id,
    name: dto.name,
    status: dto.status,
    conclusion: dto.conclusion ?? undefined,
    startedAt: dto.started_at ?? undefined,
    completedAt: dto.completed_at ?? undefined,
    htmlUrl: dto.html_url,
    checkSuiteId: dto.check_suite?.id ?? checkSuiteId,
  }));
}

export async function getCheckRunsForRef(
  client: GitHubClient,
  owner: string,
  repo: string,
  ref: string,
): Promise<CheckRun[]> {
  const encodedRef = encodeURIComponent(ref);
  const allRuns: CheckRun[] = [];
  let headSha: string | undefined;
  let page = 1;

  while (true) {
    const response = await client.get<GitHubCheckRunsResponse>(
      `repos/${owner}/${repo}/commits/${encodedRef}/check-runs?per_page=100&page=${page}`,
    );

    for (const dto of response.check_runs) {
      allRuns.push({
        id: dto.id,
        name: dto.name,
        status: dto.status,
        conclusion: dto.conclusion ?? undefined,
        startedAt: dto.started_at ?? undefined,
        completedAt: dto.completed_at ?? undefined,
        htmlUrl: dto.html_url,
        checkSuiteId: dto.check_suite?.id ?? 0,
      });
    }

    headSha ??= response.check_runs.find((dto) => dto.head_sha)?.head_sha;
    if (allRuns.length >= response.total_count || response.check_runs.length < 100) break;
    page++;
  }

  if (headSha && allRuns.some(isActionsJob)) {
    await addWorkflowNames(client, owner, repo, headSha, allRuns);
  }
  return allRuns;
}

/**
 * Names each GitHub Actions check run after its workflow: one request lists
 * the head commit's workflow runs, each with its check suite. Best-effort;
 * without it the Checks tab falls back to the run names.
 */
async function addWorkflowNames(
  client: GitHubClient,
  owner: string,
  repo: string,
  headSha: string,
  runs: CheckRun[],
): Promise<void> {
  try {
    const response = await client.get<GitHubWorkflowRunsResponse>(
      `repos/${owner}/${repo}/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`,
    );
    const names = new Map<number, string>();
    for (const wr of response.workflow_runs ?? []) {
      if (wr.name && wr.check_suite_id) names.set(wr.check_suite_id, wr.name);
    }
    for (const run of runs) {
      const name = names.get(run.checkSuiteId);
      if (name) run.workflowName = name;
    }
  } catch (err) {
    log.debug('workflow names lookup failed', { error: String(err), owner, repo });
  }
}

export async function getJobLog(
  client: GitHubClient,
  owner: string,
  repo: string,
  jobId: number,
): Promise<string> {
  return client.getRaw(`repos/${owner}/${repo}/actions/jobs/${jobId}/logs`);
}

/**
 * Reruns failed checks: the failed jobs of each GitHub Actions workflow run
 * (`actions/runs/{id}/rerun-failed-jobs`) and each other app's check suite
 * (`check-suites/{id}/rerequest`), each once. Every request is attempted;
 * the first failure is rethrown afterwards. Resolves to what it rerequested.
 */
export async function rerunFailedChecks(
  client: GitHubClient,
  owner: string,
  repo: string,
  failed: CheckRun[],
): Promise<RerunPlan> {
  const plan = planRerun(failed);
  const results = await Promise.allSettled([
    ...plan.workflowRunIds.map((id) =>
      client.post(`repos/${owner}/${repo}/actions/runs/${id}/rerun-failed-jobs`, {}),
    ),
    ...plan.checkSuiteIds.map((id) =>
      client.post(`repos/${owner}/${repo}/check-suites/${id}/rerequest`, {}),
    ),
  ]);
  const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failure) throw failure.reason;
  return plan;
}

/** Reruns a whole workflow run. `runId` is a workflow run id, never a check suite id. */
export async function rerunWorkflow(
  client: GitHubClient,
  owner: string,
  repo: string,
  runId: number,
): Promise<void> {
  await client.post(`repos/${owner}/${repo}/actions/runs/${runId}/rerun`, {});
}
