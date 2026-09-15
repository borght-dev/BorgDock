import { PanelRightOpen, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshIcon, SettingsIcon } from '@/components/shared/icons';
import { Dot, IconButton } from '@/components/shared/primitives';
import type { PrActionId } from '@/services/pr-action-resolver';
import { FlyoutFrame } from './FlyoutFrame';
import { FlyoutPrContextMenu } from './FlyoutPrContextMenu';
import { FlyoutPrRow } from './FlyoutPrRow';
import type { ToastPayload } from './flyout-mode';

/** Payload sent from the main window via the 'flyout-update' event. */
export interface FlyoutData {
  pullRequests: FlyoutPr[];
  failingCount: number;
  pendingCount: number;
  passingCount: number;
  totalCount: number;
  /** Count of PRs the priority scorer flagged as needing attention. */
  focusCount: number;
  username: string;
  theme: string;
  lastSyncAgo: string;
  hotkey: string;
}

export interface FlyoutPr {
  number: number;
  title: string;
  repoOwner: string;
  repoName: string;
  authorLogin: string;
  authorAvatarUrl: string;
  overallStatus: 'red' | 'yellow' | 'green' | 'gray';
  reviewStatus: string;
  failedCount: number;
  failedCheckNames: string[];
  pendingCount: number;
  passedCount: number;
  totalChecks: number;
  commentCount: number;
  isMine: boolean;
  // Optional — populated by the live useFlyoutSync payload. Older / synthetic
  // payloads (test seeds) may omit them so the flyout context menu treats
  // these as best-effort.
  htmlUrl?: string;
  headRef?: string;
  isDraft?: boolean;
  /** Merge readiness 0..100. Mirrors computeMergeScore() in the main window. */
  mergeScore?: number;
  /** GitHub's `mergeable` field — false means conflicts. */
  mergeable?: boolean;
  /** Checks that count toward the pass ratio (total minus skipped). */
  relevantChecks?: number;
  baseRef?: string;
  additions?: number;
  deletions?: number;
  labels?: string[];
}

