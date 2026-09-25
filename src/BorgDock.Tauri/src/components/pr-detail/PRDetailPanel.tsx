import { getCurrentWindow } from '@tauri-apps/api/window';
import clsx from 'clsx';
import { ArrowRight, ExternalLink, GitBranch, LoaderCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QuickReviewOverlay } from '@/components/focus/QuickReviewOverlay';
import { passedOfCounted } from '@/components/pr/pr-card-data';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { WindowControls } from '@/components/shared/chrome';
import type { TabDef } from '@/components/shared/primitives';
import { Avatar, IconButton, Pill, Ring, Tabs, TitleBar } from '@/components/shared/primitives';
import { useDetailViewKeys } from '@/hooks/useDetailViewKeys';
import { createLogger } from '@/services/logger';
import { computeMergeScore } from '@/services/merge-score';
import { popView } from '@/services/navigation';
import { openT3Thread } from '@/services/t3-thread';
import { openPrDetail } from '@/services/windows';
import { usePrDetailJumpStore } from '@/stores/pr-detail-jump-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { type PrDetailTab, useUiStore } from '@/stores/ui-store';
import type { CheckRun, PullRequestWithChecks } from '@/types';
import { ActionBar } from './ActionBar';
import { ActivityStrip } from './ActivityStrip';
import { CheckoutPanel } from './CheckoutPanel';
import { ChecksTab } from './ChecksTab';
import { CommitsTab } from './CommitsTab';
import { DiscussionTab } from './DiscussionTab';
import { FilesTab } from './FilesTab';
import { OverviewTab } from './OverviewTab';
import { PrDetailHeader } from './PrDetailHeader';
import { usePrActions } from './usePrActions';

const log = createLogger('PrDetailPanel');

const BorgDockLogo = () => (
  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="pr-detail-tile" x1="0" y1="0" x2="16" y2="16">
        <stop offset="0%" stopColor="var(--color-logo-gradient-start)" />
        <stop offset="100%" stopColor="var(--color-logo-gradient-end)" />
      </linearGradient>
    </defs>
    <rect width="16" height="16" rx="4.5" fill="url(#pr-detail-tile)" />
    <path
      d="M2 9 L4 9 L5.5 5 L7.5 12 L9 3 L11 11 L12.5 7 L14 9"
      stroke="white"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="14" cy="9" r="1.3" fill="white" opacity="0.85" />
  </svg>
);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatAge(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function reviewStatusLabel(
  status: PullRequestWithChecks['pullRequest']['reviewStatus'],
): string | null {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'changesRequested':
      return 'changes requested';
    case 'pending':
      return 'in review';
    case 'commented':
      return 'commented';
    default:
      return null;
  }
}

