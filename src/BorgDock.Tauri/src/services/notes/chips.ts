/**
 * What a reference in a note shows: the live state of the pull request, work
 * item, thread or workstream it names, read from the stores BorgDock already
 * polls. A note never stores a state; a reference nothing has read yet shows
 * only its label.
 */
import { configuredHosts, rawId } from '@/services/dispatch/hosts';
import type { AgentThread, DispatchItem } from '@/services/dispatch/types';
import { THREAD_STATUS_LABEL } from '@/services/dispatch/types';
import { showPr, showWorkItem, showWorkstream } from '@/services/navigation';
import { t3ShowThread } from '@/services/t3/api';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import type { WorkItem } from '@/types';
import type { PullRequestWithChecks } from '@/types/pull-request';
import { getField } from '@/utils/work-item-helpers';
import type { RefToken } from './parse';
import { type RefContext, sourceOfToken } from './vault-index';

export type ChipTone = 'green' | 'red' | 'yellow' | 'purple' | 'merged' | 'muted';

/** The store slices a chip reads; React passes the values it subscribed to. */
export interface ChipSources {
  pullRequests: readonly PullRequestWithChecks[];
  closedPullRequests: readonly PullRequestWithChecks[];
  items: readonly DispatchItem[];
  contextItems: readonly DispatchItem[];
  workItems: readonly WorkItem[];
  threads: readonly AgentThread[];
  hosts: readonly { id: string; environmentId?: string | null }[];
  workstreams: Readonly<Record<string, { document: { title: string } }>>;
}

export function currentChipSources(): ChipSources {
  const pr = usePrStore.getState();
  const dispatch = useDispatchStore.getState();
  return {
    pullRequests: pr.pullRequests,
    closedPullRequests: pr.closedPullRequests,
    items: dispatch.items,
    contextItems: dispatch.contextItems,
    workItems: useWorkItemsStore.getState().workItems,
    threads: dispatch.threads,
    hosts: dispatch.hosts,
    workstreams: useWorkstreamsStore.getState().entries,
  };
}

export interface ChipView {
  /** How the reference is named: `planner#1412`, `AB#48213`, the thread's label. */
  label: string;
  /** What the source says now, or `null` before anything read it. */
  state: string | null;
  tone: ChipTone;
  /** The title the source carries, for the tooltip. */
  title: string | null;
}

function prView(
  token: Extract<RefToken, { kind: 'pr' }>,
  context: RefContext,
  sources: ChipSources,
): ChipView {
  const label = token.owner
    ? `${token.owner}/${token.repo}#${token.number}`
    : `${token.repo}#${token.number}`;
  const source = sourceOfToken(token, context);
  if (!source || source.kind !== 'github-pr')
    return { label, state: null, tone: 'muted', title: null };
  const { pullRequests, closedPullRequests } = sources;
  const match = (p: { pullRequest: { repoOwner: string; repoName: string; number: number } }) =>
    p.pullRequest.number === source.number &&
    p.pullRequest.repoOwner.toLowerCase() === source.owner.toLowerCase() &&
    p.pullRequest.repoName.toLowerCase() === source.repo.toLowerCase();
  const found = pullRequests.find(match) ?? closedPullRequests.find(match);
  if (!found) return { label, state: null, tone: 'muted', title: null };
  const pr = found.pullRequest;
  const title = pr.title;
  if (pr.mergedAt) return { label, state: 'Merged', tone: 'merged', title };
  if (pr.state.toLowerCase() === 'closed') return { label, state: 'Closed', tone: 'muted', title };
  if (pr.isDraft) return { label, state: 'Draft', tone: 'muted', title };
  if (found.overallStatus === 'red') return { label, state: 'Checks failing', tone: 'red', title };
  if (found.overallStatus === 'yellow')
    return { label, state: 'Checks running', tone: 'yellow', title };
  if (pr.reviewStatus === 'approved') return { label, state: 'Approved', tone: 'green', title };
  if (pr.reviewStatus === 'changesRequested') {
    return { label, state: 'Changes requested', tone: 'yellow', title };
  }
  return {
    label,
    state: found.overallStatus === 'green' ? 'Checks passed' : 'Open',
    tone: 'green',
    title,
  };
}

