import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@/services/logger';

const log = createLogger('FlyoutApp');

/** Payload sent from the main window via the 'flyout-update' event. */
interface FlyoutData {
  pullRequests: FlyoutPr[];
  failingCount: number;
  pendingCount: number;
  passingCount: number;
  totalCount: number;
  username: string;
  theme: string;
  lastSyncAgo: string;
  hotkey: string;
}

interface FlyoutPr {
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
}

function applyTheme(theme: string) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

export function FlyoutApp() {
  const [data, setData] = useState<FlyoutData>({
    pullRequests: [],
    failingCount: 0,
    pendingCount: 0,
    passingCount: 0,
    totalCount: 0,
    username: '',
    theme: 'system',
    lastSyncAgo: '...',
    hotkey: 'Ctrl+Win+Shift+G',
  });

  const hasReceivedData = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // On mount: fetch cached data from Rust (bypasses suspended main window JS)
  // Then listen for live updates when the main window pushes new data.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        // 1. Fetch cached data directly from Rust state
        const { invoke } = await import('@tauri-apps/api/core');
        const cached = await invoke<string | null>('get_flyout_data');
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as FlyoutData;
            hasReceivedData.current = true;
            setData(parsed);
            if (parsed.theme) applyTheme(parsed.theme);
          } catch {
            // ignore parse errors
          }
        }

        // 2. Listen for live updates (when main window pushes new data)
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<FlyoutData>('flyout-update', (event) => {
          hasReceivedData.current = true;
          setData(event.payload);
          if (event.payload.theme) {
            applyTheme(event.payload.theme);
          }
        });
      } catch (err) {
        console.error('[Flyout] Failed to initialize:', err);
      }
    })();

    return () => unlisten?.();
  }, []);

  // Close on click outside / window blur.
  // The Rust side also hides on WindowEvent::Focused(false), but that fires
  // unreliably for transparent always-on-top windows on Windows. These two
  // JS-side handlers cover the cases it misses:
  //   - blur: user clicks fully outside the Tauri window
  //   - mousedown on backdrop: user clicks inside the window's transparent
  //     padding but outside the panel itself
  useEffect(() => {
    let hidden = false;
    const hide = async () => {
      if (hidden) return;
      hidden = true;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('hide_flyout');
      } catch {
        // ignore
      }
    };
    window.addEventListener('blur', hide);
    return () => window.removeEventListener('blur', hide);
  }, []);

  const handleBackdropMouseDown = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('hide_flyout');
      } catch {
        // ignore
      }
    }
  }, []);

  const handleOpenSidebar = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('toggle_sidebar');
      await invoke('hide_flyout');
    } catch {
      // ignore
    }
  }, []);

  const handleOpenSettings = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', 'open-settings', {});
      await invoke('toggle_sidebar');
      await invoke('hide_flyout');
    } catch {
      // ignore
    }
  }, []);

  const handleClickPr = useCallback(async (pr: FlyoutPr) => {
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
      await invoke('hide_flyout');
    } catch (err) {
      log.error('handleClickPr failed', err, {
        owner: pr.repoOwner,
        repo: pr.repoName,
        number: pr.number,
      });
    }
  }, []);

  const handleFixPr = useCallback(async (pr: FlyoutPr) => {
    try {
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', 'flyout-fix-pr', {
        repoOwner: pr.repoOwner,
        repoName: pr.repoName,
        number: pr.number,
        failedCheckNames: pr.failedCheckNames ?? [],
      });
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('hide_flyout');
    } catch {
      // ignore
    }
  }, []);

  const handleMonitorPr = useCallback(async (pr: FlyoutPr) => {
    try {
      const { emitTo } = await import('@tauri-apps/api/event');
      await emitTo('main', 'flyout-monitor-pr', {
        repoOwner: pr.repoOwner,
        repoName: pr.repoName,
        number: pr.number,
      });
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('hide_flyout');
    } catch {
      // ignore
    }
  }, []);

  const { failingCount, pendingCount, passingCount, pullRequests, totalCount } = data;

  return (
    <div
      className="flex h-screen w-screen items-end justify-end"
      style={{ background: 'transparent', padding: 16 }}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={panelRef}
        className="w-[380px] overflow-hidden rounded-[14px] border"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-strong-border)',
          animation: 'flyoutIn 220ms cubic-bezier(.2,.8,.2,1)',
          boxShadow: 'var(--flyout-shadow)',
        }}
      >
        {/* Header */}
        <div
          className="border-b px-4 pt-3.5 pb-3"
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
                  className="text-[13px] font-bold tracking-tight"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  PRDock
                </div>
                <div
                  className="mt-0.5 text-[10.5px]"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  {totalCount} open pull request{totalCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <IconButton title="Open sidebar" onClick={handleOpenSidebar}>
                <PanelRightOpenIcon />
              </IconButton>
              <IconButton title="Settings" onClick={handleOpenSettings}>
                <SettingsIcon />
              </IconButton>
            </div>
          </div>

          {/* Stat strip */}
          <div className="mt-3 flex gap-3.5">
            <StatDot
              color="var(--color-status-red)"
              count={failingCount}
              label="failing"
              pulse={failingCount > 0}
            />
            <StatDot color="var(--color-status-yellow)" count={pendingCount} label="running" />
            <StatDot color="var(--color-status-green)" count={passingCount} label="passing" />
          </div>
        </div>

        {/* PR list */}
        <div className="max-h-[360px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {pullRequests.map((pr, i) => (
            <PrRow
              key={`${pr.repoOwner}/${pr.repoName}#${pr.number}`}
              pr={pr}
              onClick={handleClickPr}
              onFix={handleFixPr}
              onMonitor={handleMonitorPr}
              index={i}
            />
          ))}
          {pullRequests.length === 0 && (
            <div
              className="py-8 text-center text-[12px]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              No open pull requests
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t px-3.5 py-2"
          style={{
            borderColor: 'var(--color-subtle-border)',
            background: 'var(--color-surface-raised)',
          }}
        >
          <span
            className="text-[10px]"
            style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)' }}
          >
            synced {data.lastSyncAgo}
          </span>
          <span
            className="text-[10px]"
            style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)' }}
          >
            {data.hotkey}
          </span>
        </div>
      </div>

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
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}

