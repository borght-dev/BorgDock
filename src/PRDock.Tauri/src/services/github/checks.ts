import type { CheckRun, CheckSuite } from '@/types';
import type { GitHubClient } from './client';

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

    if (allRuns.length >= response.total_count || response.check_runs.length < 100) break;
    page++;
  }

  return allRuns;
}

export async function getJobLog(
  client: GitHubClient,
  owner: string,
  repo: string,
  jobId: number,
): Promise<string> {
  return client.getRaw(`repos/${owner}/${repo}/actions/jobs/${jobId}/logs`);
}

export async function rerunWorkflow(
  client: GitHubClient,
  owner: string,
  repo: string,
  runId: number,
): Promise<void> {
  await client.post(`repos/${owner}/${repo}/actions/runs/${runId}/rerun`, {});
}
