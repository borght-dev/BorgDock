import clsx from 'clsx';
import {
  Copy,
  Ellipsis,
  ExternalLink,
  GitBranch,
  GitMerge,
  MessageSquareText,
  Pencil,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { PrRowOverlays } from '@/components/pr/PrRowOverlays';
import { Button, IconButton, ProgressButton } from '@/components/shared/primitives';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { useDetailViewKeys } from '@/hooks/useDetailViewKeys';
import { usePrCardActions } from '@/hooks/usePrCardActions';
import { useProgressAction } from '@/hooks/useProgressAction';
import { type PrActionId, primaryFor, shapeFromPrWithChecks } from '@/services/pr-action-resolver';
import { mergePrWithToast, rerunChecks, reviewPr } from '@/services/pr-actions';
import { isMyPr, isWaitingOnMe } from '@/services/pr-grouping';
import { usePrStore } from '@/stores/pr-store';
import type { CheckRun, PullRequestWithChecks } from '@/types';
import type { PrActions } from './usePrActions';

interface ActionBarProps {
  actions: PrActions;
  onReview: () => void;
  /** PullRequest.state — 'open' | 'closed'. Closed PRs hide destructive + draft actions. */
  prState: string;
  /** PullRequest.isDraft. */
  isDraft: boolean;
  /** PullRequest.mergeable. `false` reveals the Resolve Conflicts CTA. */
  mergeable: boolean | undefined;
}

/**
 * ActionBar — sticky toolbar below the header on the PR detail panel.
 * Pure presentation; all state + handlers live in usePrActions().
 */
export function ActionBar({ actions, prState, isDraft, mergeable, onReview }: ActionBarProps) {
  const isOpen = prState === 'open';

  return (
    <div
      data-action-bar
      className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-subtle-border)] bg-[var(--color-surface)] px-[22px] py-2.5"
    >
      {isOpen && (
        <Button
          variant="primary"
          size="sm"
          leading={
            actions.isReady ? (
              <GitMerge size={13} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <MessageSquareText size={13} strokeWidth={2.25} aria-hidden="true" />
            )
          }
          onClick={actions.isReady ? actions.onMerge : onReview}
          data-action-bar-action={actions.isReady ? 'merge' : 'review'}
        >
          {actions.isReady ? 'Merge' : 'Review'}
        </Button>
      )}
      {isOpen && (
        <span className="mx-1 inline-block h-[18px] w-px bg-[var(--color-subtle-border)]" />
      )}
      <Button
        variant="secondary"
        size="sm"
        leading={<ExternalLink size={13} strokeWidth={2.25} aria-hidden="true" />}
        onClick={actions.onOpenInBrowser}
        data-action-bar-action="browser"
      >
        Open in Browser
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leading={<Copy size={13} strokeWidth={2.25} aria-hidden="true" />}
        onClick={actions.onCopyBranch}
        data-action-bar-action="copy"
      >
        Copy Branch
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leading={<GitBranch size={13} strokeWidth={2.25} aria-hidden="true" />}
        onClick={actions.onCheckoutToggle}
        aria-expanded={actions.checkoutOpen}
        data-action-bar-action="checkout"
        className={clsx(
          actions.checkoutOpen &&
            'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[var(--color-purple-border)]',
        )}
      >
        Checkout
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leading={<MessageSquareText size={13} strokeWidth={2.25} aria-hidden="true" />}
        onClick={actions.onOpenInT3}
        data-action-bar-action="t3"
      >
        Open in T3
      </Button>
      {isOpen && (
        <Button
          variant="ghost"
          size="sm"
          leading={<Pencil size={13} strokeWidth={2.25} aria-hidden="true" />}
          onClick={actions.onToggleDraft}
          data-action-bar-action="draft"
        >
          {isDraft ? 'Mark Ready' : 'Mark Draft'}
        </Button>
      )}
      {isOpen && mergeable === false && (
        <Button
          variant="ghost"
          size="sm"
          onClick={actions.onResolveConflicts}
          data-action-bar-action="resolve"
          className="border border-[var(--color-purple-border)] bg-[var(--color-purple-soft)] text-[var(--color-purple)]"
        >
          {'✦'} Resolve Conflicts
        </Button>
      )}
      {isOpen && (
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={actions.onBypassConfirm}
            data-action-bar-action="bypass"
            className="border-2 border-dashed bg-transparent"
          >
            Bypass Merge
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={actions.onCloseConfirm}
            data-action-bar-action="close"
            className="bg-transparent"
          >
            Close PR
          </Button>
        </div>
      )}
    </div>
  );
}

