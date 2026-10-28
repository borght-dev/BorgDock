/**
 * Notes and agents: a T3 thread started from a note, the notes that mention
 * a pull request in its Fix / Resolve prompt, and the vault's path in every
 * prompt so an agent can read and write notes with its own file tools.
 */
import { rawId } from '@/services/dispatch/hosts';
import { hostRefOf, type LaunchModel, launchAt, rememberTarget } from '@/services/dispatch/launch';
import type { LaunchTarget } from '@/services/dispatch/launch-target';
import { t3Environment, t3ShowThread } from '@/services/t3/api';
import { refKey } from '@/services/workstreams/identity';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useNotesStore } from '@/stores/notes-store';
import { useSettingsStore } from '@/stores/settings-store';
import { titleOf } from './parse';
import { appendUnderHeading } from './text-edits';
import { trackThread } from './thread-tracking';
import { vaultPath, withVault } from './vault-line';

/** T3 refuses a longer first message. */
export const NOTE_PROMPT_LIMIT = 20_000;
/** Notes added to a Fix / Resolve prompt: enough to read, never the whole vault. */
const PROMPT_NOTES_LIMIT = 12_000;

/**
 * A section for a pull request's Fix / Resolve prompt: every note that
 * mentions it, path and text, clipped so the prompt stays readable.
 */
export function notesForPullRequest(owner: string, repo: string, number: number): string {
  const { index, texts, vaultPath: vault } = useNotesStore.getState();
  const key = refKey({ kind: 'github-pr', owner, repo, number });
  const mentions = index.mentions.get(key) ?? [];
  if (!mentions.length) return '';
  let budget = PROMPT_NOTES_LIMIT;
  const blocks: string[] = [];
  for (const { path } of mentions) {
    const text = texts[path];
    if (text === undefined || budget <= 0) continue;
    const clipped = text.length > budget ? `${text.slice(0, budget)}\n…` : text;
    budget -= clipped.length;
    blocks.push(`### ${titleOf(path)} (${vault ? `${vault}/${path}` : path})\n\n${clipped.trim()}`);
  }
  return blocks.length ? `## My notes about this pull request\n\n${blocks.join('\n\n')}` : '';
}

/**
 * A pull request's agent prompt with the notes that mention it and the
 * vault's path appended: what Fix, Resolve and Monitor hand the agent.
 */
export function withNotesFor(prompt: string, owner: string, repo: string, number: number): string {
  const notes = notesForPullRequest(owner, repo, number);
  return withVault(notes ? `${prompt.trimEnd()}\n\n${notes}` : prompt);
}

/** The first message of a thread started from a note. */
export function notePrompt(path: string, text: string): string {
  const vault = vaultPath();
  const where = vault ? `${vault}/${path}` : path;
  return [
    `This comes from my note "${titleOf(path)}" (${where}). Work on what it asks for.`,
    '',
    text.trim(),
  ].join('\n');
}

export interface NoteThreadRequest {
  path: string;
  target: LaunchTarget;
  /** Absent when the target continues a thread: it keeps its own model. */
  model: LaunchModel | undefined;
  effort: string | null;
  title: string;
  prompt: string;
  openInT3: boolean;
}

const TITLE_LIMIT = 120;

/**
 * Start a T3 thread from a note: the thread's link lands under `## Threads`
 * in the note, and its results are written back when it stops.
 */
export async function startThreadFromNote(request: NoteThreadRequest): Promise<string> {
  const { target } = request;
  if (request.prompt.trim().length > NOTE_PROMPT_LIMIT) {
    throw new Error('The first message is longer than 20,000 characters.');
  }
  const hostRef = hostRefOf(target.hostId);
  const title = request.title.trim().slice(0, TITLE_LIMIT) || titleOf(request.path);
  const threadId = await launchAt({
    target,
    model: request.model,
    effort: request.effort,
    title,
    prompt: request.prompt,
  });
  const rawThreadId = rawId(target.hostId, threadId);
  rememberTarget(target);
  // A continued thread keeps the item it belongs to.
  if (target.kind !== 'continue') useDispatchStore.getState().linkThread(threadId, null);
  const environmentId =
    useDispatchStore.getState().hosts.find((h) => h.id === target.hostId)?.environmentId ??
    (await t3Environment(hostRef));

  const label = title.replace(/[[\]]/g, '');
  const started = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  await useNotesStore
    .getState()
    .update(request.path, (text) =>
      appendUnderHeading(text ?? '', 'Threads', [
        `- [${label}](t3code://threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(rawThreadId)}) · started ${started}`,
      ]),
    );
  trackThread({
    path: request.path,
    hostId: target.hostId,
    threadId: rawThreadId,
    label,
    startedAt: Date.now(),
  });
  if (request.openInT3) {
    await t3ShowThread(
      hostRef,
      rawThreadId,
      useSettingsStore.getState().settings.agents?.t3Path,
    ).catch(() => {});
  }
  return threadId;
}
