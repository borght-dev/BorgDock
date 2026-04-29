import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PrActionId } from '@/services/pr-action-resolver';
import type { FlyoutPr } from './FlyoutGlance';

export interface FlyoutPrContextMenuProps {
  pr: FlyoutPr;
  position: { x: number; y: number };
  onClose: () => void;
  /** Closes the entire flyout window. Used after a non-menu-only action. */
  onCloseFlyout: () => void;
}

interface MenuItemProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

function MenuItem({ label, disabled, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      className={`w-full text-left px-3 py-1.5 text-[13px] text-[var(--color-text-primary)] rounded transition-colors ${
        disabled
          ? 'opacity-40 pointer-events-none'
          : 'hover:bg-[var(--color-surface-hover)] cursor-default'
      }`}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-[var(--color-separator)]" />;
}

/**
 * Lightweight context menu rendered inside the flyout window. Mirrors the
 * most-used actions from the main-window PrContextMenu but talks to the main
 * window via emitTo events for anything that needs the live PR store, and
 * performs clipboard / openUrl ops locally where possible.
 *
 * The full PrContextMenu can't be reused here because the flyout is a separate
 * React tree without the main-window stores (settings, notifications, Claude
 * actions hook).
 */
export function FlyoutPrContextMenu({
  pr,
  position,
  onClose,
  onCloseFlyout,
}: FlyoutPrContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [resolvedPos, setResolvedPos] = useState(position);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  // Clamp inside the flyout viewport — the trigger sits at the row's right
  // edge so the natural anchor would otherwise overflow.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = position.x;
    let y = position.y;
    if (x + rect.width + margin > vw) x = Math.max(margin, vw - rect.width - margin);
    if (y + rect.height + margin > vh) y = Math.max(margin, vh - rect.height - margin);
    setResolvedPos({ x, y });
  }, [position.x, position.y]);

  const hasFailing = pr.failedCount > 0;
  const isReady = pr.overallStatus === 'green' && pr.isMine && !pr.isDraft;

  const emitMain = async (event: string, payload: Record<string, unknown>) => {
    try {
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', event, payload);
    } catch {
      // ignore — main may not be loaded
    }
  };

  const runAction = (action: PrActionId, alsoCloseFlyout = true) => () => {
    void emitMain('flyout-pr-action', {
      repoOwner: pr.repoOwner,
      repoName: pr.repoName,
      number: pr.number,
      action,
      failedCheckNames: pr.failedCheckNames ?? [],
    });
    onClose();
    if (alsoCloseFlyout) onCloseFlyout();
  };

  const handleOpenInGitHub = runAction('open');

  const handleOpenDetail = () => {
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_pr_detail_window', {
          owner: pr.repoOwner,
          repo: pr.repoName,
          number: pr.number,
        });
      } catch {
        // ignore
      }
    })();
    onClose();
    onCloseFlyout();
  };

  const handleCopyBranch = () => {
    void (async () => {
      if (!pr.headRef) return;
      try {
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(pr.headRef);
      } catch {
        // ignore
      }
    })();
    onClose();
  };

  const handleCopyUrl = () => {
    void (async () => {
      if (!pr.htmlUrl) return;
      try {
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(pr.htmlUrl);
      } catch {
        // ignore
      }
    })();
    onClose();
  };

  const handleCopyErrors = () => {
    void (async () => {
      const names = pr.failedCheckNames ?? [];
      if (names.length === 0) return;
      const md = [
        `## Failed checks for PR #${pr.number}`,
        '',
        ...names.map((n) => `- ${n}`),
      ].join('\n');
      try {
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(md);
      } catch {
        // ignore
      }
    })();
    onClose();
  };

  const handleFixWithClaude = () => {
    void emitMain('flyout-fix-pr', {
      repoOwner: pr.repoOwner,
      repoName: pr.repoName,
      number: pr.number,
      failedCheckNames: pr.failedCheckNames ?? [],
    });
    onClose();
    onCloseFlyout();
  };

  const handleMonitorWithClaude = () => {
    void emitMain('flyout-monitor-pr', {
      repoOwner: pr.repoOwner,
      repoName: pr.repoName,
      number: pr.number,
    });
    onClose();
    onCloseFlyout();
  };

  return (
    <div
      ref={menuRef}
      data-testid="flyout-pr-context-menu"
      className="fixed z-50 min-w-[200px] rounded-lg border py-1 shadow-lg"
      // style: dynamic anchor coords — pixel values can't be expressed via Tailwind
      style={{
        left: resolvedPos.x,
        top: resolvedPos.y,
        backgroundColor: 'var(--color-modal-bg)',
        borderColor: 'var(--color-modal-border)',
      }}
    >
      <MenuItem label="Open in GitHub" onClick={handleOpenInGitHub} />
      <MenuItem label="Open detail window" onClick={handleOpenDetail} />
      <MenuItem
        label="Copy branch name"
        disabled={!pr.headRef}
        onClick={handleCopyBranch}
      />
      <MenuItem label="Copy PR URL" disabled={!pr.htmlUrl} onClick={handleCopyUrl} />
      <MenuItem
        label="Copy errors for Claude"
        disabled={!hasFailing}
        onClick={handleCopyErrors}
      />

      <Separator />

      <MenuItem label="Checkout branch" onClick={runAction('checkout')} />
      <MenuItem
        label="Rerun failed checks"
        disabled={!hasFailing}
        onClick={runAction('rerun')}
      />
      <MenuItem label="Merge" disabled={!isReady} onClick={runAction('merge')} />

      <Separator />

      <MenuItem label="Fix with Claude" onClick={handleFixWithClaude} />
      <MenuItem label="Monitor with Claude" onClick={handleMonitorWithClaude} />
    </div>
  );
}
