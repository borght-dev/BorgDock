import { Check, GitMerge, MessageSquareText } from 'lucide-react';
import { type MouseEvent, memo, type ReactNode, useCallback, useMemo } from 'react';
import { Button, ProgressButton } from '@/components/shared/primitives';
import { usePrCardActions } from '@/hooks/usePrCardActions';
import { useProgressAction } from '@/hooks/useProgressAction';
import { showGroupPrs } from '@/services/ci-failures/actions';
import { outsideCauseText } from '@/services/ci-failures/lens';
import { holdDependencyApprovals, readMergePreference } from '@/services/dependency-approve';
import { approveBlockOf, dependencyUpdateOf } from '@/services/dependency-updates';
import { staleAfterDaysOf } from '@/services/focus-bucket';
import { showPr } from '@/services/navigation';
import { workbenchPrimaryAction } from '@/services/pr-action-resolver';
import { mergePrWithToast, reviewPr } from '@/services/pr-actions';
import { openPrDetail } from '@/services/windows';
import { blockedOf, useCiFailuresStore, usePrCiLens } from '@/stores/ci-failures-store';
import { useDependencyUpdatesStore } from '@/stores/dependency-updates-store';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity, PullRequestWithChecks } from '@/types';
import { ChecksHoverCard } from './ChecksHoverCard';
import { PrRowCore, type SharedFailureMarker } from './PrRowCore';
import { PrRowOverlays } from './PrRowOverlays';
import { prRowKey, toPrCardData } from './pr-card-data';

/** Middle mouse button in `MouseEvent.button`. */
const MIDDLE_BUTTON = 1;

const ICON = { size: 12, strokeWidth: 2.25, 'aria-hidden': true } as const;

/**
 * The row's trailing action (plans/ui-overhaul-workbench.md, phase 4): only
 * for the actions that make sense without opening the PR. `null` for
 * everything else (failing, own, closed, nothing to do). The Focus board's
 * cards use the same rule (`workbenchPrimaryAction`). A PR red only from
 * failures that are not its doing (`notCaused`) still offers its review. A
 * dependency bot's PR offers Approve where others offer Review; a ready one
 * still offers Merge.
 */
export function rowActionFor(
  prWithChecks: PullRequestWithChecks,
  username: string,
  teams: readonly string[] = [],
  notCaused = false,
): RowActionKind | null {
  const primary = workbenchPrimaryAction(prWithChecks, username, teams, {
    failureNotCaused: notCaused,
  });
  if (primary === 'merge') return primary;
  const approvable =
    dependencyUpdateOf(prWithChecks.pullRequest) !== null &&
    approveBlockOf(prWithChecks, username) === null;
  return approvable ? 'approve' : primary;
}

type RowActionKind = 'review' | 'merge' | 'approve';

/** Merge through the progress fill: "Merging", then "Merged"; the row updates from the store. */
function RowMergeButton({ prWithChecks }: { prWithChecks: PullRequestWithChecks }) {
  const p = prWithChecks.pullRequest;
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
  return (
    <ProgressButton
      variant="primary"
      size="sm"
      leading={<GitMerge {...ICON} />}
      state={merge.state}
      onTrigger={() => void merge.trigger()}
      label="Merge"
      busyLabel="Merging"
      doneLabel="Merged"
      data-row-action="merge"
    />
  );
}

function RowAction({
  kind,
  prWithChecks,
}: {
  kind: RowActionKind;
  prWithChecks: PullRequestWithChecks;
}) {
  if (kind === 'merge') return <RowMergeButton prWithChecks={prWithChecks} />;
  const approve = kind === 'approve';
  return (
    <Button
      variant="primary"
      size="sm"
      leading={approve ? <Check {...ICON} /> : <MessageSquareText {...ICON} />}
      aria-label={`${approve ? 'Approve' : 'Review'} #${prWithChecks.pullRequest.number}`}
      data-row-action={kind}
      onClick={(e) => {
        e.stopPropagation();
        if (approve) holdDependencyApprovals([prWithChecks], readMergePreference());
        else reviewPr(prWithChecks);
      }}
    >
      {approve ? 'Approve' : 'Review'}
    </Button>
  );
}

interface PrRowProps {
  prWithChecks: PullRequestWithChecks;
  density?: PrDensity;
  /** Clock for the meta line, shared by every row of one render. */
  now?: number;
  /** See `PrRowCore.animateKey`; false inside a virtualized list. */
  animateKey?: boolean;
  /** See `PrRowCore.meta`: Focus shows the reason the PR is there. */
  meta?: ReactNode;
  /** Open the detail without switching to Pull requests (Focus): Back returns here. */
  keepSection?: boolean;
  /** One more button after the row's action in its slot (Focus: "Bring back" on a snoozed PR). */
  extraAction?: ReactNode;
}

/**
 * PrRow — a pull request row of the list, Focus and the flyout hand-over:
 * `PrRowCore` plus the behaviour around it.
 *
 * - Click (or Enter / Space on the focused row) selects the row by its
 *   `owner/repo#number` key and pushes the in-window detail view
 *   (`navigation.showPr`) at once.
 * - Ctrl/Cmd+click, Ctrl/Cmd+Enter and middle-click open the pop-out window
 *   (`openPrDetail`); so does "Open in window" in the context menu.
 * - Hovering the check bar shows `ChecksHoverCard`; clicking it opens the
 *   detail on its Checks tab.
 * - Right-click opens `PrContextMenu`; its confirm dialogs mount here too.
 * - A trailing action on hover, focus and selection when the PR's primary
 *   action is Review (opens Quick Review), Approve (a dependency update,
 *   with Undo) or Merge (progress fill, then the row updates from the
 *   store; the result is a toast).
 */