export function FlyoutGlance({
  data,
  banner,
  onClose,
}: {
  data: FlyoutData;
  banner?: ToastPayload;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  const { failingCount, pendingCount, passingCount, pullRequests, totalCount, focusCount } = data;

  // Only show the repository slug per row when the user is monitoring more
  // than one — single-repo setups make every row's "owner/repo" identical and
  // wastes the space.
  const uniqueRepos = new Set(pullRequests.map((p) => `${p.repoOwner}/${p.repoName}`));
  const showRepoPerRow = uniqueRepos.size > 1;

  // Active-row tracking for j/k keyboard nav. Initial active row = 0 so e2e
  // assertion `pressing j advances from 0 → 1` holds.
  const [activeIndex, setActiveIndex] = useState(0);
  const lastLength = useRef(pullRequests.length);
  useEffect(() => {
    // Clamp activeIndex if list shrinks.
    if (pullRequests.length !== lastLength.current) {
      lastLength.current = pullRequests.length;
      setActiveIndex((i) => Math.min(i, Math.max(0, pullRequests.length - 1)));
    }
  }, [pullRequests.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (pullRequests.length === 0) return;
      if (e.key === 'j') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, pullRequests.length - 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pullRequests.length]);

  const handleBackdropMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  const handleOpenSidebar = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('show_or_focus_main');
    } catch {
      // ignore
    }
    onClose();
  }, [onClose]);

  const handleOpenSettings = useCallback(async () => {
    try {
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', 'open-settings', {});
    } catch {
      // ignore
    }
    onClose();
  }, [onClose]);

  const handleOpenFocus = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', 'open-focus', {});
      await invoke('show_or_focus_main');
    } catch {
      // ignore
    }
    onClose();
  }, [onClose]);

  // Refresh keeps the flyout open — the main window will push an updated
  // flyout-update event once polling completes, refreshing counts + synced ago.
  // The button shows a spinning indicator while waiting for that update.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', 'flyout-refresh', {});
    } catch {
      // emitTo failed — drop the spinner immediately rather than waiting
      // for a flyout-update that won't come.
      setIsRefreshing(false);
    }
  }, []);

  // Clear the spinner when the next poll result lands (lastSyncAgo updates).
  // The ref skips the initial mount so we don't immediately clear a freshly
  // set isRefreshing flag on the same render that triggered it.
  const lastSyncAgoSeen = useRef(data.lastSyncAgo);
  useEffect(() => {
    if (lastSyncAgoSeen.current === data.lastSyncAgo) return;
    lastSyncAgoSeen.current = data.lastSyncAgo;
    setIsRefreshing(false);
  }, [data.lastSyncAgo]);

  // Failsafe: if no flyout-update arrives within 5s (polling failed, network
  // error, etc.), drop the spinner anyway so the button isn't stuck.
  useEffect(() => {
    if (!isRefreshing) return;
    const timer = setTimeout(() => setIsRefreshing(false), 5000);
    return () => clearTimeout(timer);
  }, [isRefreshing]);

  const handleClickPr = useCallback(
    async (pr: FlyoutPr) => {
      const { openPrDetail } = await import('@/services/windows');
      try {
        await openPrDetail({ owner: pr.repoOwner, repo: pr.repoName, number: pr.number });
      } catch {
        // openPrDetail logs the failure already; swallow so the flyout still closes.
      }
      onClose();
    },
    [onClose],
  );

  // 'more' opens the local context menu; other actions emit to main (which
  // executes them against the live pr-store) and close the flyout.
  const [contextMenu, setContextMenu] = useState<{
    pr: FlyoutPr;
    position: { x: number; y: number };
  } | null>(null);

  const handlePrAction = useCallback(
    async (pr: FlyoutPr, action: PrActionId | 'more', e: React.MouseEvent) => {
      if (action === 'more') {
        setContextMenu({ pr, position: { x: e.clientX, y: e.clientY } });
        return;
      }
      try {
        const { emitTo } = await import('@tauri-apps/api/event');
        await emitTo('main', 'flyout-pr-action', {
          repoOwner: pr.repoOwner,
          repoName: pr.repoName,
          number: pr.number,
          action,
          failedCheckNames: pr.failedCheckNames ?? [],
        });
      } catch {
        // ignore
      }
      onClose();
    },
    [onClose],
  );

  return (
    <FlyoutFrame
      panelRef={panelRef}
      onBackdropMouseDown={handleBackdropMouseDown}
      overlay={
        contextMenu && (
          <FlyoutPrContextMenu
            pr={contextMenu.pr}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
            onCloseFlyout={onClose}
          />
        )
      }
    >
      {/* Header */}
      <div
        className="shrink-0 border-b px-4 pt-3.5 pb-3"
        // style: gradient background — no Tailwind utility covers multi-stop CSS gradients with tokens
        style={{
          borderColor: 'var(--color-subtle-border)',
          background: 'linear-gradient(135deg, var(--color-surface-raised), transparent)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Brand icon — heartbeat pulse line matching sidebar header */}
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              // style: gradient background + color-mix box-shadow — no Tailwind utilities for these
              style={{
                background:
                  'linear-gradient(135deg, var(--color-logo-gradient-start), var(--color-logo-gradient-end))',
                boxShadow: '0 2px 8px color-mix(in srgb, var(--color-accent) 25%, transparent)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 9 L4 9 L5.5 5 L7.5 12 L9 3 L11 11 L12.5 7 L14 9"
                  stroke="white"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="14" cy="9" r="1.3" fill="white" opacity="0.85" />
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-bold tracking-tight text-[var(--color-text-primary)]">
                BorgDock
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)]">
                {totalCount} open pull request{totalCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
          <div className="flex gap-1">
            <IconButton
              icon={<RefreshIcon spinning={isRefreshing} />}
              tooltip={isRefreshing ? 'Refreshing…' : 'Poll now'}
              aria-label="Refresh"
              aria-busy={isRefreshing}
              size={26}
              disabled={isRefreshing}
              onClick={handleRefresh}
            />
            <IconButton
              icon={<PanelRightOpen size={14} />}
              tooltip="Open sidebar"
              aria-label="Open sidebar"
              size={26}
              onClick={handleOpenSidebar}
            />
            <IconButton
              icon={<SettingsIcon />}
              tooltip="Settings"
              aria-label="Settings"
              size={26}
              onClick={handleOpenSettings}
            />
          </div>
        </div>

        {/* Stat strip */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3.5">
            <div className="flex items-center gap-1.5">
              <Dot tone="red" pulse={failingCount > 0} />
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                {failingCount}
              </span>
              <span className="text-[11px] text-[var(--color-text-tertiary)]">failing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Dot tone="yellow" />
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                {pendingCount}
              </span>
              <span className="text-[11px] text-[var(--color-text-tertiary)]">running</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Dot tone="green" />
              <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                {passingCount}
              </span>
              <span className="text-[11px] text-[var(--color-text-tertiary)]">passing</span>
            </div>
          </div>
          {focusCount > 0 && (
            <button
              type="button"
              onClick={handleOpenFocus}
              aria-label={`Open focus tab — ${focusCount} need attention`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
              // style: accent-tinted pill — color-mix backgrounds + accent token are not in the Tailwind config
              style={{
                background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                color: 'var(--color-accent)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)',
              }}
            >
              <Zap size={11} fill="currentColor" stroke="none" aria-hidden="true" />
              <span>Focus {focusCount}</span>
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          className="shrink-0 px-4 py-2 text-[11px] font-semibold text-white"
          // style: severity-driven gradient background — bannerColor() returns a CSS gradient string computed at render
          style={{ background: bannerColor(banner.severity) }}
          data-testid="flyout-glance-banner"
        >
          {banner.title}
        </div>
      )}

      {/* PR list */}
      {/* flex-1 + min-h-0 lets this region absorb the leftover vertical
            space inside the panel and scroll internally — replaces the old
            fixed max-h-[360px], which could push the header off-screen when
            the window was shorter than header + 360 + footer. */}
      {/* style: scrollbarWidth is a non-standard CSS property with no Tailwind utility */}
      <div className="bd-pr-rows min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {pullRequests.map((pr, i) => (
          <FlyoutPrRow
            key={`${pr.repoOwner}/${pr.repoName}#${pr.number}`}
            pr={pr}
            active={i === activeIndex}
            onClick={handleClickPr}
            onAction={handlePrAction}
            showRepo={showRepoPerRow}
          />
        ))}
        {pullRequests.length === 0 && (
          <div className="py-8 text-center text-[12px] text-[var(--color-text-muted)]">
            No open pull requests
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t px-3.5 py-2 border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)]">
        {/* style: var(--font-code) custom property — no Tailwind font-mono maps to this design token */}
        <span
          className="text-[10px] text-[var(--color-text-muted)]"
          style={{ fontFamily: 'var(--font-code)' }}
        >
          synced {data.lastSyncAgo}
        </span>
        {/* style: var(--font-code) custom property — no Tailwind font-mono maps to this design token */}
        <span
          className="text-[10px] text-[var(--color-text-muted)]"
          style={{ fontFamily: 'var(--font-code)' }}
        >
          {data.hotkey}
        </span>
      </div>
    </FlyoutFrame>
  );
}

function bannerColor(severity: ToastPayload['severity']): string {
  switch (severity) {
    case 'error':
      return 'linear-gradient(90deg,#dc2646,#b01834)';
    case 'warning':
      return 'linear-gradient(90deg,#d97706,#b05800)';
    case 'success':
      return 'linear-gradient(90deg,#05966a,#046e4e)';
    default:
      return 'linear-gradient(90deg,#7c6af6,#5b45e8)';
  }
}
