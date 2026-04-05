import { useCallback, useEffect, useRef, useState } from 'react';
import { mergePullRequest } from '@/services/github/mutations';
import { getClient } from '@/services/github/singleton';
import { useNotificationStore } from '@/stores/notification-store';

interface MergeRequest {
  id: string;
  owner: string;
  repo: string;
  prNumber: number;
  timeoutId: ReturnType<typeof setTimeout>;
  undone: boolean;
}

export function MergeToast() {
  const [toasts, setToasts] = useState<MergeRequest[]>([]);
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const executeMerge = useCallback(async (req: MergeRequest) => {
    if (req.undone) return;
    const client = getClient();
    if (!client) return;

    try {
      await mergePullRequest(client, req.owner, req.repo, req.prNumber, 'squash');
      useNotificationStore.getState().show({
        title: `PR #${req.prNumber} merged!`,
        message: `${req.owner}/${req.repo}`,
        severity: 'success',
        actions: [],
      });
    } catch (err) {
      useNotificationStore.getState().show({
        title: `Failed to merge PR #${req.prNumber}`,
        message: `${err}`,
        severity: 'error',
        actions: [],
      });
    }

    setToasts((prev) => prev.filter((t) => t.id !== req.id));
  }, []);

  const queueMerge = useCallback(
    (owner: string, repo: string, prNumber: number) => {
      const id = `${owner}/${repo}#${prNumber}-${Date.now()}`;
      const req: MergeRequest = {
        id,
        owner,
        repo,
        prNumber,
        undone: false,
        timeoutId: setTimeout(() => {
          const current = toastsRef.current.find((t) => t.id === id);
          if (current && !current.undone) {
            executeMerge(current);
          }
        }, 3000),
      };
      setToasts((prev) => [...prev, req]);
    },
    [executeMerge],
  );

  const undoMerge = useCallback((id: string) => {
    setToasts((prev) => {
      const toast = prev.find((t) => t.id === id);
      if (toast) {
        clearTimeout(toast.timeoutId);
        toast.undone = true;
      }
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  // Expose queueMerge globally for keyboard shortcuts
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__prdockQueueMerge = queueMerge;
    return () => {
      delete (window as unknown as Record<string, unknown>).__prdockQueueMerge;
    };
  }, [queueMerge]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-3 rounded-lg border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-4 py-2.5 shadow-lg animate-[slideInRight_0.2s_ease-out]"
        >
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
          <span className="text-xs text-[var(--color-text-primary)]">
            Merging PR #{toast.prNumber}...
          </span>
          <button
            onClick={() => undoMerge(toast.id)}
            className="rounded-md bg-[var(--color-action-danger-bg)] px-2 py-0.5 text-xs font-medium text-[var(--color-action-danger-fg)] hover:opacity-80 transition-opacity"
          >
            Undo
          </button>
        </div>
      ))}
    </div>
  );
}
