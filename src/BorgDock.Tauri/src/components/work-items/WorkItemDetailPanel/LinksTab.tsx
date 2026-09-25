// src/components/work-items/WorkItemDetailPanel/LinksTab.tsx
import { GitPullRequest } from 'lucide-react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { showPr } from '@/services/navigation';
import { usePrStore } from '@/stores/pr-store';
import type { PullRequest } from '@/types';
import type { LinkedPR } from './parseLinkedPRs';

/** A GitHub pull request that mentions the work item (`AB#<id>` in its title, body or branch). */
export interface MentioningPr {
  owner: string;
  repo: string;
  number: number;
  title: string;
  state: 'open' | 'merged' | 'closed';
}

function toMentioning(pr: PullRequest): MentioningPr {
  return {
    owner: pr.repoOwner,
    repo: pr.repoName,
    number: pr.number,
    title: pr.title,
    state: pr.mergedAt ? 'merged' : pr.closedAt || pr.state === 'closed' ? 'closed' : 'open',
  };
}

const AB_MENTION = /\bAB#(\d+)\b/gi;

/**
 * True when the PR names work item `id` as `AB#<id>` in its title, body,
 * branch or labels. Only the explicit Azure Boards form counts: a plain
 * `#1234` is as likely a GitHub issue or PR (unlike `detectWorkItemIds`,
 * which also takes large plain numbers for the PR detail's badge).
 */
export function mentionsWorkItem(pr: PullRequest, id: number): boolean {
  const text = [pr.title, pr.body, pr.headRef, ...(pr.labels ?? [])].join(' ');
  for (const match of text.matchAll(AB_MENTION)) {
    if (Number(match[1]) === id) return true;
  }
  return false;
}

/**
 * The pull requests in the main window's list (open and recently closed)
 * that mention work item `id` as `AB#<id>`. Empty in a window whose PR store
 * is not filled (the pop-out).
 */
export function useMentioningPrs(id: number | undefined): MentioningPr[] {
  const { open, closed } = usePrStore(
    useShallow((s) => ({ open: s.pullRequests, closed: s.closedPullRequests })),
  );
  return useMemo(() => {
    if (id === undefined) return [];
    return [...open, ...closed]
      .map((p) => p.pullRequest)
      .filter((pr) => mentionsWorkItem(pr, id))
      .map(toMentioning);
  }, [id, open, closed]);
}

interface Props {
  linkedPRs: LinkedPR[];
  /** GitHub PRs that mention the item; each opens with `showPr`. */
  mentioningPrs?: MentioningPr[];
}

export function LinksTab({ linkedPRs, mentioningPrs = [] }: Props) {
  if (linkedPRs.length === 0 && mentioningPrs.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No linked items.</div>;
  }
  return (
    <div className="bd-pr-panel">
      {mentioningPrs.map((pr) => (
        <button
          key={`${pr.owner}/${pr.repo}#${pr.number}`}
          type="button"
          className="bd-pr-mini-row bd-wi-link-pr"
          data-linked-pr={`${pr.owner}/${pr.repo}#${pr.number}`}
          // Stay in Work items: Back from the PR returns to this item.
          onClick={() =>
            void showPr({ owner: pr.owner, repo: pr.repo, number: pr.number, keepSection: true })
          }
        >
          <GitPullRequest
            size={13}
            strokeWidth={2.25}
            className="shrink-0 text-[var(--color-text-muted)]"
            aria-hidden
          />
          <span className="bd-pr-item__number">#{pr.number}</span>
          <span className="min-w-0 flex-1 truncate">{pr.title}</span>
          <span className="bd-wi-link-pr__meta">
            {pr.repo}
            {pr.state !== 'open' && `, ${pr.state}`}
          </span>
        </button>
      ))}
      {linkedPRs.map((pr) => (
        <div key={pr.id} className="bd-pr-mini-row">
          <GitPullRequest
            size={13}
            strokeWidth={2.25}
            className="shrink-0 text-[var(--color-text-muted)]"
            aria-hidden
          />
          <span className="bd-pr-item__number">#{pr.id}</span>
          {pr.comment && <span className="min-w-0 flex-1 truncate">{pr.comment}</span>}
        </div>
      ))}
    </div>
  );
}
