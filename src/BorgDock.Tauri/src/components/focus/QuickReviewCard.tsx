import clsx from 'clsx';
import { type ReactNode, useId, useState } from 'react';
import {
  avatarInitials,
  checkCountsFor,
  ROW_CHIP_LABEL,
  rowChipFor,
  toPrCardData,
} from '@/components/pr/pr-card-data';
import { Markdown } from '@/components/shared/Markdown';
import { Avatar, Button, CheckBar, checkBarSummary } from '@/components/shared/primitives';
import { reviewFolderSummary, reviewProgress } from '@/services/quick-review';
import type { PullRequest, PullRequestWithChecks } from '@/types';
import { formatAgo } from '@/utils/relative-time';

/** Descriptions longer than this get the six-line clamp and "Show more". */
const CLAMP_AFTER_CHARS = 260;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The one-line CI note under the check bar. */
export function ciNote(pr: PullRequestWithChecks): string {
  switch (checkBarSummary(checkCountsFor(pr)).state) {
    case 'fail':
      return 'CI is failing, review can wait';
    case 'run':
      return 'CI still running';
    case 'ok':
      return 'nothing blocking on CI';
    default:
      return 'no checks on this PR';
  }
}

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

function Description({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const long = body.length > CLAMP_AFTER_CHARS;
  return (
    <div className="qr-card__desc">
      <div id={id} className={clsx('markdown-body', long && 'qr-clamp', open && 'qr-clamp--open')}>
        <Markdown>{body}</Markdown>
      </div>
      {long && (
        <button
          type="button"
          className="qr-more"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
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
  /** One line under the actions, e.g. why Approve is not possible yet. */
  actionsNote?: ReactNode;
  /** Right-hand extras on the header's "over" line. */
  headerExtra?: ReactNode;
  now?: number;
}

/**
 * QuickReviewCard — the top card of the Quick Review deck
 * (plans/ui-overhaul-workbench.md, phase 4; the iteration 2 mockup's
 * `.qr-card`): who and where, the title, the description (clamped), branch
 * and size, the changed files counted per folder with how many are left to
 * review, and the checks with a one-line CI note. The actions (Review later,
 * Review files, Approve) come from the workspace.
 */
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
}: QuickReviewCardProps) {
  const p = detail ?? pr.pullRequest;
  const counts = checkCountsFor(pr);
  const chip = rowChipFor(toPrCardData(pr, false));
  return (
    <article className="qr-card" data-i="0" aria-label={`Pull request #${p.number}`}>
      <QuickReviewCardHeader pr={p} now={now} extra={headerExtra} />
      {alert}
      {body ?? (
        <>
          {p.body ? (
            <Description body={p.body} />
          ) : (
            <p className="qr-card__desc qr-muted">No description provided.</p>
          )}
          <dl className="qr-card__meta">
            <div>
              <dt>
                <code>{p.headRef}</code>
              </dt>
              <dd>into {p.baseRef}</dd>
            </div>
            <div>
              <dt>{plural(p.changedFiles, 'file')}</dt>
              <dd>{plural(p.commitCount, 'commit')}</dd>
            </div>
            <div>
              <dt>
                <span className="qr-positive">+{p.additions}</span>{' '}
                <span className="qr-negative">−{p.deletions}</span>
              </dt>
              <dd>lines</dd>
            </div>
            <div>
              <dt>{ROW_CHIP_LABEL[chip]}</dt>
              <dd>review</dd>
            </div>
          </dl>
          <FilesByFolder files={files} reviewed={reviewed} />
          <div className="qr-checks">
            <CheckBar ok={counts.ok} fail={counts.fail} run={counts.run} total={counts.total} />
            <span>{ciNote(pr)}</span>
          </div>
        </>
      )}
      <div className="qr-act">{actions}</div>
      {actionsNote}
    </article>
  );
}

function FilesByFolder({
  files,
  reviewed,
}: {
  files: readonly string[] | null;
  reviewed: readonly string[];
}) {
  if (files === null) {
    return (
      <section className="qr-files" aria-label="Files by folder">
        <h4>Files by folder</h4>
        <p className="qr-muted" role="status">
          Loading changed files…
        </p>
      </section>
    );
  }
  const progress = reviewProgress(files, reviewed);
  return (
    <section className="qr-files" aria-label="Files by folder">
      <h4>
        Files by folder
        <span className="qr-left" data-quick-review-left="">
          {progress.left} of {progress.toReview} to review, {progress.generated} generated
        </span>
      </h4>
      {files.length === 0 ? (
        <p className="qr-muted">No changed files in this PR.</p>
      ) : (
        <ul className="qr-folders">
          {reviewFolderSummary(files).map((entry) => (
            <li
              key={entry.generated ? '' : entry.folder}
              className={clsx(entry.generated && 'qr-folder--gen')}
              data-generated={entry.generated ? 'true' : undefined}
            >
              {entry.folder}
              <b>{entry.count}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
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
        aria-keyshortcuts="ArrowRight"
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
