import clsx from 'clsx';
import { Button } from '@/components/shared/primitives';
import type { PrActions } from './usePrActions';

const MergeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="3" cy="8" r="1.5" />
    <circle cx="13" cy="3" r="1.5" />
    <circle cx="13" cy="13" r="1.5" />
    <path d="M3 9.5v3" />
    <path d="M3 6.5C3 6.5 5 5 8 5h3.5" />
    <path d="M3 9.5C3 9.5 5 11 8 11h3.5" />
  </svg>
);

const ExternalIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 2h5v5" /><path d="m14 2-7 7" />
    <path d="M4 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
  </svg>
);

const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
  </svg>
);

const BranchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="4" cy="3.5" r="1.5" />
    <circle cx="4" cy="12.5" r="1.5" />
    <circle cx="12" cy="6.5" r="1.5" />
    <path d="M4 5v6" />
    <path d="M12 8c0 2-2 3-4 3s-4-.5-4-2" />
  </svg>
);

const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 2.5 13.5 5 5 13.5l-3 .5.5-3z" />
  </svg>
);

interface ActionBarProps {
  actions: PrActions;
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
export function ActionBar({ actions, prState, isDraft, mergeable }: ActionBarProps) {
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
          leading={<MergeIcon />}
          onClick={actions.onMerge}
          disabled={!actions.isReady}
          data-action-bar-action="merge"
        >
          Merge
        </Button>
      )}
      {isOpen && (
        <span className="mx-1 inline-block h-[18px] w-px bg-[var(--color-subtle-border)]" />
      )}
      <Button
        variant="secondary"
        size="sm"
        leading={<ExternalIcon />}
        onClick={actions.onOpenInBrowser}
        data-action-bar-action="browser"
      >
        Open in Browser
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leading={<CopyIcon />}
        onClick={actions.onCopyBranch}
        data-action-bar-action="copy"
      >
        Copy Branch
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leading={<BranchIcon />}
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
      {isOpen && (
        <Button
          variant="ghost"
          size="sm"
          leading={<EditIcon />}
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
