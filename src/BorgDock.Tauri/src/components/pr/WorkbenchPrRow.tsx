import { GitMerge, MessageSquareText } from 'lucide-react';
import { type MouseEvent, memo, type ReactNode, useCallback, useMemo } from 'react';
import { Button, ProgressButton } from '@/components/shared/primitives';
import { usePrCardActions } from '@/hooks/usePrCardActions';
import { useProgressAction } from '@/hooks/useProgressAction';
import { staleAfterDaysOf } from '@/services/focus-bucket';
import { showPr } from '@/services/navigation';
import { workbenchPrimaryAction } from '@/services/pr-action-resolver';
import { mergePrWithToast, reviewPr } from '@/services/pr-actions';
import { openPrDetail } from '@/services/windows';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity, PullRequestWithChecks } from '@/types';
import { PrRowCore } from './PrRowCore';
import { PrRowOverlays } from './PrRowOverlays';
import { prRowKey, toPrCardData } from './pr-card-data';

/** Middle mouse button in `MouseEvent.button`. */
const MIDDLE_BUTTON = 1;

const ICON = { size: 12, strokeWidth: 2.25, 'aria-hidden': true } as const;

/**
 * The row's trailing action (plans/ui-overhaul-workbench.md, phase 4): only
 * for the two actions that make sense without opening the PR. `null` for
 * everything else (failing, own, closed, nothing to do). The Focus board's
 * cards use the same rule (`workbenchPrimaryAction`).
 */
export function rowActionFor(
  prWithChecks: PullRequestWithChecks,
  username: string,
  teams: readonly string[] = [],
): 'review' | 'merge' | null {
  return workbenchPrimaryAction(prWithChecks, username, teams);
}

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
  kind: 'review' | 'merge';
  prWithChecks: PullRequestWithChecks;
}) {
  if (kind === 'merge') return <RowMergeButton prWithChecks={prWithChecks} />;
  return (
    <Button
      variant="primary"
      size="sm"
      leading={<MessageSquareText {...ICON} />}
      aria-label={`Review #${prWithChecks.pullRequest.number}`}
      data-row-action="review"
      onClick={(e) => {
        e.stopPropagation();
        reviewPr(prWithChecks);
      }}
    >
      Review
    </Button>
  );
}

interface WorkbenchPrRowProps {
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
 * WorkbenchPrRow — a pull request row of the Workbench list (`ui.layoutV3`):
 * `PrRowCore` plus the behaviour around it.
 *
 * - Click (or Enter / Space on the focused row) selects the row by its
 *   `owner/repo#number` key and pushes the in-window detail view
 *   (`navigation.showPr`) at once.
 * - Ctrl/Cmd+click, Ctrl/Cmd+Enter and middle-click open the pop-out window
 *   (`openPrDetail`); so does "Open in window" in the context menu.
 * - Right-click opens `PrContextMenu`; its confirm dialogs mount here too.
 * - A trailing action on hover, focus and selection when the PR's primary
 *   action is Review (opens Quick Review) or Merge (progress fill, then the
 *   row updates from the store; the result is a toast).
 */
export const WorkbenchPrRow = memo(function WorkbenchPrRow({
  prWithChecks,
  density = 'comfortable',
  now,
  animateKey = true,
  meta,
  keepSection = false,
  extraAction,
}: WorkbenchPrRowProps) {
  const pr = prWithChecks.pullRequest;
  const key = prRowKey(pr);
  const selected = useUiStore((s) => s.selectedPrKey === key);
  const username = usePrStore((s) => s.username);
  const teams = usePrStore((s) => s.teams);
  const staleAfterDays = useSettingsStore((s) => s.settings.ui?.staleAfterDays);
  const actions = usePrCardActions(prWithChecks);
  const actionKind = rowActionFor(prWithChecks, username, teams);

  const isMine = username !== '' && pr.authorLogin.toLowerCase() === username.toLowerCase();
  const cardData = useMemo(() => toPrCardData(prWithChecks, isMine), [prWithChecks, isMine]);

  const { repoOwner: owner, repoName: repo, number } = pr;

  const openInline = useCallback(() => {
    void showPr(keepSection ? { owner, repo, number, keepSection } : { owner, repo, number });
  }, [owner, repo, number, keepSection]);

  const openPopOut = useCallback(() => {
    void openPrDetail({ owner, repo, number });
  }, [owner, repo, number]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest?.('[data-pr-card-action]')) return;
      useUiStore.getState().selectPrKey(key, number);
      if (e.ctrlKey || e.metaKey) openPopOut();
      else openInline();
    },
    [key, number, openInline, openPopOut],
  );

  const handleAuxClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.button !== MIDDLE_BUTTON) return;
      if ((e.target as HTMLElement).closest?.('[data-pr-card-action]')) return;
      e.preventDefault();
      useUiStore.getState().selectPrKey(key, number);
      openPopOut();
    },
    [key, number, openPopOut],
  );

  return (
    <>
      <PrRowCore
        pr={cardData}
        density={density}
        selected={selected}
        now={now}
        staleAfterDays={staleAfterDaysOf(staleAfterDays)}
        meta={meta}
        animateKey={animateKey}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        onMouseDown={(e) => {
          // No autoscroll cursor on middle-click.
          if (e.button === MIDDLE_BUTTON) e.preventDefault();
        }}
        onContextMenu={actions.handleContextMenu}
        action={
          actionKind || extraAction ? (
            <>
              {actionKind && <RowAction kind={actionKind} prWithChecks={prWithChecks} />}
              {extraAction}
            </>
          ) : null
        }
      />
      <PrRowOverlays prWithChecks={prWithChecks} actions={actions} />
    </>
  );
});
