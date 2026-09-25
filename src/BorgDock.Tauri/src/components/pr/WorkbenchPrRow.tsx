import { type MouseEvent, memo, useCallback, useMemo } from 'react';
import { usePrCardActions } from '@/hooks/usePrCardActions';
import { showPr } from '@/services/navigation';
import { openPrDetail } from '@/services/windows';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import type { PrDensity, PullRequestWithChecks } from '@/types';
import { PrRowCore } from './PrRowCore';
import { PrRowOverlays } from './PrRowOverlays';
import { prRowKey, toPrCardData } from './pr-card-data';

/** Middle mouse button in `MouseEvent.button`. */
const MIDDLE_BUTTON = 1;

interface WorkbenchPrRowProps {
  prWithChecks: PullRequestWithChecks;
  density?: PrDensity;
  /** Clock for the meta line, shared by every row of one render. */
  now?: number;
  /** See `PrRowCore.animateKey`; false inside a virtualized list. */
  animateKey?: boolean;
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
 */
export const WorkbenchPrRow = memo(function WorkbenchPrRow({
  prWithChecks,
  density = 'comfortable',
  now,
  animateKey = true,
}: WorkbenchPrRowProps) {
  const pr = prWithChecks.pullRequest;
  const key = prRowKey(pr);
  const selected = useUiStore((s) => s.selectedPrKey === key);
  const username = usePrStore((s) => s.username);
  const actions = usePrCardActions(prWithChecks);

  const isMine = username !== '' && pr.authorLogin.toLowerCase() === username.toLowerCase();
  const cardData = useMemo(() => toPrCardData(prWithChecks, isMine), [prWithChecks, isMine]);

  const { repoOwner: owner, repoName: repo, number } = pr;

  const openInline = useCallback(() => {
    void showPr({ owner, repo, number });
  }, [owner, repo, number]);

  const openPopOut = useCallback(() => {
    void openPrDetail({ owner, repo, number });
  }, [owner, repo, number]);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      useUiStore.getState().selectPrKey(key, number);
      if (e.ctrlKey || e.metaKey) openPopOut();
      else openInline();
    },
    [key, number, openInline, openPopOut],
  );

  const handleAuxClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.button !== MIDDLE_BUTTON) return;
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
        animateKey={animateKey}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        onMouseDown={(e) => {
          // No autoscroll cursor on middle-click.
          if (e.button === MIDDLE_BUTTON) e.preventDefault();
        }}
        onContextMenu={actions.handleContextMenu}
      />
      <PrRowOverlays prWithChecks={prWithChecks} actions={actions} />
    </>
  );
});
