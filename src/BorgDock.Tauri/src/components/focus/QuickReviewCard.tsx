import clsx from 'clsx';
import type { ReactNode } from 'react';
import { avatarInitials } from '@/components/pr/pr-card-data';
import { Avatar, Button } from '@/components/shared/primitives';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import { formatAgo } from '@/utils/relative-time';
import { QuickReviewOverview } from './QuickReviewOverview';

export { ciNote } from './quick-review-status';

interface HeaderProps {
  pr: PullRequest;
  now?: number;
  /** Right-hand extras on the "over" line, e.g. Open in GitHub. */
  extra?: ReactNode;
}

/** Author, repository, number and age over the title: every card of the deck has it. */
export function QuickReviewCardHeader({ pr, now, extra }: HeaderProps) {
  const ago = formatAgo(pr.updatedAt, now);
  return (
    <header className="qr-card__head">
      <div className="qr-card__over">
        <Avatar initials={avatarInitials(pr.authorLogin)} size="sm" aria-hidden="true" />
        <span>{pr.authorLogin}</span>
        <span>
          {pr.repoOwner}/{pr.repoName}
        </span>
        <span>#{pr.number}</span>
        {ago && <span>updated {ago}</span>}
        {extra && <span className="qr-card__over-extra">{extra}</span>}
      </div>
      <h2 data-pr-title="" className="qr-card__title">
        {pr.title}
      </h2>
    </header>
  );
}

export interface QuickReviewCardProps {
  /** The PR as the list has it: checks come from here. */
  pr: PullRequestWithChecks;
  /** The freshly loaded PR, when there is one (title, body, sizes). */
  detail?: PullRequest;
  /** Changed file paths; `null` while they load. */
  files: readonly string[] | null;
  /** Paths marked reviewed. */
  reviewed: readonly string[];
  /** Load, stale or submission problems, drawn above the body. */
  alert?: ReactNode;
  /** Replaces the summary body (the review composer). */
  body?: ReactNode;
  /** The action row. */
  actions: ReactNode;
  proof?: ReactNode;
  onFileSelect?: (path: string) => void;
  /** One line under the actions, e.g. why Approve is not possible yet. */
  actionsNote?: ReactNode;
  /** Right-hand extras on the header's "over" line. */
  headerExtra?: ReactNode;
  now?: number;
}

export function QuickReviewCard({
  pr,
  detail,
  files,
  reviewed,
  alert,
  body,
  actions,
  actionsNote,
  headerExtra,
  now,
  proof,
  onFileSelect,
}: QuickReviewCardProps) {
  const p = detail ?? pr.pullRequest;
  return (
    <article
      className={clsx('qr-card', !body && 'qr-card--overview')}
      data-i="0"
      aria-label={`Pull request #${p.number}`}
    >
      <QuickReviewCardHeader pr={p} now={now} extra={headerExtra} />
      {alert}
      {body ?? (
        <QuickReviewOverview
          pr={pr}
          detail={p}
          files={files}
          reviewed={reviewed}
          proof={proof}
          onFileSelect={onFileSelect}
        />
      )}
      <div className="qr-card__actions">
        <div className="qr-act">{actions}</div>
        {actionsNote}
      </div>
    </article>
  );
}

export interface ApproveButtonProps {
  /** Why Approve is not possible yet ("3 files not reviewed yet"); null when it is. */
  issue: string | null;
  busy: boolean;
  onApprove: () => void;
  /** Id of the visible line that says why, for `aria-describedby`. */
  reasonId?: string;
}

/**
 * Approve, blocked until every non-generated file is marked reviewed (and
 * the review can be submitted). Blocked means `aria-disabled`, not
 * `disabled`: the button stays focusable, so a keyboard user reaches it and
 * hears the reason (`reasonId`, the line under the actions); a click does
 * nothing. Hovering shows the same reason as a tooltip.
 */
export function ApproveButton({ issue, busy, onApprove, reasonId }: ApproveButtonProps) {
  return (
    <span className="qr-approve-wrap" data-blocked={issue ? 'true' : undefined}>
      <Button
        variant="secondary"
        size="lg"
        className="qr-approve"
        aria-disabled={issue ? true : undefined}
        loading={busy}
        aria-describedby={issue ? reasonId : undefined}
        aria-keyshortcuts="A ArrowRight"
        onClick={() => {
          if (!issue) onApprove();
        }}
      >
        Approve
      </Button>
      {issue && (
        <span className="qr-tip" aria-hidden="true">
          {issue}
        </span>
      )}
    </span>
  );
}
