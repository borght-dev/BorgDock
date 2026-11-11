import clsx from 'clsx';
import { memo, type ReactNode } from 'react';
import { Avatar, CheckBar, checkBarSummary, HoverPopover } from '@/components/shared/primitives';
import { WorkItemRef } from '@/components/work-items/WorkItemRef';
import { TitleWithChips } from '@/components/workstreams/Membership';
import type { PrColumn, PrGroupBy } from '@/services/pr-list/display';
import {
  type PrFacts,
  pendingReviewers,
  SIZE_LABEL,
  STATUS_BUCKET_LABEL,
  splitTitle,
} from '@/services/pr-list/facts';
import { pullRequestRef } from '@/services/workstreams/membership';
import type { PrDensity } from '@/types';
import { formatAgo, formatAgoShort } from '@/utils/relative-time';
import { ChecksHoverCard } from './ChecksHoverCard';
import { usePrRowBehaviour } from './PrRow';
import { FailureMarker, markerSummary } from './PrRowCore';
import { PrRowOverlays } from './PrRowOverlays';
import { avatarInitials } from './pr-card-data';

const CHECKS_CARD_SIZE = { maxWidth: 420, maxHeight: 640 } as const;
const MAX_AVATARS = 3;

type ReviewMark = 'approved' | 'changes' | 'commented' | 'pending';

interface Reviewer {
  login: string;
  mark: ReviewMark;
}

/** Who reviewed (their latest verdict) and who is still asked, people only; teams are counted in the text. */
function reviewersOf(f: PrFacts): Reviewer[] {
  const p = f.pr.pullRequest;
  const out: Reviewer[] = [];
  const seen = new Set<string>();
  for (const r of p.latestReviews ?? []) {
    const mark: ReviewMark | null =
      r.state === 'approved'
        ? 'approved'
        : r.state === 'changesRequested'
          ? 'changes'
          : r.state === 'commented'
            ? 'commented'
            : null;
    const key = r.authorLogin.toLowerCase();
    if (!mark || seen.has(key) || key === p.authorLogin.toLowerCase()) continue;
    seen.add(key);
    out.push({ login: r.authorLogin, mark });
  }
  for (const login of p.requestedReviewers) {
    if (seen.has(login.toLowerCase())) continue;
    seen.add(login.toLowerCase());
    out.push({ login, mark: 'pending' });
  }
  return out;
}

const REVIEW_TEXT: Record<PrFacts['review'], { text: (pending: number) => string; tone: string }> =
  {
    awaitingYou: { text: () => 'Awaiting you', tone: 'you' },
    changes: { text: () => 'Changes requested', tone: 'bad' },
    commented: { text: () => 'Commented', tone: 'muted' },
    awaitingOthers: { text: (n) => `Awaiting ${n}`, tone: 'wait' },
    approved: { text: () => 'Approved', tone: 'ok' },
    none: { text: () => 'No reviewers', tone: 'faint' },
  };

function ReviewsCell({ facts, me }: { facts: PrFacts; me: string }) {
  const reviewers = reviewersOf(facts);
  const shown = reviewers.slice(0, MAX_AVATARS);
  const pending = pendingReviewers(facts.pr).length;
  const review = REVIEW_TEXT[facts.review];
  return (
    <span className="bd-prl-cell bd-prl-reviews" data-col="reviews">
      {shown.length > 0 && (
        <span className="bd-prl-stack" aria-hidden="true">
          {shown.map((r) => (
            <Avatar
              key={r.login}
              initials={avatarInitials(r.login)}
              tone={r.login.toLowerCase() === me ? 'own' : 'them'}
              size="sm"
              className="bd-prl-stack__av"
              data-mark={r.mark}
              title={`${r.login}: ${r.mark === 'pending' ? 'review requested' : r.mark}`}
            />
          ))}
          {reviewers.length > MAX_AVATARS && (
            <span className="bd-prl-stack__more">+{reviewers.length - MAX_AVATARS}</span>
          )}
        </span>
      )}
      <span className="bd-prl-reviews__text" data-tone={review.tone}>
        {review.text(pending)}
      </span>
    </span>
  );
}

/** "+42 −8" with its XS–XL bucket. */
function SizeCell({ facts }: { facts: PrFacts }) {
  const p = facts.pr.pullRequest;
  return (
    <span
      className="bd-prl-cell bd-prl-size"
      data-col="size"
      title={`${facts.lines.toLocaleString('en-US')} lines changed in ${p.changedFiles ?? 0} files`}
    >
      <span className="bd-prl-size__bucket">{SIZE_LABEL[facts.size]}</span>
      <span className="bd-prl-size__add">+{(p.additions ?? 0).toLocaleString('en-US')}</span>{' '}
      <span className="bd-prl-size__del">−{(p.deletions ?? 0).toLocaleString('en-US')}</span>
    </span>
  );
}

