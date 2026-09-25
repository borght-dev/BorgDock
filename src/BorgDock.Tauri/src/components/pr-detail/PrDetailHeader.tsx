import { AppWindow } from 'lucide-react';
import type { CSSProperties } from 'react';
import { BackButton } from '@/components/layout/BackButton';
import { avatarInitials, prRowKey } from '@/components/pr/pr-card-data';
import { Avatar, IconButton } from '@/components/shared/primitives';
import { isMyPr } from '@/services/pr-grouping';
import { usePrStore } from '@/stores/pr-store';
import type { CheckRun, PullRequestWithChecks } from '@/types';
import { WorkbenchActionBar } from './ActionBar';
import { ReadinessLine } from './ReadinessLine';
import type { PrActions } from './usePrActions';

interface PrDetailHeaderProps {
  pr: PullRequestWithChecks;
  actions: PrActions;
  /** The view's check runs, for Rerun. */
  checks?: CheckRun[];
  /** "Open in window": the pop-out for this PR. */
  onOpenInWindow: () => void;
}

/** The view-transition names the list row gives its title and avatar (PrRowCore). */
export function prTransitionNames(number: number) {
  return { title: `pr-title-${number}`, avatar: `pr-avatar-${number}` };
}

/**
 * PrDetailHeader — the head of the full-screen detail view
 * (plans/ui-overhaul-workbench.md, phase 3): Back, `owner/repo #number` and
 * "Open in window" on the top line; then the avatar and title, the branch
 * into its base, the readiness sentence and the action bar.
 *
 * The title and avatar carry `pr-title-<n>` / `pr-avatar-<n>` for as long as
 * the header is mounted. The selected list row carries the same names while
 * the list is uncovered, so on push the row's title and avatar morph into
 * these and on pop back again; the covered list drops its names, so the two
 * never carry them at the same time.
 */
export function PrDetailHeader({ pr, actions, checks, onOpenInWindow }: PrDetailHeaderProps) {
  const p = pr.pullRequest;
  const username = usePrStore((s) => s.username);
  const names = prTransitionNames(p.number);
  const titleStyle = { viewTransitionName: names.title } as CSSProperties;
  const avatarStyle = { viewTransitionName: names.avatar } as CSSProperties;

  return (
    <header className="bd-detail__head" data-pr-key={prRowKey(p)}>
      <div className="bd-detail__bar">
        <BackButton />
        <span className="bd-detail__crumb">
          {p.repoOwner}/{p.repoName} <span className="bd-detail__num">#{p.number}</span>
        </span>
        <IconButton
          className="bd-detail__popout"
          icon={<AppWindow size={14} strokeWidth={2.25} aria-hidden="true" />}
          tooltip="Open in window"
          aria-label="Open in window"
          onClick={onOpenInWindow}
          data-pr-detail-open-window=""
        />
      </div>
      <div className="bd-detail__titlerow">
        <Avatar
          className="bd-detail__avatar"
          initials={avatarInitials(p.authorLogin)}
          tone={isMyPr(pr, username) ? 'own' : 'them'}
          size="md"
          style={avatarStyle}
          aria-hidden="true"
        />
        <h1 className="bd-detail__title" style={titleStyle}>
          {p.title}
        </h1>
      </div>
      <p className="bd-detail__meta">
        <em>{p.authorLogin}</em> wants to merge <code>{p.headRef}</code> into{' '}
        <code>{p.baseRef}</code>
        <span className="bd-detail__stats">
          <span className="bd-detail__add">+{p.additions}</span>{' '}
          <span className="bd-detail__del">−{p.deletions}</span>, {p.changedFiles}{' '}
          {p.changedFiles === 1 ? 'file' : 'files'}
        </span>
      </p>
      <ReadinessLine pr={pr} />
      <WorkbenchActionBar pr={pr} actions={actions} checks={checks} />
    </header>
  );
}
