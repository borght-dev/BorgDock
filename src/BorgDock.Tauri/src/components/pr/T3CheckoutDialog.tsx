import FocusTrap from 'focus-trap-react';
import { useCallback, useEffect } from 'react';
import { CheckoutPanel } from '@/components/pr-detail/CheckoutPanel';
import { sendOsNotification } from '@/services/notification';
import { findRepoConfig } from '@/services/repo-lookup';
import { openT3Thread } from '@/services/t3-thread';
import { useSettingsStore } from '@/stores/settings-store';
import { useT3ThreadStore } from '@/stores/t3-thread-store';
import { parseError } from '@/utils/parse-error';

/**
 * Modal worktree picker shown by "Open a new thread in T3" when the PR branch
 * is not checked out anywhere yet. Reuses the PR detail `CheckoutPanel`; as
 * soon as a worktree holds the branch the T3 thread opens on it and the
 * dialog closes. Mount once per window (main + PR detail).
 */
export function T3CheckoutDialog() {
  const pr = useT3ThreadStore((s) => s.pendingCheckout);
  const repoConfig = useSettingsStore((s) =>
    pr ? findRepoConfig(s.settings.repos, pr.repoOwner, pr.repoName) : undefined,
  );
  const favoritesOnlyDefault = useSettingsStore(
    (s) => s.settings.ui.worktreePaletteFavoritesOnly ?? false,
  );
  const windowsTerminalProfile = useSettingsStore((s) => s.settings.ui.windowsTerminalProfile);

  const dismiss = useCallback(() => useT3ThreadStore.getState().setPendingCheckout(null), []);

  useEffect(() => {
    if (!pr) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [pr, dismiss]);

  const handleWorktreeReady = useCallback(
    (worktreePath: string) => {
      if (!pr) return;
      dismiss();
      openT3Thread(pr, worktreePath).catch((err) => {
        void sendOsNotification({
          title: 'Open in T3 failed',
          body: parseError(err).message,
          severity: 'error',
        }).catch(() => {});
      });
    },
    [pr, dismiss],
  );

  if (!pr) return null;

  return (
    <FocusTrap
      focusTrapOptions={{
        allowOutsideClick: true,
        escapeDeactivates: false,
        tabbableOptions: { displayCheck: 'none' },
      }}
    >
      <div data-t3-checkout-dialog="">
        <button
          type="button"
          aria-label="Close T3 checkout dialog"
          className="fixed inset-0 z-50 bg-black/50"
          onClick={dismiss}
        />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Check out ${pr.headRef} for T3`}
            className="pointer-events-auto w-full max-w-md max-h-full overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CheckoutPanel
              branchName={pr.headRef}
              repoBasePath={repoConfig?.worktreeBasePath ?? ''}
              worktreeSubfolder={repoConfig?.worktreeSubfolder ?? '.worktrees'}
              favoritePaths={repoConfig?.favoriteWorktreePaths}
              favoritesOnlyDefault={favoritesOnlyDefault}
              windowsTerminalProfile={windowsTerminalProfile}
              onDismiss={dismiss}
              onWorktreeReady={handleWorktreeReady}
            />
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