/** The next step as a pill; a closed PR says merged or closed instead. */
export function NextStepPill({ facts }: { facts: PrFacts }) {
  const p = facts.pr.pullRequest;
  if (p.mergedAt)
    return (
      <span className="bd-prl-next" data-tone="merged">
        Merged
      </span>
    );
  if (p.closedAt)
    return (
      <span className="bd-prl-next" data-tone="closed">
        Closed
      </span>
    );
  return (
    <span className="bd-prl-next" data-tone={facts.next.tone} title={facts.next.label}>
      {facts.next.label}
    </span>
  );
}

/** The status mark at the start of a row or card: one dot per bucket. */
export function StatusMark({ facts }: { facts: PrFacts }) {
  const closed = !!facts.pr.pullRequest.mergedAt || !!facts.pr.pullRequest.closedAt;
  const bucket = closed ? 'closed' : facts.bucket;
  return (
    <span
      className="bd-prl-mark"
      data-bucket={bucket}
      role="img"
      aria-label={closed ? 'Closed' : STATUS_BUCKET_LABEL[facts.bucket]}
    />
  );
}

/** The title: a muted conventional-commit scope, the subject, and the `AB#` items as chips. */
export function PrTitle({ facts, extra }: { facts: PrFacts; extra?: ReactNode }) {
  const p = facts.pr.pullRequest;
  const parts = splitTitle(p.title);
  return (
    <span className="bd-prl-title" title={p.title}>
      {parts.scope && <span className="bd-prl-title__scope">{parts.scope}</span>}
      <span className="bd-wb-row__title bd-prl-title__subject">{parts.subject}</span>
      {parts.workItems.map((id) => (
        <span key={id} className="bd-prl-ab" data-pr-card-action="">
          <WorkItemRef id={id} className="bd-prl-ab__ref">
            AB#{id}
          </WorkItemRef>
        </span>
      ))}
      {p.labels.slice(0, 2).map((label) => (
        <span key={label} className="bd-prl-label">
          {label}
        </span>
      ))}
      {extra}
    </span>
  );
}

/** "shop-web #6398 · vera · opened 2 d ago" without what the grouping or a column already says. */
export function metaText(
  facts: PrFacts,
  now: number,
  opts: { groupBy: PrGroupBy; columns: readonly PrColumn[] },
): string {
  const p = facts.pr.pullRequest;
  const parts: string[] = [];
  const showRepo = opts.groupBy !== 'repo' && !opts.columns.includes('repo');
  const showNumber = !opts.columns.includes('number');
  if (showRepo || showNumber)
    parts.push(
      [showRepo ? p.repoName : '', showNumber ? `#${p.number}` : ''].filter(Boolean).join(' '),
    );
  if (opts.groupBy !== 'author' && !opts.columns.includes('author'))
    parts.push(facts.mine ? 'you' : p.authorLogin);
  if (p.mergedAt) parts.push(`merged ${formatAgo(p.mergedAt, now)}`);
  else if (p.closedAt) parts.push(`closed ${formatAgo(p.closedAt, now)}`);
  else parts.push(`opened ${formatAgo(p.createdAt, now)}`);
  if (facts.stale && !p.mergedAt && !p.closedAt) parts.push('stale');
  return parts.join(' · ');
}

interface PrListRowProps {
  facts: PrFacts;
  /** The cells after the title, in order. */
  columns: readonly PrColumn[];
  groupBy: PrGroupBy;
  density: PrDensity;
  now: number;
  me: string;
  /** False inside a virtualized list: animating recycled rows would move the wrong PR. */
  animateKey?: boolean;
}

/**
 * PrListRow — a row of the Pull requests table (and of the list layout,
 * which passes fewer columns): status mark, title and meta line, then the
 * chosen columns. Same height as every Workbench row (42 px, 32 px
 * compact), so the virtualizer's fixed estimate holds; anything extra goes
 * on the title line. Clicks, keys, the context menu and the trailing action
 * are `usePrRowBehaviour`'s.
 */
