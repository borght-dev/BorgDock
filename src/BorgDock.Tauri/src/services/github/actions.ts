import type { GitHubClient } from './client';

/**
 * GitHub Actions and check-run reads for related CI failures: the identity a
 * check run lacks (attempt, tested SHA, failed step, runner), workflow paths,
 * annotations and other apps' check output. Each is one REST request.
 */

interface JobDto {
  id: number;
  run_id: number;
  run_attempt?: number;
  head_sha: string;
  head_branch?: string | null;
  name: string;
  status: string;
  conclusion: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  html_url?: string | null;
  workflow_name?: string | null;
  runner_name?: string | null;
  runner_group_name?: string | null;
  labels?: string[];
  steps?: Array<{ name: string; number: number; status: string; conclusion: string | null }>;
}

export interface ActionsJob {
  id: number;
  runId: number;
  runAttempt: number;
  headSha: string;
  headBranch: string | null;
  name: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string | null;
  workflowName: string | null;
  runnerName: string | null;
  runnerGroup: string | null;
  labels: string[];
  /** The first step that failed, which is where the job stopped. */
  failedStep: { name: string; number: number } | null;
}

function toJob(dto: JobDto): ActionsJob {
  const failed = (dto.steps ?? []).find(
    (step) => step.conclusion === 'failure' || step.conclusion === 'timed_out',
  );
  return {
    id: dto.id,
    runId: dto.run_id,
    runAttempt: dto.run_attempt ?? 1,
    headSha: dto.head_sha,
    headBranch: dto.head_branch ?? null,
    name: dto.name,
    conclusion: dto.conclusion,
    startedAt: dto.started_at ?? null,
    completedAt: dto.completed_at ?? null,
    htmlUrl: dto.html_url ?? null,
    workflowName: dto.workflow_name ?? null,
    runnerName: dto.runner_name ?? null,
    runnerGroup: dto.runner_group_name ?? null,
    labels: dto.labels ?? [],
    failedStep: failed ? { name: failed.name, number: failed.number } : null,
  };
}

export async function getActionsJob(
  client: GitHubClient,
  owner: string,
  repo: string,
  jobId: number,
): Promise<ActionsJob> {
  return toJob(await client.get<JobDto>(`repos/${owner}/${repo}/actions/jobs/${jobId}`));
}

/** The jobs of one attempt of a workflow run, to backfill attempts the poll never saw. */
export async function getRunAttemptJobs(
  client: GitHubClient,
  owner: string,
  repo: string,
  runId: number,
  attempt: number,
): Promise<ActionsJob[]> {
  const response = await client.get<{ jobs: JobDto[] }>(
    `repos/${owner}/${repo}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`,
  );
  return (response.jobs ?? []).map(toJob);
}

interface RunDto {
  id: number;
  name?: string | null;
  path?: string | null;
  workflow_id?: number | null;
  event?: string | null;
  run_attempt?: number;
  run_number?: number;
  head_sha: string;
  head_branch?: string | null;
  status?: string | null;
  conclusion?: string | null;
  created_at?: string | null;
  html_url?: string | null;
}

export interface WorkflowRun {
  id: number;
  name: string | null;
  /** `.github/workflows/ci.yml`; a reusable workflow's caller path. */
  path: string | null;
  workflowId: number | null;
  event: string | null;
  runAttempt: number;
  runNumber: number | null;
  headSha: string;
  headBranch: string | null;
  status: string | null;
  conclusion: string | null;
  createdAt: string | null;
  htmlUrl: string | null;
}

function toRun(dto: RunDto): WorkflowRun {
  return {
    id: dto.id,
    name: dto.name ?? null,
    path: dto.path ? dto.path.replace(/@.*$/, '') : null,
    workflowId: dto.workflow_id ?? null,
    event: dto.event ?? null,
    runAttempt: dto.run_attempt ?? 1,
    runNumber: dto.run_number ?? null,
    headSha: dto.head_sha,
    headBranch: dto.head_branch ?? null,
    status: dto.status ?? null,
    conclusion: dto.conclusion ?? null,
    createdAt: dto.created_at ?? null,
    htmlUrl: dto.html_url ?? null,
  };
}

const runs = new Map<string, Promise<WorkflowRun>>();

/** A workflow run, cached per run id and attempt: neither changes once it fails. */
export function getWorkflowRun(
  client: GitHubClient,
  owner: string,
  repo: string,
  runId: number,
): Promise<WorkflowRun> {
  const key = `${owner}/${repo}#${runId}`.toLowerCase();
  const hit = runs.get(key);
  if (hit) return hit;
  const pending = client.get<RunDto>(`repos/${owner}/${repo}/actions/runs/${runId}`).then(toRun);
  runs.set(key, pending);
  pending.catch(() => runs.delete(key));
  return pending;
}

/** The newest push runs on `branch`, failed or not, newest first. */
export async function listBranchPushRuns(
  client: GitHubClient,
  owner: string,
  repo: string,
  branch: string,
  perPage = 20,
): Promise<WorkflowRun[]> {
  const response = await client.get<{ workflow_runs: RunDto[] }>(
    `repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&event=push&per_page=${perPage}`,
  );
  return (response.workflow_runs ?? []).map(toRun);
}

/**
 * The newest successful push run of a workflow on `branch`, created before
 * `before` when given; null when GitHub has none.
 */