/**
 * What every PR row and card does, whatever it looks like: selection by
 * `owner/repo#number`, click and Enter open the in-window detail,
 * Ctrl/Cmd+click and middle-click the pop-out, the check bar opens the
 * Checks tab, right-click the context menu, and the trailing action
 * (Review, Approve or Merge). `PrRow`, the table rows and the board cards
 * share it.
 */
export function usePrRowBehaviour(prWithChecks: PullRequestWithChecks, keepSection = false) {
  const pr = prWithChecks.pullRequest;
  const key = prRowKey(pr);
  const selected = useUiStore((s) => s.selectedPrKey === key);
  const username = usePrStore((s) => s.username);
  const teams = usePrStore((s) => s.teams);
  const actions = usePrCardActions(prWithChecks);
  const lens = usePrCiLens(prWithChecks);
  const approving = useDependencyUpdatesStore((s) => s.pending.has(key));
  const rowAction = rowActionFor(prWithChecks, username, teams, !!lens?.outsideCause);
  // An approval waiting for Undo or being sent: the toast is where to act on it.
  const actionKind = approving && rowAction === 'approve' ? null : rowAction;

  const isMine = username !== '' && pr.authorLogin.toLowerCase() === username.toLowerCase();
  const cardData = useMemo(() => toPrCardData(prWithChecks, isMine), [prWithChecks, isMine]);

  const { repoOwner: owner, repoName: repo, number } = pr;
  const sharedFailure = useMemo((): SharedFailureMarker | undefined => {
    const group = lens?.groups[0];
    if (!lens || !group) return undefined;
    const base = pr.baseRef || 'the base branch';
    return {
      group,
      prCount: lens.blockedCount,
      alsoOn: group.defaultBranchRuns.length > 0 ? base : null,
      notCausedBy: lens.outsideCause ? outsideCauseText(lens.outsideCause, base) : null,
      onOpen: () => {
        const blocked = blockedOf(
          useCiFailuresStore.getState().groups,
          usePrStore.getState().pullRequests,
        ).byGroup.get(group.id);
        void showGroupPrs({
          groupId: group.id,
          title: group.title,
          scope: group.scope,
          prNumbers: (blocked ?? []).map((p) => p.pullRequest.number),
        });
      },
    };
  }, [lens, pr.baseRef]);

  const openInline = useCallback(() => {
    void showPr(keepSection ? { owner, repo, number, keepSection } : { owner, repo, number });
  }, [owner, repo, number, keepSection]);

  const openChecks = useCallback(() => {
    useUiStore.getState().selectPrKey(key, number);
    void showPr({ owner, repo, number, tab: 'checks', ...(keepSection ? { keepSection } : {}) });
  }, [key, owner, repo, number, keepSection]);

  const openPopOut = useCallback(() => {
    void openPrDetail({ owner, repo, number });
  }, [owner, repo, number]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest?.('[data-pr-card-action]')) return;
      useUiStore.getState().selectPrKey(key, number);
      if (e.ctrlKey || e.metaKey) openPopOut();
      else openInline();
    },
    [key, number, openInline, openPopOut],
  );

  const handleAuxClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (e.button !== MIDDLE_BUTTON) return;
      if ((e.target as HTMLElement).closest?.('[data-pr-card-action]')) return;
      e.preventDefault();
      useUiStore.getState().selectPrKey(key, number);
      openPopOut();
    },
    [key, number, openPopOut],
  );

  const handleMouseDown = useCallback((e: MouseEvent<HTMLElement>) => {
    // No autoscroll cursor on middle-click.
    if (e.button === MIDDLE_BUTTON) e.preventDefault();
  }, []);

  const action = actionKind ? <RowAction kind={actionKind} prWithChecks={prWithChecks} /> : null;

  return {
    key,
    selected,
    cardData,
    sharedFailure,
    lens,
    actions,
    action,
    openChecks,
    handleClick,
    handleAuxClick,
    handleMouseDown,
  };
}

export const PrRow = memo(function PrRow({
  prWithChecks,
  density = 'comfortable',
  now,
  animateKey = true,
  meta,
  keepSection = false,
  extraAction,
}: PrRowProps) {
  const staleAfterDays = useSettingsStore((s) => s.settings.ui?.staleAfterDays);
  const {
    selected,
    cardData,
    sharedFailure,
    actions,
    action,
    openChecks,
    handleClick,
    handleAuxClick,
    handleMouseDown,
  } = usePrRowBehaviour(prWithChecks, keepSection);

  return (
    <>
      <PrRowCore
        pr={cardData}
        density={density}
        selected={selected}
        now={now}
        staleAfterDays={staleAfterDaysOf(staleAfterDays)}
        meta={meta}
        sharedFailure={sharedFailure}
        animateKey={animateKey}
        checksCard={<ChecksHoverCard pr={prWithChecks} />}
        onChecksClick={openChecks}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        onMouseDown={handleMouseDown}
        onContextMenu={actions.handleContextMenu}
        action={
          action || extraAction ? (
            <>
              {action}
              {extraAction}
            </>
          ) : null
        }
      />
      <PrRowOverlays prWithChecks={prWithChecks} actions={actions} />
    </>
  );
});