export const PrListRow = memo(function PrListRow({
  facts,
  columns,
  groupBy,
  density,
  now,
  me,
  animateKey = true,
}: PrListRowProps) {
  const prWithChecks = facts.pr;
  const p = prWithChecks.pullRequest;
  const {
    key,
    selected,
    cardData,
    sharedFailure,
    actions,
    action,
    openChecks,
    handleClick,
    handleAuxClick,
    handleMouseDown,
  } = usePrRowBehaviour(prWithChecks);
  const checks = cardData.checks ?? { ok: 0, fail: 0, run: 0, total: 0 };
  const checkLabel =
    checkBarSummary(checks).label + (sharedFailure ? ` · ${markerSummary(sharedFailure)}` : '');

  const cell = (column: PrColumn): ReactNode => {
    switch (column) {
      case 'checks':
        return (
          <span key="checks" className="bd-prl-cell bd-prl-checks" data-col="checks">
            {checks.total > 0 ? (
              <HoverPopover
                variant="card"
                triggerClassName="bd-checks-trigger"
                content={<ChecksHoverCard pr={prWithChecks} />}
                {...CHECKS_CARD_SIZE}
              >
                <CheckBar
                  className="bd-wb-row__checks"
                  ok={checks.ok}
                  fail={checks.fail}
                  run={checks.run}
                  total={checks.total}
                  unavailable={checks.unavailable}
                  aria-label={checkLabel}
                  data-checks-trigger=""
                  onClick={(event) => {
                    event.stopPropagation();
                    openChecks();
                  }}
                />
              </HoverPopover>
            ) : (
              <CheckBar
                className="bd-wb-row__checks"
                ok={0}
                fail={0}
                run={0}
                total={0}
                unavailable={checks.unavailable}
                title={checkLabel}
              />
            )}
            {sharedFailure && <FailureMarker marker={sharedFailure} compact />}
          </span>
        );
      case 'reviews':
        return <ReviewsCell key="reviews" facts={facts} me={me} />;
      case 'next':
        return (
          <span key="next" className="bd-prl-cell" data-col="next">
            <NextStepPill facts={facts} />
          </span>
        );
      case 'size':
        return <SizeCell key="size" facts={facts} />;
      case 'updated':
        return (
          <span
            key="updated"
            className="bd-prl-cell bd-prl-age"
            data-col="updated"
            data-stale={facts.stale ? 'true' : undefined}
            title={`Updated ${formatAgo(p.updatedAt, now)}`}
          >
            {formatAgoShort(p.updatedAt, now)}
          </span>
        );
      case 'created':
        return (
          <span
            key="created"
            className="bd-prl-cell bd-prl-age"
            data-col="created"
            title={`Opened ${formatAgo(p.createdAt, now)}`}
          >
            {formatAgoShort(p.createdAt, now)}
          </span>
        );
      case 'repo':
        return (
          <span
            key="repo"
            className="bd-prl-cell bd-prl-text"
            data-col="repo"
            title={`${p.repoOwner}/${p.repoName}`}
          >
            {p.repoName}
          </span>
        );
      case 'author':
        return (
          <span key="author" className="bd-prl-cell bd-prl-text bd-prl-author" data-col="author">
            <Avatar
              initials={avatarInitials(p.authorLogin)}
              tone={facts.mine ? 'own' : 'them'}
              size="sm"
              className="bd-prl-stack__av"
              aria-hidden="true"
            />
            {facts.mine ? 'you' : p.authorLogin}
          </span>
        );
      case 'number':
        return (
          <span key="number" className="bd-prl-cell bd-wb-row__num" data-col="number">
            #{p.number}
          </span>
        );
    }
  };

  return (
    <>
      <div
        className="bd-wb-rowwrap"
        data-key={animateKey ? key : undefined}
        data-selected={selected ? 'true' : undefined}
      >
        <div
          data-pr-card=""
          data-pr-row=""
          data-pr-number={String(p.number)}
          data-pr-owner={p.repoOwner}
          data-pr-repo={p.repoName}
          data-pr-key={key}
          data-density={density}
          data-bucket={facts.bucket}
          data-selected={selected ? 'true' : undefined}
          data-mine={facts.mine ? 'true' : undefined}
          className={clsx(
            'bd-wb-row',
            `bd-wb-row--${density}`,
            'bd-prl-row',
            `bd-prl-row--${density}`,
          )}
          role="button"
          tabIndex={0}
          aria-label={`${p.title}, #${p.number}`}
          aria-current={selected ? 'true' : undefined}
          onClick={handleClick}
          onAuxClick={handleAuxClick}
          onMouseDown={handleMouseDown}
          onContextMenu={actions.handleContextMenu}
          onKeyDown={(e) => {
            if (e.defaultPrevented || e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick(e as unknown as React.MouseEvent<HTMLElement>);
            }
          }}
        >
          <StatusMark facts={facts} />
          <span className="bd-prl-row__text">
            <TitleWithChips refs={[pullRequestRef(p.repoOwner, p.repoName, p.number)]}>
              <PrTitle facts={facts} />
            </TitleWithChips>
            {density === 'comfortable' && (
              <span className="bd-wb-row__meta">
                <span className="bd-wb-row__meta-text">
                  {metaText(facts, now, { groupBy, columns })}
                </span>
              </span>
            )}
          </span>
          {columns.map(cell)}
        </div>
        {action && (
          <span className="bd-row-action" data-pr-card-action="">
            {action}
          </span>
        )}
      </div>
      <PrRowOverlays prWithChecks={prWithChecks} actions={actions} />
    </>
  );
});
