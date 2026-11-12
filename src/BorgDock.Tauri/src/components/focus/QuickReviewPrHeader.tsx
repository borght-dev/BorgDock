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
import { ChecksHoverCard } from '@/components/pr/ChecksHoverCard';
import { CHECKS_CARD_SIZE } from '@/components/pr/checks-card-data';
import { avatarInitials, checkCountsFor } from '@/components/pr/pr-card-data';
import { LinkedWorkItemBadge } from '@/components/pr-detail/LinkedWorkItemBadge';
import { PrDescription } from '@/components/shared/PrDescription';
import { PrLabels } from '@/components/shared/PrLabels';
import {
  Avatar,
  checkBarSummary,
  HoverPopover,
  Pill,
  type PillTone,
} from '@/components/shared/primitives';
import type { PullRequest, PullRequestWithChecks, WorkItem } from '@/types';
import { formatAgo } from '@/utils/relative-time';

const ICON = { size: 12, strokeWidth: 2.25, 'aria-hidden': true } as const;

interface CiPill {
  tone: PillTone;
  icon: ReactNode;
  label: string;
  /** There are checks to list in the hover card. */
  hasChecks: boolean;
}

function ciPill(pr: PullRequestWithChecks): CiPill {
  const counts = checkCountsFor(pr);
  const { state } = checkBarSummary(counts);
  if (state === 'fail')
    return {
      tone: 'error',
      icon: <CircleX {...ICON} />,
      label: `CI ${counts.fail} failing`,
      hasChecks: true,
    };
  if (state === 'run')
    return {
      tone: 'warning',
      icon: <Loader {...ICON} />,
      label: `CI ${counts.total - counts.run}/${counts.total}`,
      hasChecks: true,
    };
  if (state === 'ok')
    return {
      tone: 'success',
      icon: <CircleCheck {...ICON} />,
      label: `CI ${counts.ok}/${counts.total}`,
      hasChecks: true,
    };
  return {
    tone: 'neutral',
    icon: null,
    label: counts.unavailable ? 'CI unavailable' : 'No checks',
    hasChecks: false,
  };
}

/**
 * The CI chip. With checks it opens the PR list's checks card on hover, and
 * with `onOpen` a click shows the walk's Checks panel.
 */
function CiChip({ pr, onOpen }: { pr: PullRequestWithChecks; onOpen?: () => void }) {
  const ci = ciPill(pr);
  if (!ci.hasChecks) {
    return (
      <Pill tone={ci.tone} icon={ci.icon}>
        {ci.label}
      </Pill>
    );
  }
  const chip = onOpen ? (
    <button
      type="button"
      className={`bd-pill bd-pill--${ci.tone} qr-prhead__ci`}
      data-ci-chip=""
      onClick={onOpen}
    >
      {ci.icon}
      {ci.label}
    </button>
  ) : (
    <Pill tone={ci.tone} icon={ci.icon} className="qr-prhead__ci" data-ci-chip="">
      {ci.label}
    </Pill>
  );
  return (
    <HoverPopover
      variant="card"
      triggerClassName="qr-prhead__ci-trigger"
      content={<ChecksHoverCard pr={pr} />}
      {...CHECKS_CARD_SIZE}
    >
      {chip}
    </HoverPopover>
  );
}

interface Props {
  pr: PullRequestWithChecks;
  detail: PullRequest;
  workItemIds?: readonly number[];
  workItems?: ReadonlyMap<number, WorkItem>;
  /** Shown as the comments chip when `onOpenComments` is given. */
  commentCount?: number;
  /** A re-review: the PR changed since the viewer's last review. */
  reReview?: boolean;
  /** Chips that only the card shows, before the shared ones. */
  statusChips?: ReactNode;
  /** The regression risk chip, first of the shared ones. */
  risk?: ReactNode;
  /** The description is open in full. */
  expanded?: boolean;
  /** Without it the header has no description toggle (the card shows the description itself). */
  onToggleDescription?: () => void;
  onOpenComments?: () => void;
  onOpenGitHub?: () => void;
  /** Click on the CI chip: show the PR's checks. Without it the chip only hovers. */
  onOpenChecks?: () => void;
  /** Under the header: the re-review banner. */
  children?: ReactNode;
  now?: number;
}

/**
 * The PR on the card and above the file walk, drawn the same in both so
 * switching between them only swaps the body. Row one: the title with its
 * labels, and "Full description" (D) in the walk. Row two: author,
 * repository, number, age and branch, with the status chips on the right.
 * The description opens in place under it.
 */
export function QuickReviewPrHeader({
  pr,
  detail: p,
  workItemIds = [],
  workItems,
  commentCount = 0,
  reReview = false,
  statusChips,
  risk,
  expanded = false,
  onToggleDescription,
  onOpenComments,
  onOpenGitHub,
  onOpenChecks,
  children,
  now,
}: Props) {
  const ago = formatAgo(p.updatedAt, now);
  const hasBody = !!p.body.trim();
  return (
    <header className="qr-prhead" data-expanded={expanded || undefined}>
      <div className="qr-prhead__top">
        <div className="qr-prhead__title">
          <h2 data-pr-title="">{p.title}</h2>
          <PrLabels pr={p} className="qr-prhead__labels" />
        </div>
        {onToggleDescription && hasBody && (
          <button
            type="button"
            className="qr-prhead__more"
            aria-expanded={expanded}
            aria-keyshortcuts="D"
            onClick={onToggleDescription}
          >
            {expanded ? 'Hide description' : 'Full description'}
            <kbd className="qr-key" aria-hidden="true">
              D
            </kbd>
          </button>
        )}
      </div>
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
          {statusChips}
          {risk}
          <CiChip pr={pr} onOpen={onOpenChecks} />
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
            <Pill tone="ghost" icon={<History {...ICON} />}>
              Re-review
            </Pill>
          )}
          {workItemIds.map((id) => (
            <LinkedWorkItemBadge key={id} workItemId={id} workItem={workItems?.get(id)} compact />
          ))}
          {onOpenComments && (
            <button
              type="button"
              className="bd-pill bd-pill--ghost qr-prhead__chip-btn"
              aria-label={`Comments · ${commentCount}`}
              onClick={onOpenComments}
            >
              <MessageSquare {...ICON} />
              {commentCount}
            </button>
          )}
          {onOpenGitHub && (
            <button
              type="button"
              className="bd-pill bd-pill--ghost qr-prhead__chip-btn"
              onClick={onOpenGitHub}
            >
              <ExternalLink {...ICON} />
              GitHub
            </button>
          )}
        </span>
      </div>
      {onToggleDescription && expanded && (
        <div className="qr-prhead__full">
          {hasBody ? (
            <PrDescription body={p.body} />
          ) : (
            <p className="qr-muted">No description provided.</p>
          )}
        </div>
      )}
      {children}
    </header>
  );
}
