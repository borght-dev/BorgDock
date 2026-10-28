import {
  CircleCheck,
  CircleX,
  ExternalLink,
  GitMerge,
  History,
  Loader,
  MessageSquare,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { avatarInitials, checkCountsFor } from '@/components/pr/pr-card-data';
import { LinkedWorkItemBadge } from '@/components/pr-detail/LinkedWorkItemBadge';
import { PrDescription } from '@/components/shared/PrDescription';
import { PrLabels } from '@/components/shared/PrLabels';
import { Avatar, checkBarSummary, Pill, type PillTone } from '@/components/shared/primitives';
import type { PullRequest, PullRequestWithChecks, WorkItem } from '@/types';
import { formatAgo } from '@/utils/relative-time';

const ICON = { size: 12, strokeWidth: 2.25, 'aria-hidden': true } as const;

function ciPill(pr: PullRequestWithChecks): { tone: PillTone; icon: ReactNode; label: string } {
  const counts = checkCountsFor(pr);
  const { state } = checkBarSummary(counts);
  if (state === 'fail')
    return { tone: 'error', icon: <CircleX {...ICON} />, label: `CI ${counts.fail} failing` };
  if (state === 'run')
    return {
      tone: 'warning',
      icon: <Loader {...ICON} />,
      label: `CI ${counts.total - counts.run}/${counts.total}`,
    };
  if (state === 'ok')
    return {
      tone: 'success',
      icon: <CircleCheck {...ICON} />,
      label: `CI ${counts.ok}/${counts.total}`,
    };
  return {
    tone: 'neutral',
    icon: null,
    label: counts.unavailable ? 'CI unavailable' : 'No checks',
  };
}

interface Props {
  pr: PullRequestWithChecks;
  detail: PullRequest;
  workItemIds: readonly number[];
  workItems: ReadonlyMap<number, WorkItem>;
  commentCount: number;
  /** A re-review: the PR changed since the viewer's last review. */
  reReview: boolean;
  /** The description is open in full. */
  expanded: boolean;
  onToggleDescription: () => void;
  onOpenComments: () => void;
  onOpenGitHub: () => void;
  /** Under the description: the re-review banner. */
  children?: ReactNode;
  now?: number;
}

/**
 * The PR above the file walk: who, where and what (author, repository,
 * number, branch), status chips, the title with its labels, and the first
 * two lines of the description, opened in full in place with "Full
 * description" (D).
 */
export function QuickReviewPrHeader({
  pr,
  detail: p,
  workItemIds,
  workItems,
  commentCount,
  reReview,
  expanded,
  onToggleDescription,
  onOpenComments,
  onOpenGitHub,
  children,
  now,
}: Props) {
  const ci = ciPill(pr);
  const ago = formatAgo(p.updatedAt, now);
  return (
    <header className="qr-prhead" data-expanded={expanded || undefined}>
      <div className="qr-prhead__over">
        <Avatar initials={avatarInitials(p.authorLogin)} size="sm" aria-hidden="true" />
        <span>{p.authorLogin}</span>
        <span>
          {p.repoOwner}/{p.repoName}
        </span>
        <span>#{p.number}</span>
        {ago && <span>updated {ago}</span>}
        <code className="qr-prhead__branch" title={`${p.headRef} → ${p.baseRef}`}>
          {p.headRef} → {p.baseRef}
        </code>
        <span className="qr-prhead__chips">
          <Pill tone={ci.tone} icon={ci.icon}>
            {ci.label}
          </Pill>
          {p.mergeable === false ? (
            <Pill tone="error" icon={<GitMerge {...ICON} />}>
              Conflicts
            </Pill>
          ) : (
            p.mergeable && (
              <Pill tone="success" icon={<GitMerge {...ICON} />}>
                No conflicts
              </Pill>
            )
          )}
          {p.isDraft && <Pill tone="draft">Draft</Pill>}
          {reReview && (
            <Pill tone="warning" icon={<History {...ICON} />}>
              Re-review
            </Pill>
          )}
          {workItemIds.map((id) => (
            <LinkedWorkItemBadge key={id} workItemId={id} workItem={workItems.get(id)} compact />
          ))}
          <button
            type="button"
            className="bd-pill bd-pill--ghost qr-prhead__chip-btn"
            aria-label={`Comments · ${commentCount}`}
            onClick={onOpenComments}
          >
            <MessageSquare {...ICON} />
            {commentCount}
          </button>
          <button
            type="button"
            className="bd-pill bd-pill--ghost qr-prhead__chip-btn"
            onClick={onOpenGitHub}
          >
            <ExternalLink {...ICON} />
            GitHub
          </button>
        </span>
      </div>
      <div className="qr-prhead__title">
        <h2 data-pr-title="">{p.title}</h2>
        <PrLabels pr={p} className="qr-prhead__labels" />
      </div>
      {p.body.trim() ? (
        <div className="qr-prhead__desc">
          {expanded ? (
            <div className="qr-prhead__full">
              <PrDescription body={p.body} />
            </div>
          ) : (
            <p className="qr-prhead__excerpt">{descriptionExcerpt(p.body)}</p>
          )}
          <button
            type="button"
            className="qr-prhead__more"
            aria-expanded={expanded}
            aria-keyshortcuts="D"
            onClick={onToggleDescription}
          >
            {expanded ? 'Less' : 'Full description'}
          </button>
        </div>
      ) : (
        <p className="qr-prhead__excerpt qr-muted">No description provided.</p>
      )}
      {children}
    </header>
  );
}

/** The description as one line of plain text: headings, images, markup and links dropped. */
export function descriptionExcerpt(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
