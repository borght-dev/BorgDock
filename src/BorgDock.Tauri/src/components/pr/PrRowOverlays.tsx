import type { usePrCardActions } from '@/hooks/usePrCardActions';
import type { PullRequestWithChecks } from '@/types';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { PrContextMenu } from './PrContextMenu';

interface PrRowOverlaysProps {
  prWithChecks: PullRequestWithChecks;
  actions: ReturnType<typeof usePrCardActions>;
}

/**
 * The right-click menu and the confirm dialogs (close, bypass merge, draft
 * toggle) that `PrRow` mounts next to its row.
 */
export function PrRowOverlays({ prWithChecks, actions }: PrRowOverlaysProps) {
  const pr = prWithChecks.pullRequest;
  return (
    <>
      {actions.contextMenu && (
        <PrContextMenu
          pr={prWithChecks}
          position={actions.contextMenu}
          onClose={() => actions.setContextMenu(null)}
          onConfirmAction={actions.setConfirmAction}
        />
      )}

      <ConfirmDialog
        isOpen={actions.confirmAction === 'close'}
        title="Close pull request?"
        message={`This will close PR #${pr.number} without merging. You can reopen it later.`}
        confirmLabel="Close PR"
        variant="danger"
        onConfirm={actions.executeClose}
        onCancel={() => actions.setConfirmAction(null)}
      />
      <ConfirmDialog
        isOpen={actions.confirmAction === 'bypass'}
        title="Bypass merge?"
        message={`This will merge PR #${pr.number} using admin privileges, bypassing branch protection rules.`}
        confirmLabel="Bypass Merge"
        variant="danger"
        onConfirm={actions.executeBypassMerge}
        onCancel={() => actions.setConfirmAction(null)}
      />
      <ConfirmDialog
        isOpen={actions.confirmAction === 'draft'}
        title={pr.isDraft ? 'Mark as ready for review?' : 'Convert to draft?'}
        message={
          pr.isDraft
            ? `This will mark PR #${pr.number} as ready for review and request reviewers.`
            : `This will convert PR #${pr.number} to a draft. Reviewers will not be requested.`
        }
        confirmLabel={pr.isDraft ? 'Mark Ready' : 'Convert to Draft'}
        variant="default"
        onConfirm={actions.executeToggleDraft}
        onCancel={() => actions.setConfirmAction(null)}
      />
    </>
  );
}
