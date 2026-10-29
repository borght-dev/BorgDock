import clsx from 'clsx';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ROW_CHIP_LABEL,
  type RowChipKind,
  rowChipFor,
  toPrCardData,
} from '@/components/pr/pr-card-data';
import { Button, Pill } from '@/components/shared/primitives';
import { useReviewReadiness } from '@/hooks/useReviewReadiness';
import { useWorkItemLinks } from '@/hooks/useWorkItemLinks';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import { QuickReviewOverview } from './QuickReviewOverview';
import { QuickReviewPrHeader } from './QuickReviewPrHeader';

export { ciNote } from './quick-review-status';

type Readiness = ReturnType<typeof useReviewReadiness>;

/**
 * What only the card says about the PR, as chips beside the header's shared
 * ones: the review state and the required checks as facts, in grey; a
 * required check that needs attention and a stacked PR in colour, since
 * those need you.
 */
/** The shared header draws these itself. */
const HEADER_PILLS: ReadonlySet<RowChipKind> = new Set(['conflicts', 'draft']);

function StatusChips({
  pr,
  detail: p,
  readiness,
}: {
  pr: PullRequestWithChecks;
  detail: PullRequest;
  readiness: Readiness;
}) {
  const requiredIssues =
    readiness.result?.checks.filter((check) => !['success', 'neutral'].includes(check.state)) ?? [];
  const parent = /stacked\s+on\s+(?:\[)?#(\d+)/i.exec(p.body)?.[1];
  const chip = rowChipFor(toPrCardData({ ...pr, pullRequest: p }, false));
  return (
    <>
      {!!requiredIssues.length && (
        <Pill tone="warning">
          {requiredIssues.length} required{' '}
          {requiredIssues.length === 1 ? 'check needs' : 'checks need'} attention
        </Pill>
      )}
      {parent && <Pill tone="warning">Stacked on #{parent}</Pill>}
      {!HEADER_PILLS.has(chip) && <Pill tone="ghost">{ROW_CHIP_LABEL[chip]}</Pill>}
      {!readiness.loading && !readiness.result?.complete && (
        <Pill tone="ghost">Required checks unverified</Pill>
      )}
    </>
  );
}

export interface QuickReviewCardProps {
  /** The PR as the list has it: checks come from here. */
  pr: PullRequestWithChecks;
  /** The freshly loaded PR, when there is one (title, body, sizes). */
  detail?: PullRequest;
  /** Changed file paths; `null` while they load or when they failed to load. */
  files: readonly string[] | null;
  /** The files failed to load: the overview says so instead of "loading". */
  filesFailed?: boolean;
  onReloadFiles?: () => void;
  /** Paths marked reviewed. */
  reviewed: readonly string[];
  /** Load, stale or submission problems, drawn above the body. */
  alert?: ReactNode;
  /** Replaces the summary body (the review composer). */
  body?: ReactNode;
  /** The action row. */
  actions: ReactNode;
  onFileSelect?: (path: string) => void;
  /** One line under the actions, e.g. why Approve is not possible yet. */
  actionsNote?: ReactNode;
  commentCount?: number;
  reReview?: boolean;
  onOpenComments?: () => void;
  onOpenGitHub?: () => void;
  now?: number;
}

export function QuickReviewCard({
  pr,
  detail,
  files,
  filesFailed,
  onReloadFiles,
  reviewed,
  alert,
  body,
  actions,
  actionsNote,
  commentCount,
  reReview,
  onOpenComments,
  onOpenGitHub,
  now,
  onFileSelect,
}: QuickReviewCardProps) {
  const p = detail ?? pr.pullRequest;
  const links = useWorkItemLinks(p);
  const workItems = new Map(links.workItems.map((item) => [item.id, item]));
  const readiness = useReviewReadiness(p);
  return (
    <article
      className={clsx('qr-card', !body && 'qr-card--overview')}
      data-i="0"
      aria-label={`Pull request #${p.number}`}
    >
      <QuickReviewPrHeader
        pr={pr}
        detail={p}
        workItemIds={links.workItemIds}
        workItems={workItems}
        commentCount={commentCount}
        reReview={reReview}
        statusChips={body ? undefined : <StatusChips pr={pr} detail={p} readiness={readiness} />}
        onOpenComments={onOpenComments}
        onOpenGitHub={onOpenGitHub}
        now={now}
      />
      {alert}
      {body ?? (
        <QuickReviewOverview
          pr={pr}
          detail={p}
          files={files}
          filesFailed={filesFailed}
          onReloadFiles={onReloadFiles}
          reviewed={reviewed}
          readiness={readiness}
          linkedWorkItemIds={links.workItemIds}
          linkedWorkItems={workItems}
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
  label?: string;
  shortcut?: boolean;
  /** Id of the visible line that says why, for `aria-describedby`. */
  reasonId?: string;
}

/**
 * Approve, blocked until every non-generated file is marked reviewed (and
 * the review can be submitted). Blocked means `aria-disabled`, not
 * `disabled`: the button stays focusable, so a keyboard user reaches it and
 * hears the reason (`reasonId`, the line under the actions); a click does
 * nothing. A blocked button is dashed with a lock and stays that way on
 * hover, which shows the reason as a tooltip.
 */
export function ApproveButton({
  issue,
  busy,
  onApprove,
  reasonId,
  label = 'Approve',
  shortcut = true,
}: ApproveButtonProps) {
  return (
    <span
      className="qr-approve-wrap"
      data-blocked={issue ? 'true' : undefined}
      data-default={shortcut}
    >
      <Button
        variant="secondary"
        size="lg"
        className="qr-approve"
        aria-disabled={issue ? true : undefined}
        loading={busy}
        aria-describedby={issue ? reasonId : undefined}
        aria-keyshortcuts={shortcut && !issue ? 'Enter A ArrowRight' : undefined}
        leading={issue ? <Lock size={13} strokeWidth={2.25} aria-hidden="true" /> : undefined}
        onClick={() => {
          if (!issue) onApprove();
        }}
      >
        {label}
      </Button>
      {issue && (
        <span className="qr-tip" aria-hidden="true">
          {issue}
        </span>
      )}
    </span>
  );
}