// --- Sub-components ---

function PrRow({
  pr,
  onClick,
  onFix,
  onMonitor,
  index,
}: {
  pr: FlyoutPr;
  onClick: (pr: FlyoutPr) => void;
  onFix: (pr: FlyoutPr) => void;
  onMonitor: (pr: FlyoutPr) => void;
  index: number;
}) {
  const [hovered, setHovered] = useState(false);

  const statusColor =
    pr.overallStatus === 'red'
      ? 'var(--color-status-red)'
      : pr.overallStatus === 'yellow'
        ? 'var(--color-status-yellow)'
        : 'var(--color-status-green)';

  const checksLabel =
    pr.failedCount > 0
      ? `${pr.failedCount} failing`
      : pr.pendingCount > 0
        ? `${pr.pendingCount} running`
        : `${pr.passedCount} passed`;

  const reviewMap: Record<string, { label: string; colorVar: string }> = {
    approved: { label: 'approved', colorVar: '--color-review-approved' },
    changesRequested: { label: 'changes', colorVar: '--color-review-changes-requested' },
    pending: { label: 'review needed', colorVar: '--color-review-required' },
    commented: { label: 'commented', colorVar: '--color-review-commented' },
    none: { label: '', colorVar: '' },
  };

  const noReview = { label: '', colorVar: '' };
  const review = reviewMap[pr.reviewStatus] ?? noReview;

  const showFix = pr.failedCount > 0;
  const showMonitor = pr.overallStatus !== 'green' && pr.totalChecks > 0;

  return (
    <div
      className="flex w-full cursor-pointer items-start gap-2.5 text-left transition-colors"
      style={{
        padding: '10px 14px',
        background: hovered ? 'var(--color-surface-hover)' : 'transparent',
        borderLeft: pr.isMine ? '2px solid var(--color-accent)' : '2px solid transparent',
        animation: `fadeSlide 320ms ${index * 30}ms cubic-bezier(.2,.8,.2,1) both`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(pr)}
    >
      {/* Author avatar */}
      <div
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{
          background: avatarColor(pr.authorLogin),
          boxShadow: `0 0 0 2px var(--color-surface)`,
          marginTop: 1,
        }}
      >
        {pr.authorLogin.slice(0, 2).toUpperCase()}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div
            className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-snug"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {pr.title}
          </div>
          {/* Action buttons — visible on hover */}
          {hovered && (showFix || showMonitor) && (
            <div className="flex shrink-0 gap-1">
              {showFix && (
                <button
                  type="button"
                  title="Fix failing checks with Claude"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFix(pr);
                  }}
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'color-mix(in srgb, #ef4444 12%, transparent)',
                    color: '#ef4444',
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Fix
                </button>
              )}
              {showMonitor && (
                <button
                  type="button"
                  title="Monitor PR with Claude"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMonitor(pr);
                  }}
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'color-mix(in srgb, #8b5cf6 12%, transparent)',
                    color: '#8b5cf6',
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Monitor
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className="text-[10.5px] font-medium"
            style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-code)' }}
          >
            {pr.repoOwner}/{pr.repoName} #{pr.number}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
            ·
          </span>
          <div className="flex items-center gap-1">
            <StatusIcon status={pr.overallStatus} color={statusColor} />
            <span
              className="text-[10.5px]"
              style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-code)' }}
            >
              {checksLabel}
            </span>
          </div>
          {pr.commentCount > 0 && (
            <>
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                ·
              </span>
              <div
                className="flex items-center gap-0.5"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                <CommentIcon />
                <span className="text-[10.5px]">{pr.commentCount}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Review badge */}
      {review.label && (
        <div className="mt-0.5">
          <ReviewBadge label={review.label} colorVar={review.colorVar} />
        </div>
      )}
    </div>
  );
}

function ReviewBadge({ label, colorVar }: { label: string; colorVar: string }) {
  return (
    <span
      className="rounded-full px-[7px] py-[2px] text-[10px] font-semibold lowercase tracking-wide"
      style={{
        color: `var(${colorVar})`,
        background: `color-mix(in srgb, var(${colorVar}) 8%, transparent)`,
        border: `1px solid color-mix(in srgb, var(${colorVar}) 20%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function StatDot({
  color,
  count,
  label,
  pulse,
}: {
  color: string;
  count: number;
  label: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: color,
          animation: pulse ? 'pulse 1.8s ease-in-out infinite' : 'none',
          boxShadow: pulse ? `0 0 8px ${color}` : 'none',
        }}
      />
      <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
        {count}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
      </span>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
      style={{ color: 'var(--color-text-tertiary)' }}
      title={title}
      onClick={onClick}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--color-icon-btn-hover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

// --- Inline SVG icons (small, no dependency on lucide) ---

function StatusIcon({ status, color }: { status: string; color: string }) {
  if (status === 'red') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m15 9-6 6M9 9l6 6" />
      </svg>
    );
  }
  if (status === 'yellow') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

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

/** Deterministic color from author login */
function avatarColor(login: string): string {
  const colors = ['#7C6AF6', '#3BA68E', '#C7324F', '#B07D09', '#8250DF', '#0078D4'];
  let hash = 0;
  for (let i = 0; i < login.length; i++) {
    hash = login.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length]!;
}
