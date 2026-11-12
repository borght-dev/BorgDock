import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AgentThread, ItemOverview } from '@/services/dispatch/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { usePrStore } from '@/stores/pr-store';
import type { PullRequestWithChecks } from '@/types';
import { mentionsWorkItem } from '../WorkItemDetailPanel/LinksTab';

/** A pull request of the item, with how it is doing. */
export interface ItemPull {
  number: number;
  title: string;
  url: string | null;
  owner: string | null;
  repo: string | null;
  state: 'open' | 'merged' | 'closed';
  checks: { failed: number; pending: number; total: number } | null;
  conflicts: boolean;
}

/** What BorgDock knows around an item: Dispatch's overview, its pull requests and its agent. */
export interface ItemContext {
  overview: ItemOverview | null;
  pulls: ItemPull[];
  thread: AgentThread | null;
}

function fromPolled(pr: PullRequestWithChecks): ItemPull {
  const p = pr.pullRequest;
  return {
    number: p.number,
    title: p.title,
    url: p.htmlUrl,
    owner: p.repoOwner,
    repo: p.repoName,
    state: p.mergedAt ? 'merged' : p.closedAt || p.state === 'closed' ? 'closed' : 'open',
    checks:
      pr.checksUnavailable || pr.totalCheckCount === undefined
        ? null
        : {
            failed: pr.failedCheckNames?.length ?? 0,
            pending: pr.pendingCheckNames?.length ?? 0,
            total: pr.totalCheckCount,
          },
    conflicts: p.mergeable === false,
  };
}

const STATE_RANK: Record<ItemPull['state'], number> = { open: 0, merged: 1, closed: 2 };

/**
 * The item's pull requests (Dispatch's links and the polled pull requests
 * that name `AB#<id>`, open first) and its current agent thread.
 */
export function useItemContext(id: number | undefined): ItemContext {
  const overview = useDispatchStore((s) => {
    if (id === undefined || !s.overview) return null;
    return (
      s.overview.items.find((u) => u.item.id === id) ??
      s.overview.context?.find((u) => u.item.id === id) ??
      null
    );
  });
  const { open, closed } = usePrStore(
    useShallow((s) => ({ open: s.pullRequests, closed: s.closedPullRequests })),
  );
  return useMemo(() => {
    const byNumber = new Map<number, ItemPull>();
    if (id !== undefined) {
      for (const pr of [...open, ...closed]) {
        if (mentionsWorkItem(pr.pullRequest, id))
          byNumber.set(pr.pullRequest.number, fromPolled(pr));
      }
    }
    for (const pr of overview?.pullRequests ?? []) {
      if (pr.shared || byNumber.has(pr.number)) continue;
      byNumber.set(pr.number, {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        owner: null,
        repo: null,
        state: pr.state === 'merged' ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
        checks: pr.checks
          ? { failed: pr.checks.failed, pending: pr.checks.pending, total: pr.checks.total }
          : null,
        conflicts: false,
      });
    }
    const pulls = [...byNumber.values()].sort(
      (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || b.number - a.number,
    );
    return { overview, pulls, thread: overview?.threads[0] ?? null };
  }, [id, open, closed, overview]);
}

/** How a pull request's checks read, for a chip. */
export function checksTone(pull: ItemPull): {
  tone: 'ok' | 'bad' | 'run' | 'mute';
  label: string;
} {
  const c = pull.checks;
  if (!c || c.total === 0) return { tone: 'mute', label: 'no checks' };
  if (c.failed > 0) return { tone: 'bad', label: `${c.failed} failing` };
  if (c.pending > 0) return { tone: 'run', label: 'checks running' };
  return { tone: 'ok', label: `${c.total - c.failed - c.pending}/${c.total}` };
}
