import { rawId } from '@/services/dispatch/hosts';
import type { AgentThread, ItemOverview } from '@/services/dispatch/types';
import { refKey } from '@/services/workstreams/identity';
import type { RefKey, SourceRef } from '@/services/workstreams/types';
import type { HostStatus } from '@/stores/dispatch-store';
import type { PullRequestWithChecks } from '@/types';

/** A record BorgDock knows that can join a workstream. */
export interface Candidate {
  key: RefKey;
  ref: SourceRef;
  label: string;
  /** `AB#123`, `acme/shop#12`, `Mac mini · W2`. */
  identity: string;
  kind: 'item' | 'pr' | 'thread';
  /** What the search matches. */
  text: string;
  /** Why it can't be linked yet. */
  unavailable?: string;
}

export interface CandidateSources {
  items: readonly ItemOverview[];
  organization: string | null;
  project: string | null;
  pullRequests: readonly PullRequestWithChecks[];
  threads: readonly AgentThread[];
  hosts: readonly HostStatus[];
}

/** Every record BorgDock knows of, items first, then pull requests, then threads. */
export function candidates(sources: CandidateSources): Candidate[] {
  const found: Candidate[] = [];
  if (sources.organization && sources.project) {
    for (const overview of sources.items) {
      const item = overview.item;
      const ref: SourceRef = {
        kind: 'ado-item',
        organization: sources.organization,
        project: sources.project,
        id: item.id,
      };
      found.push({
        key: refKey(ref),
        ref,
        label: item.title,
        identity: `AB#${item.id}`,
        kind: 'item',
        text: `ab#${item.id} ${item.id} ${item.title} ${item.state}`.toLowerCase(),
      });
    }
  }
  for (const entry of sources.pullRequests) {
    const pr = entry.pullRequest;
    const ref: SourceRef = {
      kind: 'github-pr',
      owner: pr.repoOwner,
      repo: pr.repoName,
      number: pr.number,
    };
    const identity = `${pr.repoOwner}/${pr.repoName}#${pr.number}`;
    found.push({
      key: refKey(ref),
      ref,
      label: pr.title,
      identity,
      kind: 'pr',
      text: `${identity} #${pr.number} ${pr.title} ${pr.headRef}`.toLowerCase(),
    });
  }
  for (const thread of sources.threads) {
    if (thread.subagentOf) continue;
    const host = sources.hosts.find((h) => h.id === thread.hostId);
    const environmentId = host?.environmentId ?? null;
    const ref: SourceRef = {
      kind: 't3-thread',
      environmentId: environmentId ?? '',
      threadId: rawId(thread.hostId, thread.id),
      hostId: thread.hostId,
    };
    found.push({
      key: environmentId ? refKey(ref) : `pending:${thread.id}`,
      ref,
      label: thread.title,
      identity: `${thread.hostLabel} · ${thread.place}`,
      kind: 'thread',
      text: `${thread.title} ${thread.place} ${thread.branch ?? ''} ${thread.hostLabel}`.toLowerCase(),
      unavailable: environmentId
        ? undefined
        : `${thread.hostLabel} has not told BorgDock which T3 it runs yet.`,
    });
  }
  return found;
}

const MAX_RESULTS = 40;

/** The candidates that match every word of `query`, open threads and recent records first. */
export function searchCandidates(all: readonly Candidate[], query: string): Candidate[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches =
    words.length === 0 ? all : all.filter((c) => words.every((word) => c.text.includes(word)));
  return matches.slice(0, MAX_RESULTS);
}
