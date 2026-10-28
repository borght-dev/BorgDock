import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { SearchSelect, type SearchSelectSection, Seg2 } from '@/components/shared/primitives';
import { configuredHosts } from '@/services/dispatch/hosts';
import { hostRefOf } from '@/services/dispatch/launch';
import {
  canContinue,
  type LaunchEnvironment,
  type LaunchTarget,
  launchEnvironments,
  projectForRepository,
  repositoryName,
  repositoryProjects,
  repositoryThreads,
} from '@/services/dispatch/launch-target';
import {
  type AgentProject,
  type AgentThread,
  THREAD_STATUS_LABEL,
} from '@/services/dispatch/types';
import { type T3Branch, t3ListBranches } from '@/services/t3/api';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';

/** Branch lists are read again after this long. */
const BRANCHES_TTL_MS = 60_000;
const branchLists = new Map<string, { at: number; branches: T3Branch[] }>();

interface BranchesState {
  branches: T3Branch[];
  error: string | null;
}

const NO_BRANCHES: BranchesState = { branches: [], error: null };

/** The branches of the checkout at `checkout` on `hostId`, read when either changes. */
function useBranches(hostId: string | null, checkout: string | null): BranchesState {
  const [state, setState] = useState<BranchesState>(NO_BRANCHES);
  useEffect(() => {
    if (!hostId || !checkout) {
      setState(NO_BRANCHES);
      return;
    }
    const key = `${hostId}\n${checkout}`;
    const cached = branchLists.get(key);
    if (cached && Date.now() - cached.at < BRANCHES_TTL_MS) {
      setState({ branches: cached.branches, error: null });
      return;
    }
    let cancelled = false;
    setState(NO_BRANCHES);
    t3ListBranches(hostRefOf(hostId), checkout)
      .then((branches) => {
        branchLists.set(key, { at: Date.now(), branches });
        if (!cancelled) setState({ branches, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ branches: [], error: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [hostId, checkout]);
  return state;
}

/** What a sheet knows about the work it starts, so the control can preselect. */
export interface TargetContext {
  /** `owner/name` of the repository the work is in: picks the project. */
  repository?: string | null;
  /** Threads that belong to the work, newest first: listed first under Existing thread. */
  threadIds?: readonly string[];
  /** Open on Existing thread with this one picked: a handoff goes back to where the work was done. */
  preferThread?: string | null;
  /** The environment to preselect, e.g. the one the last run went to. */
  hostId?: string | null;
  /** What a new worktree starts from when nothing was picked; the default branch when absent. */
  baseRef?: string | null;
  /**
   * The branch of a pull request: a new worktree checks it out instead of
   * cutting a branch, and only that repository's project will do.
   */
  pullRequestBranch?: string | null;
}

export type WorkspaceMode = 'worktree' | 'thread';
export type ThreadUse = 'continue' | 'new-thread';

/** The environment, project and workspace a sheet starts an agent in. */
export interface LaunchTargetChoice {
  environments: LaunchEnvironment[];
  hostId: string | null;
  setHostId: (id: string) => void;
  projects: AgentProject[];
  project: AgentProject | undefined;
  setProjectId: (id: string) => void;
  /** The work names a repository the environment has no project for. */
  missingRepository: string | null;
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  branches: T3Branch[];
  branchError: string | null;
  baseRef: string | null;
  setBaseRef: (ref: string) => void;
  threads: AgentThread[];
  thread: AgentThread | undefined;
  setThreadId: (id: string) => void;
  use: ThreadUse;
  setUse: (use: ThreadUse) => void;
  pullRequestBranch: string | null;
  /** Ready to start; undefined while something is missing. */
  target: LaunchTarget | undefined;
}

/** Environment, project and workspace, preselected from the work and from last time. */
export function useLaunchTarget(context: TargetContext = {}): LaunchTargetChoice {
  const settings = useSettingsStore((s) => s.settings);
  const reach = useDispatchStore((s) => s.hosts);
  const allProjects = useDispatchStore((s) => s.projects);
  const allThreads = useDispatchStore((s) => s.threads);
  const remembered = useDispatchStore((s) => s.launchPreferences.target);
  const [pickedHost, setPickedHost] = useState<string | null>(null);
  const [pickedRepository, setPickedRepository] = useState<string | null>(null);
  const [pickedMode, setPickedMode] = useState<WorkspaceMode | null>(null);
  const [pickedBase, setPickedBase] = useState<string | null>(null);
  const [pickedThread, setPickedThread] = useState<string | null>(null);
  const [pickedUse, setPickedUse] = useState<ThreadUse | null>(null);

  const environments = launchEnvironments(configuredHosts(settings), reach, allThreads);
  const isAvailable = (id: string | null | undefined): id is string =>
    !!id && environments.some((env) => env.id === id && env.available);
  const hostId =
    [pickedHost, context.hostId, remembered?.hostId].find(isAvailable) ??
    environments.find((env) => env.available)?.id ??
    null;

  const projects = hostId ? repositoryProjects(allProjects, hostId) : [];
  const forWork = projectForRepository(projects, context.repository);
  const pullRequestBranch = context.pullRequestBranch ?? null;
  const project = pullRequestBranch
    ? forWork
    : (projects.find((p) => p.repository?.key === pickedRepository) ??
      forWork ??
      projects.find((p) => p.repository?.key === remembered?.repository) ??
      projects[0]);
  const missingRepository = context.repository && !forWork ? context.repository : null;

  const threads = project
    ? repositoryThreads(allThreads, allProjects, project, context.threadIds)
    : [];
  const preferred = threads.find((t) => t.id === context.preferThread);
  const mode = pickedMode ?? (preferred ? 'thread' : 'worktree');
  const thread = threads.find((t) => t.id === pickedThread) ?? preferred ?? threads[0];
  const use = thread && canContinue(thread) ? (pickedUse ?? 'continue') : 'new-thread';

  const listsBranches = mode === 'worktree' && !pullRequestBranch;
  const { branches, error: branchError } = useBranches(
    listsBranches ? hostId : null,
    listsBranches ? (project?.workspaceRoot ?? null) : null,
  );
  const defaultBranch =
    branches.find((b) => b.isDefault && !b.isRemote) ?? branches.find((b) => b.isDefault);
  const baseRef = pickedBase ?? context.baseRef ?? defaultBranch?.name ?? null;

  let target: LaunchTarget | undefined;
  if (hostId && mode === 'worktree' && project) {
    target = { kind: 'worktree', hostId, project, baseRef };
  } else if (hostId && mode === 'thread' && thread) {
    target =
      use === 'continue'
        ? { kind: 'continue', hostId, thread }
        : { kind: 'thread-worktree', hostId, thread };
  }

  return {
    environments,
    hostId,
    setHostId: (id) => {
      setPickedHost(id);
      setPickedThread(null);
      setPickedBase(null);
    },
    projects,
    project,
    setProjectId: (id) => {
      setPickedRepository(projects.find((p) => p.id === id)?.repository?.key ?? null);
      setPickedThread(null);
      setPickedBase(null);
    },
    missingRepository,
    mode,
    setMode: setPickedMode,
    branches,
    branchError,
    baseRef,
    setBaseRef: setPickedBase,
    threads,
    thread,
    setThreadId: (id) => {
      setPickedThread(id);
      setPickedUse(null);
    },
    use,
    setUse: setPickedUse,
    pullRequestBranch,
    target,
  };
}

/** Newest activity first; the work's own threads in a section of their own. */
function threadSections(
  threads: readonly AgentThread[],
  ownIds: readonly string[],
): SearchSelectSection[] {
  const option = (thread: AgentThread) => ({
    value: thread.id,
    label: thread.title,
    badge: thread.status === 'settled' ? (thread.branch ?? '') : THREAD_STATUS_LABEL[thread.status],
  });
  const own = threads.filter((t) => ownIds.includes(t.id));
  const others = threads.filter((t) => !ownIds.includes(t.id));
  return [
    ...(own.length > 0 ? [{ label: 'This work', options: own.map(option) }] : []),
    ...(others.length > 0 ? [{ label: 'Recent', options: others.map(option) }] : []),
  ];
}

function branchSections(branches: readonly T3Branch[]): SearchSelectSection[] {
  const sorted = [...branches].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || Number(a.isRemote) - Number(b.isRemote),
  );
  return [
    {
      label: 'Branches',
      options: sorted.map((b) => ({
        value: b.name,
        label: b.name,
        badge: b.isDefault ? 'default' : undefined,
      })),
    },
  ];
}

const WORKSPACE_OPTIONS: { value: WorkspaceMode; label: string }[] = [
  { value: 'worktree', label: 'New worktree' },
  { value: 'thread', label: 'Existing thread' },
];

const PULL_REQUEST_OPTIONS: { value: WorkspaceMode; label: string }[] = [
  { value: 'worktree', label: 'Check out the branch' },
  { value: 'thread', label: 'Existing thread' },
];

interface LaunchTargetFieldsProps {
  choice: LaunchTargetChoice;
  /** Threads the work owns, shown first in the thread list. */
  ownThreadIds?: readonly string[];
  /** What using the picked thread itself is called: it takes the first message, or is only shown. */
  continueLabel?: string;
}

/** LaunchTargetFields — the environment cards, the project and the workspace. */
export function LaunchTargetFields({
  choice,
  ownThreadIds = [],
  continueLabel = 'Continue it',
}: LaunchTargetFieldsProps) {
  const { environments, hostId, project, mode, thread, pullRequestBranch } = choice;
  const hostLabel = environments.find((env) => env.id === hostId)?.label ?? '';
  return (
    <>
      <section aria-label="Environment">
        <h3 className="bd-dp-sheet__label">
          <span>Environment</span>
          <span>T3 runs on</span>
        </h3>
        <div className="bd-lt__envs" role="radiogroup" aria-label="Environment">
          {environments.map((env) => (
            <button
              key={env.id}
              type="button"
              role="radio"
              aria-checked={env.id === hostId}
              disabled={!env.available}
              className={clsx('bd-lt__env', env.id === hostId && 'bd-lt__env--on')}
              onClick={() => choice.setHostId(env.id)}
            >
              <span className="bd-lt__env-name">
                {env.label}
                <span className="bd-lt__env-dot" data-online={env.available ? 'true' : undefined} />
              </span>
              <small className="bd-lt__env-detail">
                {env.available ? `${env.running} running` : 'offline'}
              </small>
            </button>
          ))}
        </div>
        {environments.every((env) => !env.available) && (
          <p className="bd-dp-sheet__hint bd-lt__note">
            No T3 answers. Pair with T3 in Settings → Agents, or start T3.
          </p>
        )}
      </section>

      <section aria-label="Project">
        <h3 className="bd-dp-sheet__label">
          <span>Project</span>
          {project?.repository && <span>{project.repository.displayName}</span>}
        </h3>
        <SearchSelect
          ariaLabel="Project"
          value={project?.id ?? ''}
          sections={[
            {
              label: `Repositories on ${hostLabel}`,
              options: choice.projects.map((p) => ({
                value: p.id,
                label: repositoryName(p),
                // The T3 project's own name, when it says more than the repository's.
                badge:
                  p.title.toLowerCase() === repositoryName(p).toLowerCase() ? undefined : p.title,
              })),
            },
          ]}
          onChange={choice.setProjectId}
          filterPlaceholder="Filter repositories"
          disabled={choice.projects.length === 0 || !!pullRequestBranch}
          placeholder={hostId ? 'No repositories in T3 here' : 'Pick an environment first'}
        />
        {choice.missingRepository && (
          <p className="bd-dp-sheet__hint bd-lt__note">
            T3 on {hostLabel} has no project for {choice.missingRepository}. Add it in T3
            {pullRequestBranch ? ' to open this pull request there.' : ', or pick another.'}
          </p>
        )}
      </section>

      <section aria-label="Workspace" className="bd-lt__workspace">
        <h3 className="bd-dp-sheet__label">Workspace</h3>
        <Seg2
          ariaLabel="Workspace"
          size="sm"
          full
          value={mode}
          options={pullRequestBranch ? PULL_REQUEST_OPTIONS : WORKSPACE_OPTIONS}
          onChange={choice.setMode}
        />
        {mode === 'worktree' && !pullRequestBranch && (
          <>
            <div className="bd-lt__from">
              <span className="bd-lt__from-label">From</span>
              <SearchSelect
                ariaLabel="Start from"
                value={choice.baseRef ?? ''}
                sections={branchSections(choice.branches)}
                onChange={choice.setBaseRef}
                filterPlaceholder="Filter branches"
                disabled={choice.branches.length === 0}
                placeholder={
                  choice.branchError
                    ? 'The default branch'
                    : project
                      ? 'Loading branches…'
                      : 'Pick a project first'
                }
              />
            </div>
            <p className="bd-dp-sheet__hint">
              T3 makes a fresh checkout for the thread, as a new thread in T3 does.
            </p>
          </>
        )}
        {mode === 'worktree' && pullRequestBranch && (
          <p className="bd-dp-sheet__hint">
            T3 checks out <code className="bd-lt__code">{pullRequestBranch}</code> in a worktree, or
            reuses the one that has it.
          </p>
        )}
        {mode === 'thread' &&
          (choice.threads.length === 0 ? (
            <p className="bd-dp-sheet__hint">
              No threads in {project ? repositoryName(project) : 'this repository'} on {hostLabel}{' '}
              yet.
            </p>
          ) : (
            <>
              <SearchSelect
                ariaLabel="Thread"
                value={thread?.id ?? ''}
                sections={threadSections(choice.threads, ownThreadIds)}
                onChange={choice.setThreadId}
                filterPlaceholder="Filter threads"
              />
              {thread && canContinue(thread) ? (
                <Seg2
                  ariaLabel="Use the thread"
                  size="sm"
                  full
                  value={choice.use}
                  options={[
                    { value: 'continue', label: continueLabel },
                    { value: 'new-thread', label: 'New thread, same checkout' },
                  ]}
                  onChange={choice.setUse}
                />
              ) : (
                <p className="bd-dp-sheet__hint">
                  Its agent is still at work, so a new thread starts in the same checkout.
                </p>
              )}
            </>
          ))}
      </section>
    </>
  );
}