function initialsFor(login: string): string {
  const trimmed = login.trim();
  if (!trimmed) return '??';
  const parts = trimmed.split(/[\s_-]+/).filter(Boolean);
  const first = parts[0]?.[0];
  const second = parts[1]?.[0];
  if (first && second) return (first + second).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

const tabs = ['Overview', 'Commits', 'Files', 'Checks', 'Discussion'] as const;
type Tab = (typeof tabs)[number];

/** Tab order of the full-screen view: what you check first comes first. */
const EMBEDDED_TAB_ORDER: readonly Tab[] = ['Overview', 'Checks', 'Files', 'Commits', 'Discussion'];

const TAB_FOR_VIEW: Record<PrDetailTab, Tab> = {
  overview: 'Overview',
  commits: 'Commits',
  files: 'Files',
  checks: 'Checks',
  discussion: 'Discussion',
};

interface PrDetailPanelProps {
  pr: PullRequestWithChecks;
  /** Raw check runs for the Checks tab. The pop-out window fetches these via
   *  the REST cold path; polled PRs no longer carry them. Defaults to []. */
  checks?: CheckRun[];
  /** Pop-out mode: the panel is hosting the entire PR detail window.
   *  Makes the header the window drag region, hides the pop-out button,
   *  shows native-style min/max/close controls, and routes the × button
   *  to close the window instead of clearing the sidebar selection. */
  popOutWindow?: boolean;
  /**
   * Hosted by the main window's full-screen detail view (`PrDetailView`):
   * the Workbench header (Back, readiness, action bar, "Open in window")
   * replaces the pop-out chrome, the ring, the pills and the close button;
   * the tabs run Overview, Checks, Files, Commits, Discussion with a sliding
   * underline, the Checks tab groups by suite, and `J` / `K` switch tabs.
   */
  embedded?: boolean;
  /** Tab to open on (a `pr-detail` view's `initialTab`). Default Overview. */
  initialTab?: PrDetailTab;
}

export function PrDetailPanel({
  pr,
  checks = [],
  popOutWindow,
  embedded = false,
  initialTab,
}: PrDetailPanelProps) {
  const selectPr = useUiStore((s) => s.selectPr);
  const handleClose = useCallback(() => {
    if (popOutWindow) {
      getCurrentWindow()
        .close()
        .catch((err) => log.error('close window failed', err));
    } else {
      selectPr(null);
    }
  }, [popOutWindow, selectPr]);
  const handleMinimize = useCallback(() => {
    getCurrentWindow()
      .minimize()
      .catch((err) => log.error('minimize failed', err));
  }, []);
  const handleToggleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const isMax = await win.isMaximized();
      if (isMax) await win.unmaximize();
      else await win.maximize();
    } catch (err) {
      log.error('toggle maximize failed', err);
    }
  }, []);
  const firstTab: Tab = initialTab ? TAB_FOR_VIEW[initialTab] : 'Overview';
  const [activeTab, setActiveTab] = useState<Tab>(firstTab);
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(() => new Set(['Overview', firstTab]));

  // A new `initialTab` for the PR on screen (showPr with another tab) switches to it.
  const initialTabRef = useRef(initialTab);
  useEffect(() => {
    if (initialTabRef.current === initialTab) return;
    initialTabRef.current = initialTab;
    if (initialTab) setActiveTab(TAB_FOR_VIEW[initialTab]);
  }, [initialTab]);

  // J / K step through the tabs of the full-screen view.
  const rootRef = useRef<HTMLDivElement>(null);
  const stepTab = (delta: number) => {
    const order = EMBEDDED_TAB_ORDER;
    const next = order[(order.indexOf(activeTab) + delta + order.length) % order.length];
    if (next) setActiveTab(next);
  };
  useDetailViewKeys(
    rootRef,
    {
      j: () => stepTab(1),
      k: () => stepTab(-1),
    },
    embedded,
  );

  // Mount tabs lazily on first activation, keep cached afterwards
  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const handlePopOut = useCallback(() => {
    const owner = pr.pullRequest.repoOwner;
    const repo = pr.pullRequest.repoName;
    const number = pr.pullRequest.number;
    openPrDetail({ owner, repo, number })
      .then(() => selectPr(null))
      .catch(() => {
        // openPrDetail logs the failure; nothing else to do here.
      });
  }, [pr, selectPr]);

  // "Open in window" from the full-screen view: the pop-out takes over, so
  // the view returns to the list.
  const handleOpenInWindow = useCallback(() => {
    const { repoOwner: owner, repoName: repo, number } = pr.pullRequest;
    openPrDetail({ owner, repo, number })
      .then(() => popView())
      .catch(() => {
        // openPrDetail logs the failure; the view stays.
      });
  }, [pr.pullRequest]);

  const handleOpenInBrowser = useCallback(async () => {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(pr.pullRequest.htmlUrl);
    } catch (err) {
      log.error('open-in-browser failed', err);
    }
  }, [pr.pullRequest.htmlUrl]);

  const actions = usePrActions(pr);

  // Cross-tab deep-link bus — switch to Files when a jump target is set.
  const jumpTarget = usePrDetailJumpStore((s) => s.target);
  useEffect(() => {
    if (jumpTarget && activeTab !== 'Files') {
      setActiveTab('Files');
    }
  }, [jumpTarget, activeTab]);

  const p = pr.pullRequest;
  const isMerged = Boolean(p.mergedAt);
  const isTerminal = isMerged || p.state === 'closed';
  const score = computeMergeScore(pr);
  const reviewLabel = reviewStatusLabel(p.reviewStatus);
  const checkTally = passedOfCounted({
    passed: pr.passedCount,
    skipped: pr.skippedCount,
    total: pr.totalCheckCount,
  });

  const tabDefs: TabDef[] = [
    { id: 'Overview', label: 'Overview' },
    { id: 'Commits', label: 'Commits', count: p.commitCount },
    { id: 'Files', label: 'Files', count: p.changedFiles },
    {
      id: 'Checks',
      label: 'Checks',
      count: `${checkTally.passed}/${checkTally.counted}`,
      indicator:
        pr.pendingCheckNames.length > 0 ? (
          <LoaderCircle size={10} strokeWidth={2.4} className="animate-spin" aria-hidden="true" />
        ) : undefined,
    },
    { id: 'Discussion', label: 'Discussion' },
  ];
  const shownTabs = embedded
    ? EMBEDDED_TAB_ORDER.map((id) => tabDefs.find((t) => t.id === id)).filter(
        (t): t is TabDef => t !== undefined,
      )
    : tabDefs;
  const pane = (tab: Tab, extra?: string) =>
    activeTab === tab ? clsx(embedded && 'bd-detail__pane', extra) : 'hidden';

  return (
    <div
      ref={rootRef}
      className={
        embedded
          ? 'bd-detail__panel'
          : 'absolute inset-0 z-10 flex flex-col bg-[var(--color-background)]'
      }
    >
      {/* Pop-out window: unified BorgDock titlebar with logo + controls.
       *  Inline mode skips this — the sidebar already has its own Header. */}
      {popOutWindow && (
        <TitleBar
          data-tauri-drag-region
          onDoubleClick={handleToggleMaximize}
          left={
            <>
              <span className="bd-title-bar__logo">
                <BorgDockLogo />
              </span>
              <span className="bd-title-bar__title">
                PR #{pr.pullRequest.number} — {pr.pullRequest.repoOwner}/{pr.pullRequest.repoName}
              </span>
            </>
          }
          right={
            <>
              <button
                type="button"
                className="bd-wc"
                onClick={handleOpenInBrowser}
                aria-label="Open in browser"
                title="Open in browser"
              >
                <ExternalLink size={13} strokeWidth={2.25} aria-hidden="true" />
              </button>
              <WindowControls
                onMinimize={handleMinimize}
                onMaximize={handleToggleMaximize}
                onClose={handleClose}
              />
            </>
          }
        />
      )}

      {embedded && (
        <PrDetailHeader
          pr={pr}
          actions={actions}
          checks={checks}
          onOpenInWindow={handleOpenInWindow}
        />
      )}

      {/* Header — PR title + meta on the surface card */}
      {!embedded && (
        <div className="relative border-b border-[var(--color-subtle-border)] bg-[var(--color-surface)] px-[22px] pt-[18px] pb-[14px]">
          {/* Inline-mode pop-out button — pop-out window mode hides this */}
          {!popOutWindow && (
            <div className="absolute right-3 top-3">
              <IconButton
                icon={<ExternalLink size={14} strokeWidth={3} aria-hidden="true" />}
                tooltip="Open in new window"
                size={22}
                aria-label="Pop out"
                onClick={handlePopOut}
                data-pr-detail-panel-popout
              />
            </div>
          )}

          <div className="flex items-start gap-3.5">
            {/* Merge readiness gauge */}
            <Ring value={score} size={44} stroke={3} data-pr-header-score={score} />

            <div className="min-w-0 flex-1">
              {/* Status pills row */}
              <div className="flex flex-wrap items-center gap-2 pr-20">
                <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                  #{p.number}
                </span>
                {isMerged && <Pill tone="merged">Merged</Pill>}
                {!isMerged && p.state === 'closed' && <Pill tone="neutral">Closed</Pill>}
                {!isTerminal && p.mergeable === true && <Pill tone="success">Mergeable</Pill>}
                {!isTerminal && p.mergeable === false && <Pill tone="error">Conflicts</Pill>}
                {!isTerminal && checkTally.counted > 0 && (
                  <Pill tone="success">{checkTally.passed} passed</Pill>
                )}
                {!isTerminal && pr.pendingCheckNames.length > 0 && (
                  <Pill
                    tone="warning"
                    icon={
                      <LoaderCircle
                        size={10}
                        strokeWidth={2.4}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    }
                  >
                    {pr.pendingCheckNames.length} running
                  </Pill>
                )}
                {p.isDraft && <Pill tone="draft">Draft</Pill>}
                {!isTerminal && reviewLabel && <Pill tone="neutral">{reviewLabel}</Pill>}
              </div>

              {/* Title */}
              <h2 className="mt-1 text-[16px] font-semibold leading-[1.3] tracking-[-0.01em] text-[var(--color-text-primary)]">
                {p.title}
              </h2>

              {/* Author + date + branches */}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-[var(--color-text-tertiary)]">
                <Avatar initials={initialsFor(p.authorLogin)} size="sm" />
                <span className="font-medium text-[var(--color-text-secondary)]">
                  {p.authorLogin}
                </span>
                <span aria-hidden>·</span>
                <span>{formatDate(p.createdAt)}</span>
                <span aria-hidden>·</span>
                <span title="Age" className="text-[var(--color-text-muted)]">
                  {formatAge(p.createdAt)} old
                </span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <GitBranch size={12} strokeWidth={2.25} aria-hidden="true" />
                  <span className="font-mono text-[11px]">{p.headRef}</span>
                  <ArrowRight size={12} strokeWidth={2.25} aria-hidden="true" />
                  <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                    {p.baseRef}
                  </span>
                </span>
              </div>

              {/* Stats + close X */}
              <div className="mt-2.5 flex items-center gap-2.5 text-[11px] text-[var(--color-text-tertiary)]">
                <span className="font-medium text-[var(--color-status-green)]">+{p.additions}</span>
                <span className="font-medium text-[var(--color-status-red)]">−{p.deletions}</span>
                <span aria-hidden className="text-[var(--color-text-faint)]">
                  ·
                </span>
                <span>
                  {p.changedFiles} file{p.changedFiles !== 1 ? 's' : ''}
                </span>
                <span aria-hidden className="text-[var(--color-text-faint)]">
                  ·
                </span>
                <span>
                  {p.commitCount} commit{p.commitCount !== 1 ? 's' : ''}
                </span>
                <span aria-hidden className="text-[var(--color-text-faint)]">
                  ·
                </span>
                <span>
                  {p.commentCount} comment{p.commentCount !== 1 ? 's' : ''}
                </span>
                {!popOutWindow && (
                  <IconButton
                    icon={<X size={14} strokeWidth={3} aria-hidden="true" />}
                    tooltip="Close"
                    size={22}
                    aria-label="Close"
                    className="ml-auto"
                    onClick={handleClose}
                    data-pr-detail-panel-close
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action bar — sticky, all PR actions */}
      {!embedded && (
        <ActionBar
          onReview={() => useQuickReviewStore.getState().startSinglePr(pr)}
          actions={actions}
          prState={p.state}
          isDraft={p.isDraft}
          mergeable={p.mergeable}
        />
      )}

      {/* Activity strip — persistent checks summary, click-to-jump */}
      {!embedded && pr.totalCheckCount > 0 && (
        <div className="border-b border-[var(--color-subtle-border)] bg-[var(--color-surface)] px-[22px] py-2.5">
          <ActivityStrip
            passed={pr.passedCount}
            running={pr.pendingCheckNames.length}
            failing={pr.failedCheckNames.length}
            total={checkTally.counted}
            onJumpToChecks={() => setActiveTab('Checks')}
          />
        </div>
      )}

      {/* Tab bar — sits on the same surface card as the header */}
      <div
        className={
          embedded
            ? 'bd-detail__tabs'
            : 'bg-[var(--color-surface)] border-b border-[var(--color-subtle-border)] px-[22px]'
        }
      >
        <Tabs
          value={activeTab}
          onChange={(id) => setActiveTab(id as Tab)}
          tabs={shownTabs}
          sliding={embedded}
          aria-keyshortcuts={embedded ? 'J K' : undefined}
        />
      </div>

      {/* Tab content — tabs mount lazily on first activation, cached afterwards.
       *  In the full-screen view a pane fades in each time it is shown. */}
      <div
        className={
          embedded
            ? 'bd-detail__content'
            : 'flex-1 overflow-y-auto flex flex-col min-h-0 bg-[var(--color-background)]'
        }
      >
        <div className={pane('Overview', embedded ? 'bd-detail__pane--inset' : undefined)}>
          <OverviewTab pr={pr} />
        </div>
        {mountedTabs.has('Commits') && (
          <div className={pane('Commits')}>
            <CommitsTab
              prNumber={pr.pullRequest.number}
              repoOwner={pr.pullRequest.repoOwner}
              repoName={pr.pullRequest.repoName}
              prUpdatedAt={pr.pullRequest.updatedAt}
            />
          </div>
        )}
        {mountedTabs.has('Files') && (
          <div className={pane('Files', 'flex-1 flex flex-col min-h-0')}>
            <FilesTab
              prNumber={pr.pullRequest.number}
              repoOwner={pr.pullRequest.repoOwner}
              repoName={pr.pullRequest.repoName}
              htmlUrl={pr.pullRequest.htmlUrl}
              prUpdatedAt={pr.pullRequest.updatedAt}
            />
          </div>
        )}
        {mountedTabs.has('Checks') && (
          <div className={pane('Checks')}>
            <ChecksTab checks={checks} pr={pr} grouped={embedded} />
          </div>
        )}
        {mountedTabs.has('Discussion') && (
          <div className={pane('Discussion')}>
            <DiscussionTab
              prNumber={pr.pullRequest.number}
              repoOwner={pr.pullRequest.repoOwner}
              repoName={pr.pullRequest.repoName}
              prUpdatedAt={pr.pullRequest.updatedAt}
              onJumpToFile={(target) => {
                usePrDetailJumpStore.getState().setJumpTarget({ ...target, ts: Date.now() });
                setActiveTab('Files');
              }}
            />
          </div>
        )}
      </div>

      {actions.checkoutOpen && (
        <CheckoutPanel
          branchName={p.headRef}
          repoBasePath={actions.repoPath}
          worktreeSubfolder={actions.worktreeSubfolder}
          favoritePaths={actions.favoritePaths}
          favoritesOnlyDefault={actions.favoritesOnlyDefault}
          windowsTerminalProfile={actions.windowsTerminalProfile}
          onDismiss={() => actions.setCheckoutOpen(false)}
          onOpenInT3={(worktreePath) => {
            openT3Thread(p, worktreePath).catch((err) =>
              log.error('openT3Thread failed', err, { worktreePath }),
            );
          }}
        />
      )}

      <ConfirmDialog
        isOpen={actions.confirmClose}
        title="Close pull request?"
        message={`This will close PR #${p.number} without merging. You can reopen it later.`}
        confirmLabel="Close PR"
        variant="danger"
        onConfirm={actions.onCloseExecute}
        onCancel={() => actions.setConfirmClose(false)}
      />

      <ConfirmDialog
        isOpen={actions.confirmBypass}
        title="Bypass merge protections?"
        message={`This will merge PR #${p.number} bypassing branch protection rules. This action cannot be undone.`}
        confirmLabel="Bypass Merge"
        variant="danger"
        onConfirm={actions.onBypassExecute}
        onCancel={() => actions.setConfirmBypass(false)}
      />

      {popOutWindow && <QuickReviewOverlay />}

      {actions.actionStatus && (
        <div
          data-action-status
          className="absolute bottom-4 right-4 rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] px-3 py-2 text-xs text-[var(--color-text-secondary)] shadow-md"
        >
          {actions.actionStatus.includes('...') && (
            <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {actions.actionStatus}
        </div>
      )}
    </div>
  );
}