function adoView(token: Extract<RefToken, { kind: 'ado' }>, sources: ChipSources): ChipView {
  const label = `AB#${token.id}`;
  const { items, contextItems } = sources;
  const item = items.find((i) => i.id === token.id) ?? contextItems.find((i) => i.id === token.id);
  if (item) {
    const done = item.stateCategory === 'Completed' || item.stateCategory === 'Resolved';
    return {
      label,
      state: `${item.typeName} · ${item.state}`,
      tone: done ? 'green' : item.stateCategory === 'InProgress' ? 'yellow' : 'purple',
      title: item.title,
    };
  }
  const workItem = sources.workItems.find((w) => w.id === token.id);
  if (workItem) {
    const type = getField(workItem, 'System.WorkItemType');
    const state = getField(workItem, 'System.State');
    return {
      label,
      state: [type, state].filter(Boolean).join(' · ') || null,
      tone: 'purple',
      title: getField(workItem, 'System.Title') || null,
    };
  }
  return { label, state: null, tone: 'muted', title: null };
}

function threadView(token: Extract<RefToken, { kind: 't3' }>, sources: ChipSources): ChipView {
  const label = token.label || `Thread ${token.threadId.slice(0, 8)}`;
  const { threads, hosts } = sources;
  const hostIds = new Set(
    hosts.filter((h) => h.environmentId === token.environmentId).map((h) => h.id),
  );
  const thread = threads.find(
    (t) => hostIds.has(t.hostId) && rawId(t.hostId, t.id) === token.threadId,
  );
  if (!thread) return { label, state: null, tone: 'muted', title: null };
  const tone: ChipTone =
    thread.status === 'running'
      ? 'yellow'
      : thread.status === 'failed'
        ? 'red'
        : thread.status === 'settled'
          ? 'muted'
          : 'purple';
  return { label, state: THREAD_STATUS_LABEL[thread.status], tone, title: null };
}

function workstreamView(
  token: Extract<RefToken, { kind: 'workstream' }>,
  sources: ChipSources,
): ChipView {
  const entry = sources.workstreams[token.id];
  const title = entry?.document.title ?? null;
  return { label: title ?? token.label ?? 'Workstream', state: null, tone: 'purple', title };
}

export function chipView(
  token: RefToken,
  context: RefContext,
  sources: ChipSources = currentChipSources(),
): ChipView {
  switch (token.kind) {
    case 'pr':
      return prView(token, context, sources);
    case 'ado':
      return adoView(token, sources);
    case 't3':
      return threadView(token, sources);
    case 'workstream':
      return workstreamView(token, sources);
  }
}

/** Open what a reference names: the PR or item in BorgDock, the thread in T3. */
export async function openReference(token: RefToken, context: RefContext): Promise<void> {
  switch (token.kind) {
    case 'pr': {
      const source = sourceOfToken(token, context);
      if (source?.kind === 'github-pr') {
        await showPr({ owner: source.owner, repo: source.repo, number: source.number });
      }
      return;
    }
    case 'ado':
      await showWorkItem(token.id);
      return;
    case 'workstream':
      await showWorkstream(token.id);
      return;
    case 't3': {
      const settings = useSettingsStore.getState().settings;
      const known = useDispatchStore
        .getState()
        .hosts.find((h) => h.environmentId === token.environmentId);
      const host = configuredHosts(settings).find((h) => h.id === (known?.id ?? 'local'));
      await t3ShowThread(
        { id: host?.id ?? 'local', baseUrl: host?.baseUrl },
        token.threadId,
        settings.agents?.t3Path,
      );
    }
  }
}

/**
 * A chip as a DOM node, for the editor's widgets. `data-*` carries the
 * token, so `refreshChips` can redraw every chip on screen when a store
 * moves without the editor rebuilding its decorations.
 */
export function renderChipNode(token: RefToken, context: RefContext): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'bd-note-chip';
  chip.dataset.noteChip = JSON.stringify(token);
  paintChip(chip, chipView(token, context));
  // The editor opens thread and workstream links itself; a pull request or
  // work item opens in BorgDock from here.
  if (token.kind === 'pr' || token.kind === 'ado') {
    chip.classList.add('bd-note-chip--button');
    chip.setAttribute('role', 'link');
    chip.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      void openReference(token, context);
    });
  }
  return chip;
}

function paintChip(chip: HTMLElement, view: ChipView) {
  chip.dataset.tone = view.tone;
  chip.title = [view.title, view.state].filter(Boolean).join(' · ');
  chip.replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'bd-note-chip__dot';
  dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'bd-note-chip__label';
  label.textContent = view.label;
  chip.append(dot, label);
  if (view.state) {
    const state = document.createElement('span');
    state.className = 'bd-note-chip__state';
    state.textContent = view.state;
    chip.append(state);
  }
}

/** Redraw every chip on screen from the stores' current state. */
export function refreshChips(context: RefContext) {
  const sources = currentChipSources();
  for (const chip of document.querySelectorAll<HTMLElement>('[data-note-chip]')) {
    try {
      paintChip(chip, chipView(JSON.parse(chip.dataset.noteChip!) as RefToken, context, sources));
    } catch {
      // A chip with a malformed token keeps what it showed.
    }
  }
}
