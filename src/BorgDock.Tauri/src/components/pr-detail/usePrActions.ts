import { useCallback, useState } from 'react';
import { useClaudeActions } from '@/hooks/useClaudeActions';
import { createLogger } from '@/services/logger';
import { bypassMergePr, closePr, mergePr, toggleDraftPr } from '@/services/pr-actions';
import { findRepoConfig } from '@/services/repo-lookup';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import { parseError } from '@/utils/parse-error';

const log = createLogger('usePrActions');

export interface PrActions {
  onMerge: () => Promise<void>;
  onBypassConfirm: () => void;
  onBypassExecute: () => Promise<void>;
  onCloseConfirm: () => void;
  onCloseExecute: () => Promise<void>;
  onToggleDraft: () => Promise<void>;
  onResolveConflicts: () => Promise<void>;
  onOpenInBrowser: () => Promise<void>;
  onCopyBranch: () => Promise<void>;
  onCheckoutToggle: () => void;

  actionStatus: string;
  isReady: boolean;
  checkoutOpen: boolean;
  setCheckoutOpen: (open: boolean) => void;
  confirmClose: boolean;
  setConfirmClose: (open: boolean) => void;
  confirmBypass: boolean;
  setConfirmBypass: (open: boolean) => void;

  repoPath: string;
  worktreeSubfolder: string;
  favoritePaths: string[] | undefined;
  favoritesOnlyDefault: boolean;
  windowsTerminalProfile: string | undefined;
}

export function usePrActions(pr: PullRequestWithChecks): PrActions {
  const p = pr.pullRequest;
  const [actionStatus, setActionStatus] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmBypass, setConfirmBypass] = useState(false);

  const { resolveConflicts } = useClaudeActions();

  const repoConfig = useSettingsStore((s) =>
    findRepoConfig(s.settings.repos, p.repoOwner, p.repoName),
  );
  const repoPath = repoConfig?.worktreeBasePath ?? '';
  const worktreeSubfolder = repoConfig?.worktreeSubfolder ?? '.worktrees';
  const favoritePaths = repoConfig?.favoriteWorktreePaths;
  const favoritesOnlyDefault = useSettingsStore(
    (s) => s.settings.ui.worktreePaletteFavoritesOnly ?? false,
  );
  const windowsTerminalProfile = useSettingsStore(
    (s) => s.settings.ui.windowsTerminalProfile,
  );

  const captureErrorAsStatus = useCallback(
    (label: string) => (_title: string, err: unknown) => {
      setActionStatus(`${label}: ${parseError(err).message}`);
      setTimeout(() => setActionStatus(''), 5000);
    },
    [],
  );

  const prRefBase = {
    repoOwner: p.repoOwner,
    repoName: p.repoName,
    number: p.number,
    title: p.title,
    htmlUrl: p.htmlUrl,
  };

  const onMerge = useCallback(async () => {
    setActionStatus('Merging...');
    const ok = await mergePr(prRefBase, {
      method: 'squash',
      onError: captureErrorAsStatus('Merge failed'),
    });
    if (ok) setActionStatus('');
    // biome-ignore lint/correctness/useExhaustiveDependencies: explicit field deps avoid object reference churn
  }, [p.repoOwner, p.repoName, p.number, p.title, p.htmlUrl, captureErrorAsStatus]);

  const onBypassConfirm = useCallback(() => setConfirmBypass(true), []);
  const onBypassExecute = useCallback(async () => {
    setConfirmBypass(false);
    setActionStatus('Merging...');
    const ok = await bypassMergePr(prRefBase, {
      onError: captureErrorAsStatus('Bypass merge failed'),
    });
    if (ok) setActionStatus('');
    // biome-ignore lint/correctness/useExhaustiveDependencies: explicit field deps avoid object reference churn
  }, [p.repoOwner, p.repoName, p.number, p.title, p.htmlUrl, captureErrorAsStatus]);

  const onCloseConfirm = useCallback(() => setConfirmClose(true), []);
  const onCloseExecute = useCallback(async () => {
    setConfirmClose(false);
    setActionStatus('Closing...');
    const ok = await closePr(
      { repoOwner: p.repoOwner, repoName: p.repoName, number: p.number },
      { onError: captureErrorAsStatus('Close failed') },
    );
    if (ok) setActionStatus('PR closed');
    setTimeout(() => setActionStatus(''), 3000);
  }, [p.repoOwner, p.repoName, p.number, captureErrorAsStatus]);

  const onToggleDraft = useCallback(async () => {
    setActionStatus(p.isDraft ? 'Marking ready...' : 'Marking draft...');
    const ok = await toggleDraftPr(
      { repoOwner: p.repoOwner, repoName: p.repoName, number: p.number, isDraft: p.isDraft },
      { onError: captureErrorAsStatus(p.isDraft ? 'Mark ready failed' : 'Mark draft failed') },
    );
    if (ok) setActionStatus(p.isDraft ? 'Marked ready!' : 'Marked draft!');
    setTimeout(() => setActionStatus(''), 3000);
  }, [p.repoOwner, p.repoName, p.number, p.isDraft, captureErrorAsStatus]);

  const onResolveConflicts = useCallback(async () => {
    setActionStatus('Launching Claude to resolve conflicts...');
    try {
      await resolveConflicts(pr);
      setActionStatus('Claude is resolving conflicts');
    } catch (err) {
      setActionStatus(`Failed: ${err}`);
    }
    setTimeout(() => setActionStatus(''), 5000);
  }, [pr, resolveConflicts]);

  const onOpenInBrowser = useCallback(async () => {
    log.info('open-in-browser clicked', { url: p.htmlUrl });
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(p.htmlUrl);
    } catch (err) {
      log.error('openUrl failed', err, { url: p.htmlUrl });
    }
  }, [p.htmlUrl]);

  const onCopyBranch = useCallback(async () => {
    log.info('copy-branch clicked', { branch: p.headRef });
    await copyToClipboard(p.headRef);
  }, [p.headRef]);

  const onCheckoutToggle = useCallback(() => setCheckoutOpen((v) => !v), []);

  const isReady =
    pr.overallStatus === 'green' &&
    !p.isDraft &&
    p.mergeable !== false &&
    p.reviewStatus === 'approved';

  return {
    onMerge,
    onBypassConfirm,
    onBypassExecute,
    onCloseConfirm,
    onCloseExecute,
    onToggleDraft,
    onResolveConflicts,
    onOpenInBrowser,
    onCopyBranch,
    onCheckoutToggle,
    actionStatus,
    isReady,
    checkoutOpen,
    setCheckoutOpen,
    confirmClose,
    setConfirmClose,
    confirmBypass,
    setConfirmBypass,
    repoPath,
    worktreeSubfolder,
    favoritePaths,
    favoritesOnlyDefault,
    windowsTerminalProfile,
  };
}