interface WorkbenchActionBarProps {
  pr: PullRequestWithChecks;
  /** The detail panel's actions: Checkout's panel, Open in T3 and GitHub, conflicts. */
  actions: PrActions;
  /**
   * The view's check runs. Rerun uses their failed runs; without them the
   * rerun service fetches the head commit's.
   */
  checks?: CheckRun[];
}

const ICON = { size: 13, strokeWidth: 2.25, 'aria-hidden': true } as const;

/**
 * WorkbenchActionBar — the action row in the full-screen detail view's
 * header (plans/ui-overhaul-workbench.md, phase 3). The primary action is
 * `primaryFor` (Rerun failed, Merge, Review, Checkout or Open in GitHub),
 * then Fix with Claude for failing PRs, Checkout, Open in T3 and Open in
 * GitHub (skipping whichever is already primary), Resolve conflicts when
 * there are any, and "More" for the row's context menu (copy, draft, bypass,
 * close, open in window).
 *
 * Merge, Rerun and Fix fill while the request runs and flip to their result
 * label; a failure toasts (Merge through the in-window toast stack, the others
 * through the `services/pr-actions` error sink) and the button goes back to
 * rest. Review opens Quick Review for this PR. `R` reruns and
 * `F` fixes from anywhere in the view (plan section 7).
 */