export async function lastPassingPushRun(
  client: GitHubClient,
  owner: string,
  repo: string,
  workflowId: number,
  branch: string,
  before?: string,
): Promise<WorkflowRun | null> {
  const created = before ? `&created=${encodeURIComponent(`<${before}`)}` : '';
  const response = await client.get<{ workflow_runs: RunDto[] }>(
    `repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?branch=${encodeURIComponent(branch)}&event=push&status=success&per_page=1${created}`,
  );
  const [run] = response.workflow_runs ?? [];
  return run ? toRun(run) : null;
}

interface CompareDto {
  total_commits?: number;
  commits?: {
    sha: string;
    html_url?: string;
    commit: { message: string; author?: { name?: string | null } | null };
    author?: { login?: string | null } | null;
    parents?: { sha: string }[];
  }[];
}

export interface ComparedCommit {
  sha: string;
  /** The first line of the message. */
  title: string;
  message: string;
  authorLogin: string | null;
  htmlUrl: string | null;
  parents: string[];
}

/**
 * The commits `head` has that `base` hasn't, oldest first: the first page of
 * up to 100, and how many there are in all (`total`), so a caller can tell
 * the list is cut short.
 */
export async function compareCommits(
  client: GitHubClient,
  owner: string,
  repo: string,
  base: string,
  head: string,
): Promise<{ commits: ComparedCommit[]; total: number }> {
  const response = await client.get<CompareDto>(
    `repos/${owner}/${repo}/compare/${base}...${head}?per_page=100`,
  );
  const commits = (response.commits ?? []).map((c) => ({
    sha: c.sha,
    title: c.commit.message.split('\n')[0] ?? '',
    authorLogin: c.author?.login ?? c.commit.author?.name ?? null,
    htmlUrl: c.html_url ?? null,
    message: c.commit.message,
    parents: (c.parents ?? []).map((p) => p.sha),
  }));
  return { commits, total: Math.max(response.total_commits ?? 0, commits.length) };
}

interface CommitPullDto {
  number: number;
  title: string;
  merged_at?: string | null;
  user?: { login?: string | null } | null;
}

/** The merged pull request a commit came from, or null for a direct push. */
export async function pullOfCommit(
  client: GitHubClient,
  owner: string,
  repo: string,
  sha: string,
): Promise<{ number: number; title: string; authorLogin: string | null } | null> {
  const pulls = await client.get<CommitPullDto[]>(`repos/${owner}/${repo}/commits/${sha}/pulls`);
  const pull = pulls.find((p) => p.merged_at) ?? null;
  return pull
    ? { number: pull.number, title: pull.title, authorLogin: pull.user?.login ?? null }
    : null;
}

interface AnnotationDto {
  path?: string | null;
  start_line?: number | null;
  annotation_level?: string | null;
  title?: string | null;
  message?: string | null;
}

export interface CheckAnnotation {
  path: string | null;
  line: number | null;
  level: string | null;
  title: string | null;
  message: string;
}

/** Failure annotations of a check run, at most `limit`. Warnings and notices are left out. */
export async function getFailureAnnotations(
  client: GitHubClient,
  owner: string,
  repo: string,
  checkRunId: number,
  limit = 20,
): Promise<CheckAnnotation[]> {
  const response = await client.get<AnnotationDto[]>(
    `repos/${owner}/${repo}/check-runs/${checkRunId}/annotations?per_page=50`,
  );
  return (response ?? [])
    .filter((a) => a.annotation_level === 'failure' && a.message)
    .slice(0, limit)
    .map((a) => ({
      path: a.path && a.path !== '.github' ? a.path : null,
      line: a.start_line ?? null,
      level: a.annotation_level ?? null,
      title: a.title ?? null,
      message: a.message ?? '',
    }));
}

interface CheckRunDto {
  name: string;
  head_sha: string;
  conclusion: string | null;
  completed_at?: string | null;
  html_url?: string | null;
  app?: { slug?: string | null } | null;
  output?: { title?: string | null; summary?: string | null; text?: string | null } | null;
}

export interface CheckRunOutput {
  name: string;
  headSha: string;
  conclusion: string | null;
  completedAt: string | null;
  htmlUrl: string | null;
  appSlug: string | null;
  title: string | null;
  summary: string | null;
  text: string | null;
}

const OUTPUT_LIMIT = 8 * 1024;

/** What another app's check run says about its failure, each part capped at 8 KiB. */
export async function getCheckRunOutput(
  client: GitHubClient,
  owner: string,
  repo: string,
  checkRunId: number,
): Promise<CheckRunOutput> {
  const dto = await client.get<CheckRunDto>(`repos/${owner}/${repo}/check-runs/${checkRunId}`);
  const cap = (text: string | null | undefined) => (text ? text.slice(0, OUTPUT_LIMIT) : null);
  return {
    name: dto.name,
    headSha: dto.head_sha,
    conclusion: dto.conclusion,
    completedAt: dto.completed_at ?? null,
    htmlUrl: dto.html_url ?? null,
    appSlug: dto.app?.slug ?? null,
    title: cap(dto.output?.title),
    summary: cap(dto.output?.summary),
    text: cap(dto.output?.text),
  };
}

/** Test-only: forget cached workflow runs. */
export function __resetWorkflowRunCacheForTests(): void {
  runs.clear();
}
