import { commands } from '@/generated/commands';
import type {
  AgentQuestion,
  PullRequestState,
  ThreadPullRequest,
  ThreadStatus,
} from '@/services/dispatch/types';
import { THREAD_STATUS_LABEL } from '@/services/dispatch/types';
import { commandData } from '@/services/native-command';

/** Id of the T3 Code on this machine. */
export const LOCAL_T3_HOST_ID = 'local';

/** A T3 server: the one on this machine, or a remote one at `baseUrl`. */
export interface T3HostRef {
  id: string;
  baseUrl?: string;
}

export interface T3Project {
  id: string;
  title: string;
  workspaceRoot: string | null;
}

export interface T3Thread {
  id: string;
  projectId: string;
  title: string;
  branch: string | null;
  worktreePath: string | null;
  createdAt: string;
  lastActivityAt: string;
  updatedAt?: string;
  status: ThreadStatus;
  interactionMode: string;
  runtimeMode: string;
  model: string;
  modelInstance: string | null;
  effort: string | null;
  pullRequests: ThreadPullRequest[];
  /** The top-level thread this subagent works for; null for every other thread. */
  subagentOf?: string | null;
}

export interface T3Snapshot {
  /** False when the host's sequence still equals `knownSequence`; the lists are then empty. */
  changed: boolean;
  sequence: number;
  projects: T3Project[];
  threads: T3Thread[];
}

export interface T3ThreadDetail {
  lastAgentMessage: string | null;
  questionRequestId: string | null;
  questions: AgentQuestion[];
}

export function t3Snapshot(host: T3HostRef, knownSequence: number | null): Promise<T3Snapshot> {
  return commandData(commands.t3Snapshot(host, knownSequence)).then((snapshot) => ({
    ...snapshot,
    threads: snapshot.threads.map((thread) => ({
      ...thread,
      status: (Object.hasOwn(THREAD_STATUS_LABEL, thread.status)
        ? thread.status
        : 'failed') as ThreadStatus,
      pullRequests: thread.pullRequests.map((pr) => ({
        ...pr,
        state: (['open', 'merged', 'closed'].includes(pr.state)
          ? pr.state
          : 'unknown') as PullRequestState,
      })),
    })),
  }));
}

export function t3ThreadDetail(host: T3HostRef, threadId: string): Promise<T3ThreadDetail> {
  return commandData(commands.t3ThreadDetail(host, threadId));
}

/**
 * The first user message per thread. A thread without one comes back with an
 * empty string; a thread missing from the answer can be asked for again.
 */
export function t3FirstUserMessages(
  host: T3HostRef,
  threadIds: string[],
): Promise<Record<string, string>> {
  return commandData(commands.t3FirstUserMessages(host, threadIds));
}

export interface T3ConversationReferences {
  explicitIds: number[];
  mentionedIds: number[];
}

export function t3ConversationReferences(
  host: T3HostRef,
  threadIds: string[],
): Promise<Record<string, T3ConversationReferences>> {
  return commandData(commands.t3ConversationReferences(host, threadIds));
}

/** Answer an agent's questions: question id to the picked option's value or the typed text. */
export function t3Respond(
  host: T3HostRef,
  threadId: string,
  requestId: string,
  answers: Record<string, string | string[]>,
): Promise<void> {
  return commandData(commands.t3Respond(host, threadId, requestId, answers)).then(() => {});
}

/** Send the agent a message and start its next turn. */
export function t3SendMessage(
  host: T3HostRef,
  threadId: string,
  text: string,
  leavePlanMode: boolean,
): Promise<void> {
  return commandData(commands.t3SendMessage(host, threadId, text, leavePlanMode)).then(() => {});
}

export function t3Settle(host: T3HostRef, threadId: string): Promise<void> {
  return commandData(commands.t3Settle(host, threadId)).then(() => {});
}

export interface T3ModelChoice {
  id: string;
  label: string;
  isDefault: boolean;
}

/** One setting a model takes, e.g. its reasoning effort. */
export interface T3ModelOption {
  id: string;
  label: string;
  /** `select` or `boolean`. */
  kind: string;
  choices: T3ModelChoice[];
}

export interface T3Model {
  slug: string;
  name: string;
  isDefault: boolean;
  options: T3ModelOption[];
}

export interface T3Provider {
  instanceId: string;
  driver: string;
  displayName: string;
  models: T3Model[];
}

/** What a host can start: the providers that are ready, with their models. */
export interface T3Catalogue {
  environmentId: string;
  providers: T3Provider[];
}

/** A model with its settings, as T3 takes it when a thread starts. */
export interface T3ModelSelection {
  instanceId: string;
  model: string;
  options: { id: string; value: string | boolean }[];
}

export interface T3LaunchRequest {
  /** Null uses T3's No project workspace, with a fresh folder for the thread. */
  projectId: string | null;
  title: string;
  modelSelection: T3ModelSelection;
  /** The first message; the agent starts on it at once. */
  prompt: string;
}

export function t3Catalogue(host: T3HostRef): Promise<T3Catalogue> {
  return commandData(commands.t3Catalogue(host));
}

/** Start a thread on a project. Resolves with the new thread's id. */
export function t3LaunchThread(host: T3HostRef, request: T3LaunchRequest): Promise<string> {
  return commandData(
    commands.t3LaunchThread(host, {
      ...request,
      modelSelection: {
        ...request.modelSelection,
        options: request.modelSelection.options.map((option) => ({ ...option })),
      },
    }),
  );
}

/** Bring T3 Code to the front on one thread. */
export function t3ShowThread(
  host: T3HostRef,
  threadId: string,
  executable: string | undefined,
): Promise<void> {
  return commandData(commands.t3ShowThread(host, threadId, executable ?? null)).then(() => {});
}

/** The id of the T3 install behind `host`; it names a thread across hosts. */
export function t3Environment(host: T3HostRef): Promise<string> {
  return commandData(commands.t3Environment(host));
}