export function WorkbenchActionBar({ pr, actions, checks = [] }: WorkbenchActionBarProps) {
  const p = pr.pullRequest;
  const isOpen = p.state === 'open' && !p.mergedAt;
  const username = usePrStore((s) => s.username);
  const teams = usePrStore((s) => s.teams);
  const mine = isMyPr(pr, username);
  const primary: PrActionId | null = isOpen
    ? primaryFor(shapeFromPrWithChecks(pr, mine, isWaitingOnMe(pr, username, teams)))
    : null;
  const failing = isOpen && pr.failedCheckNames.length > 0;

  const barRef = useRef<HTMLDivElement>(null);
  const { fixWithClaude } = useClaudeActions();
  const more = usePrCardActions(pr);

  const merge = useProgressAction(
    () =>
      mergePrWithToast({
        repoOwner: p.repoOwner,
        repoName: p.repoName,
        number: p.number,
        title: p.title,
        htmlUrl: p.htmlUrl,
      }),
    'Merge failed',
  );
  const rerun = useProgressAction(
    () =>
      rerunChecks({
        repoOwner: p.repoOwner,
        repoName: p.repoName,
        ...(checks.length > 0 ? { checks } : { ref: p.headSha || p.headRef }),
      }),
    'Failed to re-run checks',
  );
  const fix = useProgressAction(async () => {
    await fixWithClaude(
      pr,
      pr.failedCheckNames.length > 0 ? pr.failedCheckNames : ['unknown'],
      [],
      [],
      '',
    );
    return true;
  }, 'Fix with Claude failed');

  const canRerun = failing;
  useDetailViewKeys(barRef, {
    r: () => {
      if (!canRerun) return false;
      void rerun.trigger();
    },
    f: () => {
      if (!failing) return false;
      void fix.trigger();
    },
  });

  const review = () => reviewPr(pr);

  let primaryButton: ReactNode = null;
  switch (primary) {
    case 'rerun':
      primaryButton = (
        <ProgressButton
          variant="primary"
          size="md"
          leading={<RotateCw {...ICON} />}
          state={rerun.state}
          onTrigger={() => void rerun.trigger()}
          disabled={!canRerun}
          label="Rerun failed"
          busyLabel="Rerunning"
          doneLabel="Rerun started"
          aria-keyshortcuts="R"
          data-action-bar-action="rerun"
        />
      );
      break;
    case 'merge':
      primaryButton = (
        <ProgressButton
          variant="primary"
          size="md"
          leading={<GitMerge {...ICON} />}
          state={merge.state}
          onTrigger={() => void merge.trigger()}
          label="Merge"
          busyLabel="Merging"
          doneLabel="Merged"
          data-action-bar-action="merge"
        />
      );
      break;
    case 'review':
      primaryButton = (
        <Button
          variant="primary"
          size="md"
          leading={<MessageSquareText {...ICON} />}
          onClick={review}
          data-action-bar-action="review"
        >
          Review
        </Button>
      );
      break;
    case 'checkout':
      primaryButton = (
        <Button
          variant="primary"
          size="md"
          leading={<GitBranch {...ICON} />}
          onClick={actions.onCheckoutToggle}
          aria-expanded={actions.checkoutOpen}
          data-action-bar-action="checkout"
        >
          Checkout
        </Button>
      );
      break;
    case 'open':
      primaryButton = (
        <Button
          variant="primary"
          size="md"
          leading={<ExternalLink {...ICON} />}
          onClick={actions.onOpenInBrowser}
          data-action-bar-action="browser"
        >
          Open in GitHub
        </Button>
      );
      break;
    default:
      break;
  }

  return (
    <div
      ref={barRef}
      className="bd-detail-actions"
      data-action-bar=""
      data-primary={primary ?? undefined}
    >
      {primaryButton}
      {failing && (
        <ProgressButton
          variant="secondary"
          size="md"
          leading={<Sparkles {...ICON} />}
          state={fix.state}
          onTrigger={() => void fix.trigger()}
          label="Fix with Claude"
          busyLabel="Starting Claude"
          doneLabel="Claude is on it"
          aria-keyshortcuts="F"
          data-action-bar-action="fix"
        />
      )}
      {primary !== 'checkout' && (
        <Button
          variant="secondary"
          size="md"
          leading={<GitBranch {...ICON} />}
          onClick={actions.onCheckoutToggle}
          aria-expanded={actions.checkoutOpen}
          className={clsx(actions.checkoutOpen && 'bd-detail-actions__toggle--on')}
          data-action-bar-action="checkout"
        >
          Checkout
        </Button>
      )}
      <Button
        variant="secondary"
        size="md"
        leading={<MessageSquareText {...ICON} />}
        onClick={actions.onOpenInT3}
        data-action-bar-action="t3"
      >
        Open in T3
      </Button>
      {primary !== 'open' && (
        <Button
          variant="secondary"
          size="md"
          leading={<ExternalLink {...ICON} />}
          onClick={actions.onOpenInBrowser}
          data-action-bar-action="browser"
        >
          Open in GitHub
        </Button>
      )}
      {isOpen && p.mergeable === false && (
        <Button
          variant="ghost"
          size="md"
          onClick={actions.onResolveConflicts}
          data-action-bar-action="resolve"
        >
          Resolve conflicts
        </Button>
      )}
      <IconButton
        icon={<Ellipsis size={15} strokeWidth={2.25} aria-hidden="true" />}
        tooltip="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={more.contextMenu !== null}
        className="bd-detail-actions__more"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          more.setContextMenu({ x: box.left, y: box.bottom + 4 });
        }}
        data-action-bar-action="more"
      />
      <PrRowOverlays prWithChecks={pr} actions={more} />
    </div>
  );
}
