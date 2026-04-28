import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useState } from 'react';
import { createLogger } from '@/services/logger';
import { WindowControls } from '@/components/shared/chrome';
import { Avatar, IconButton, Pill, Ring, Tabs } from '@/components/shared/primitives';
import type { TabDef } from '@/components/shared/primitives';
import { computeMergeScore } from '@/services/merge-score';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { ChecksTab } from './ChecksTab';
import { CommentsTab } from './CommentsTab';
import { CommitsTab } from './CommitsTab';
import { FilesTab } from './FilesTab';
import { OverviewTab } from './OverviewTab';
import { ReviewsTab } from './ReviewsTab';

const log = createLogger('PRDetailPanel');

const XIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="m4 4 8 8M12 4 4 12" />
  </svg>
);

const PopOutIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M9 2h5v5" />
    <path d="m14 2-7 7" />
    <path d="M4 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
  </svg>
);

const BranchIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="4" cy="3.5" r="1.5" />
    <circle cx="4" cy="12.5" r="1.5" />
    <circle cx="12" cy="6.5" r="1.5" />
    <path d="M4 5v6" />
    <path d="M12 8c0 2-2 3-4 3s-4-.5-4-2" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 8h10" />
    <path d="m9 4 4 4-4 4" />
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

function reviewStatusLabel(status: PullRequestWithChecks['pullRequest']['reviewStatus']): string | null {
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

const tabs = ['Overview', 'Commits', 'Files', 'Checks', 'Reviews', 'Comments'] as const;
type Tab = (typeof tabs)[number];

interface PRDetailPanelProps {
  pr: PullRequestWithChecks;
  /** Pop-out mode: the panel is hosting the entire PR detail window.
   *  Makes the header the window drag region, hides the pop-out button,
   *  shows native-style min/max/close controls, and routes the × button
   *  to close the window instead of clearing the sidebar selection. */
  popOutWindow?: boolean;
}

export function PRDetailPanel({ pr, popOutWindow }: PRDetailPanelProps) {
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
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(() => new Set(['Overview']));

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
    log.info('pop-out clicked', { owner, repo, number });
    invoke('open_pr_detail_window', { owner, repo, number })
      .then(() => {
        log.info('pop-out invoke succeeded', { owner, repo, number });
        selectPr(null);
      })
      .catch((err) => log.error('pop-out invoke failed', err, { owner, repo, number }));
  }, [pr, selectPr]);

  const p = pr.pullRequest;
  const score = computeMergeScore(pr);
  const reviewLabel = reviewStatusLabel(p.reviewStatus);
  const passedCount = pr.passedCount;
  const totalChecks = pr.checks.length - pr.skippedCount;

  const tabDefs: TabDef[] = [
    { id: 'Overview', label: 'Overview' },
    { id: 'Commits', label: 'Commits', count: p.commitCount },
    { id: 'Files', label: 'Files', count: p.changedFiles },
    { id: 'Checks', label: 'Checks', count: pr.checks.length },
    { id: 'Reviews', label: 'Reviews' },
    { id: 'Comments', label: 'Comments' },
  ];

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[var(--color-background)]">
      {/* Header — doubles as the window drag region when in pop-out mode */}
      <div
        className="relative border-b border-[var(--color-separator)] px-6 pt-4 pb-3"
        {...(popOutWindow ? { 'data-tauri-drag-region': true } : {})}
      >
        {/* Top-right corner: window controls (pop-out mode) or pop-out button (inline) */}
        <div className="absolute right-3 top-3 flex items-center gap-1">
          {!popOutWindow && (
            <IconButton
              icon={<PopOutIcon />}
              tooltip="Open in new window"
              size={22}
              aria-label="Pop out"
              onClick={handlePopOut}
              data-pr-detail-panel-popout
            />
          )}
          {popOutWindow && (
            <WindowControls
              onMinimize={handleMinimize}
              onMaximize={handleToggleMaximize}
              onClose={handleClose}
            />
          )}
        </div>

        <div
          className="flex items-start gap-4"
          {...(popOutWindow ? { 'data-tauri-drag-region': true } : {})}
        >
          {/* Merge readiness gauge */}
          <Ring
            value={score}
            size={60}
            stroke={4}
            className="mt-1 [&_.bd-ring__label]:text-[16px]"
            data-pr-header-score={score}
          />

          <div
            className="min-w-0 flex-1"
            {...(popOutWindow ? { 'data-tauri-drag-region': true } : {})}
          >
            {/* Status pills row */}
            <div className="flex flex-wrap items-center gap-2 pr-20">
              <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
                #{p.number}
              </span>
              {p.mergeable === true && <Pill tone="success">Mergeable</Pill>}
              {p.mergeable === false && <Pill tone="error">Conflicts</Pill>}
              {totalChecks > 0 && (
                <Pill tone="success">
                  {passedCount} passed
                </Pill>
              )}
              {p.isDraft && <Pill tone="draft">Draft</Pill>}
              {reviewLabel && <Pill tone="neutral">{reviewLabel}</Pill>}
            </div>

            {/* Title */}
            <h2 className="mt-2 text-base font-semibold leading-snug text-[var(--color-text-primary)]">
              {p.title}
            </h2>

            {/* Author + date + branches */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-[var(--color-text-tertiary)]">
              <Avatar initials={initialsFor(p.authorLogin)} size="sm" />
              <span>{p.authorLogin}</span>
              <span aria-hidden>·</span>
              <span>{formatDate(p.createdAt)}</span>
              <span aria-hidden>·</span>
              <span title="Age">{formatAge(p.createdAt)} old</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <BranchIcon />
                <span className="font-mono text-[11px]">{p.headRef}</span>
                <ArrowRightIcon />
                <span className="font-mono text-[11px]">{p.baseRef}</span>
              </span>
            </div>

            {/* Stats + close X */}
            <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
              <span className="font-medium text-[var(--color-status-green)]">+{p.additions}</span>
              <span className="font-medium text-[var(--color-status-red)]">−{p.deletions}</span>
              <span aria-hidden>·</span>
              <span>
                {p.changedFiles} file{p.changedFiles !== 1 ? 's' : ''}
              </span>
              <span aria-hidden>·</span>
              <span>
                {p.commitCount} commit{p.commitCount !== 1 ? 's' : ''}
              </span>
              <span aria-hidden>·</span>
              <span>
                {p.commentCount} comment{p.commentCount !== 1 ? 's' : ''}
              </span>
              {!popOutWindow && (
                <IconButton
                  icon={<XIcon />}
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

      {/* Tab bar */}
      <Tabs
        value={activeTab}
        onChange={(id) => setActiveTab(id as Tab)}
        tabs={tabDefs}
        className="px-6"
      />

      {/* Tab content — tabs mount lazily on first activation, cached afterwards */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        <div className={activeTab === 'Overview' ? '' : 'hidden'}>
          <OverviewTab pr={pr} />
        </div>
        {mountedTabs.has('Commits') && (
          <div className={activeTab === 'Commits' ? '' : 'hidden'}>
            <CommitsTab
              prNumber={pr.pullRequest.number}
              repoOwner={pr.pullRequest.repoOwner}
              repoName={pr.pullRequest.repoName}
              prUpdatedAt={pr.pullRequest.updatedAt}
            />
          </div>
        )}
        {mountedTabs.has('Files') && (
          <div className={activeTab === 'Files' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
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
          <div className={activeTab === 'Checks' ? '' : 'hidden'}>
            <ChecksTab checks={pr.checks} pr={pr} />
          </div>
        )}
        {mountedTabs.has('Reviews') && (
          <div className={activeTab === 'Reviews' ? '' : 'hidden'}>
            <ReviewsTab
              prNumber={pr.pullRequest.number}
              repoOwner={pr.pullRequest.repoOwner}
              repoName={pr.pullRequest.repoName}
              prUpdatedAt={pr.pullRequest.updatedAt}
            />
          </div>
        )}
        {mountedTabs.has('Comments') && (
          <div className={activeTab === 'Comments' ? '' : 'hidden'}>
            <CommentsTab
              prNumber={pr.pullRequest.number}
              repoOwner={pr.pullRequest.repoOwner}
              repoName={pr.pullRequest.repoName}
              prUpdatedAt={pr.pullRequest.updatedAt}
            />
          </div>
        )}
      </div>
    </div>
  );
}
