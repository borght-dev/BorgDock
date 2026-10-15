import { invoke } from '@tauri-apps/api/core';
import type { AgentQuestion, ThreadPullRequest, ThreadStatus } from '@/services/dispatch/types';

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
  return invoke<T3Snapshot>('t3_snapshot', { host, knownSequence });
}

export function t3ThreadDetail(host: T3HostRef, threadId: string): Promise<T3ThreadDetail> {
  return invoke<T3ThreadDetail>('t3_thread_detail', { host, threadId });
}

/**
 * The first user message per thread. A thread without one comes back with an
 * empty string; a thread missing from the answer can be asked for again.
 */
export function t3FirstUserMessages(
  host: T3HostRef,
  threadIds: string[],
): Promise<Record<string, string>> {
  return invoke<Record<string, string>>('t3_first_user_messages', { host, threadIds });
}

export interface T3ConversationReferences {
  explicitIds: number[];
  mentionedIds: number[];
}

export function t3ConversationReferences(
  host: T3HostRef,
  threadIds: string[],
): Promise<Record<string, T3ConversationReferences>> {
  return invoke('t3_conversation_references', { host, threadIds });
}

/** Answer an agent's questions: question id to the picked option's value or the typed text. */
export function t3Respond(
  host: T3HostRef,
  threadId: string,
  requestId: string,
  answers: Record<string, string | string[]>,
): Promise<void> {
  return invoke('t3_respond', { host, threadId, requestId, answers });
}

/** Send the agent a message and start its next turn. */
export function t3SendMessage(
  host: T3HostRef,
  threadId: string,
  text: string,
  leavePlanMode: boolean,
): Promise<void> {
  return invoke('t3_send_message', { host, threadId, text, leavePlanMode });
}

export function t3Settle(host: T3HostRef, threadId: string): Promise<void> {
  return invoke('t3_settle', { host, threadId });
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
  projectId: string;
  title: string;
  modelSelection: T3ModelSelection;
  /** The first message; the agent starts on it at once. */
  prompt: string;
}

export function t3Catalogue(host: T3HostRef): Promise<T3Catalogue> {
  return invoke<T3Catalogue>('t3_catalogue', { host });
}

/** Start a thread on a project. Resolves with the new thread's id. */
export function t3LaunchThread(host: T3HostRef, request: T3LaunchRequest): Promise<string> {
  return invoke<string>('t3_launch_thread', { host, request });
}

/** Bring T3 Code to the front on one thread. */
export function t3ShowThread(
  host: T3HostRef,
  threadId: string,
  executable: string | undefined,
): Promise<void> {
  return invoke('t3_show_thread', { host, threadId, executable });
}
