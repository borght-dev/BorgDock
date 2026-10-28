import type { DispatchHost } from './hosts';
import type { AgentProject, AgentThread } from './types';

/**
 * Where an agent starts: a new worktree of a repository, a new thread in the
 * checkout an earlier thread worked in, or that earlier thread itself.
 */
export type LaunchTarget =
  | { kind: 'worktree'; hostId: string; project: AgentProject; baseRef: string | null }
  | { kind: 'thread-worktree'; hostId: string; thread: AgentThread }
  | { kind: 'continue'; hostId: string; thread: AgentThread };

/** A machine T3 runs on, as the environment picker shows it. */
export interface LaunchEnvironment {
  id: string;
  label: string;
  available: boolean;
  /** Threads whose agent is at work right now. */
  running: number;
}

/** What the environment picker reads of each host's last poll. */
export interface HostReach {
  id: string;
  ok: boolean;
}

export function launchEnvironments(
  hosts: readonly DispatchHost[],
  reach: readonly HostReach[],
  threads: readonly AgentThread[],
): LaunchEnvironment[] {
  return hosts.map((host) => ({
    id: host.id,
    label: host.label,
    available: reach.find((r) => r.id === host.id)?.ok ?? false,
    running: threads.filter((t) => t.hostId === host.id && t.status === 'running').length,
  }));
}

function comparablePath(path: string | null): string {
  return (path ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * One project per repository on `hostId`, by repository name: a repository
 * checked out in several projects is listed once, as the project whose
 * checkout is the repository's own (the shortest path; worktrees nest in it).
 */
export function repositoryProjects(
  projects: readonly AgentProject[],
  hostId: string,
): AgentProject[] {
  const byRepository = new Map<string, AgentProject>();
  for (const project of projects) {
    if (project.hostId !== hostId || !project.available || !project.repository) continue;
    const known = byRepository.get(project.repository.key);
    if (
      !known ||
      comparablePath(project.workspaceRoot).length < comparablePath(known.workspaceRoot).length
    ) {
      byRepository.set(project.repository.key, project);
    }
  }
  return [...byRepository.values()].sort((a, b) =>
    repositoryName(a).localeCompare(repositoryName(b)),
  );
}

/** How a project's repository is named in the picker: `name`, else the host's display name. */
export function repositoryName(project: AgentProject): string {
  return project.repository?.name ?? project.repository?.displayName ?? project.title;
}

/** The project for `repository` (`owner/name`) among `projects`, compared case-insensitively. */
export function projectForRepository(
  projects: readonly AgentProject[],
  repository: string | null | undefined,
): AgentProject | undefined {
  if (!repository) return undefined;
  const wanted = repository.toLowerCase();
  return projects.find((project) => {
    const repo = project.repository;
    if (!repo) return false;
    const ownerName = repo.owner && repo.name ? `${repo.owner}/${repo.name}` : repo.displayName;
    return ownerName.toLowerCase() === wanted || repo.key.toLowerCase().endsWith(`/${wanted}`);
  });
}

/**
 * The threads on `project`'s host that work in a checkout of its repository:
 * the ones named in `first` in that order, then the most recently active.
 * Subagents are left out; their work is their root thread's.
 */
export function repositoryThreads(
  threads: readonly AgentThread[],
  projects: readonly AgentProject[],
  project: AgentProject,
  first: readonly string[] = [],
): AgentThread[] {
  const key = project.repository?.key;
  const repositoryOf = new Map(projects.map((p) => [p.id, p.repository?.key]));
  const inRepository = threads.filter(
    (thread) =>
      thread.hostId === project.hostId &&
      !thread.subagentOf &&
      (key ? repositoryOf.get(thread.projectId) === key : thread.projectId === project.id),
  );
  const rank = (thread: AgentThread) => {
    const at = first.indexOf(thread.id);
    return at === -1 ? first.length : at;
  };
  return inRepository.sort(
    (a, b) => rank(a) - rank(b) || b.lastActivityAt.localeCompare(a.lastActivityAt),
  );
}

/** `owner/name` of a GitHub pull request or repository URL. */
export function repositoryOfUrl(url: string | null | undefined): string | null {
  const match = url?.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  return match ? `${match[1]}/${match[2]}` : null;
}

/** A thread takes a new message only once its agent stopped. */
export function canContinue(thread: AgentThread): boolean {
  return thread.available && thread.status !== 'running';
}

/** Where the target runs, as a run's status line names it: "Agent working in …". */
export function targetPlace(target: LaunchTarget): string {
  if (target.kind === 'worktree') return `a new ${repositoryName(target.project)} worktree`;
  if (target.kind === 'continue') return target.thread.title;
  return target.thread.branch ?? `the checkout of ${target.thread.title}`;
}

/** The target in a few words, for a sheet's footer. */
export function targetSummary(target: LaunchTarget, hostLabel: string): string {
  if (target.kind === 'worktree') {
    return `${hostLabel} · ${repositoryName(target.project)} · new worktree${
      target.baseRef ? ` from ${target.baseRef}` : ''
    }`;
  }
  if (target.kind === 'continue') return `${hostLabel} · continues ${target.thread.title}`;
  return `${hostLabel} · new thread in ${targetPlace(target)}`;
}
