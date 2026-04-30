import { useCallback, useEffect, useRef, useState } from 'react';
import { Dot, IconButton } from '@/components/shared/primitives';
import { createLogger } from '@/services/logger';
import type { PrActionId } from '@/services/pr-action-resolver';
import type { ToastPayload } from './flyout-mode';
import { FlyoutPrContextMenu } from './FlyoutPrContextMenu';
import { FlyoutPrRow } from './FlyoutPrRow';

const log = createLogger('FlyoutGlance');

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
  // Optional — populated by the live useBadgeSync payload. Older / synthetic
  // payloads (test seeds) may omit them so the flyout context menu treats
  // these as best-effort.
  htmlUrl?: string;
  headRef?: string;
  isDraft?: boolean;
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
      await invoke('toggle_sidebar');
    } catch {
      // ignore
    }
    onClose();
  }, [onClose]);

  const handleOpenSettings = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', 'open-settings', {});
      await invoke('toggle_sidebar');
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
      await invoke('toggle_sidebar');
    } catch {
      // ignore
    }
    onClose();
  }, [onClose]);

  const handleClickPr = useCallback(
    async (pr: FlyoutPr) => {
      log.info('PR clicked', { owner: pr.repoOwner, repo: pr.repoName, number: pr.number });
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_pr_detail_window', {
          owner: pr.repoOwner,
          repo: pr.repoName,
          number: pr.number,
        });
        log.info('open_pr_detail_window succeeded', {
          owner: pr.repoOwner,
          repo: pr.repoName,
          number: pr.number,
        });
      } catch (err) {
        log.error('handleClickPr failed', err, {
          owner: pr.repoOwner,
          repo: pr.repoName,
          number: pr.number,
        });
      }
      onClose();
    },
    [onClose],
  );

  // 'more' opens the local context menu; other actions emit to main (which
  // executes them against the live pr-store) and close the flyout.
  const [contextMenu, setContextMenu] = useState<
    | {
        pr: FlyoutPr;
        position: { x: number; y: number };
      }
    | null
  >(null);

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
    <div
      className="flex h-screen w-screen items-end justify-end"
      // style: transparent background required for Tauri transparent-window overlay; padding in px avoids Tailwind rounding
      style={{ background: 'transparent', padding: 16 }}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={panelRef}
        // max-h-full + flex-col so the panel never overflows the window — the
        // PR list shrinks instead of pushing the header off-screen when the
        // window's vertical budget is tight.
        className="flex max-h-full w-[428px] flex-col overflow-hidden rounded-[14px] border"
        // style: animation keyframe + flyout-shadow custom property cannot be expressed as Tailwind utilities
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-strong-border)',
          animation: 'flyoutIn 220ms cubic-bezier(.2,.8,.2,1)',
          boxShadow: 'var(--flyout-shadow)',
        }}
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
                <div
                  className="text-[13px] font-bold tracking-tight text-[var(--color-text-primary)]"
                >
                  BorgDock
                </div>
                <div
                  className="mt-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)]"
                >
                  {totalCount} open pull request{totalCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <IconButton
                icon={<PanelRightOpenIcon />}
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
                <span
                  className="text-[11px] font-semibold text-[var(--color-text-secondary)]"
                >
                  {failingCount}
                </span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  failing
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Dot tone="yellow" />
                <span
                  className="text-[11px] font-semibold text-[var(--color-text-secondary)]"
                >
                  {pendingCount}
                </span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  running
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Dot tone="green" />
                <span
                  className="text-[11px] font-semibold text-[var(--color-text-secondary)]"
                >
                  {passingCount}
                </span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  passing
                </span>
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
                <FocusBoltIcon />
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
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
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
            <div
              className="py-8 text-center text-[12px] text-[var(--color-text-muted)]"
            >
              No open pull requests
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex shrink-0 items-center justify-between border-t px-3.5 py-2 border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)]"
        >
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
      </div>

      {contextMenu && (
        <FlyoutPrContextMenu
          pr={contextMenu.pr}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onCloseFlyout={onClose}
        />
      )}

      <style>{`
        :root {
          --flyout-shadow: 0 8px 24px rgba(90, 86, 112, 0.18), 0 2px 6px rgba(90, 86, 112, 0.06);
        }
        .dark {
          --flyout-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.25);
        }
        @keyframes flyoutIn {
          0% { opacity: 0; transform: translateY(8px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// --- Inline SVG-only icons (consumed by primitive IconButton via icon prop) ---

function PanelRightOpenIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
      <path d="m10 15-3-3 3-3" />
    </svg>
  );
}

function FocusBoltIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
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
