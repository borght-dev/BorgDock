import clsx from 'clsx';
import { Copy, ExternalLink, GitBranch, GitMerge, MessageSquareText, Pencil } from 'lucide-react';
import { Button } from '@/components/shared/primitives';
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
