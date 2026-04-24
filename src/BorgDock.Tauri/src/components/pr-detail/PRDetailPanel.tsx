import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@/services/logger';
import { WindowControls } from '@/components/shared/chrome';
import { useUiStore } from '@/stores/ui-store';
import type { PullRequestWithChecks } from '@/types';
import { ChecksTab } from './ChecksTab';
import { CommentsTab } from './CommentsTab';
import { CommitsTab } from './CommitsTab';
import { FilesTab } from './FilesTab';
import { OverviewTab } from './OverviewTab';
import { ReviewsTab } from './ReviewsTab';

const log = createLogger('PRDetailPanel');

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
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

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

  useEffect(() => {
    const idx = tabs.indexOf(activeTab);
    const el = tabsRef.current[idx];
    if (el) {
      setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeTab]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[var(--color-background)]">
      {/* Header — doubles as the window drag region when in pop-out mode */}
      <div
        className="flex items-start gap-2 border-b border-[var(--color-separator)] px-3 py-2.5"
        {...(popOutWindow ? { 'data-tauri-drag-region': true } : {})}
      >
        {!popOutWindow && (
          <button
            onClick={handleClose}
            className="tactile-icon-btn mt-0.5 rounded-md p-1 text-[var(--color-icon-btn-fg)] hover:bg-[var(--color-icon-btn-hover)]"
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m4 4 8 8M12 4 4 12" />
            </svg>
          </button>
        )}
        <div
          className="min-w-0 flex-1"
          {...(popOutWindow ? { 'data-tauri-drag-region': true } : {})}
        >
          <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {pr.pullRequest.title}
          </h2>
          <span className="text-xs text-[var(--color-text-muted)]">#{pr.pullRequest.number}</span>
        </div>
        {!popOutWindow && (
          <button
            onClick={handlePopOut}
            className="tactile-icon-btn mt-0.5 rounded-md p-1 text-[var(--color-icon-btn-fg)] hover:bg-[var(--color-icon-btn-hover)]"
            aria-label="Pop out"
            title="Open in new window"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M9 2h5v5" />
              <path d="m14 2-7 7" />
              <path d="M4 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
            </svg>
          </button>
        )}
        {popOutWindow && (
          <WindowControls
            onMinimize={handleMinimize}
            onMaximize={handleToggleMaximize}
            onClose={handleClose}
            className="-my-1 -mr-1"
          />
        )}
      </div>

      {/* Tab bar */}
      <div className="relative border-b border-[var(--color-separator)]">
        <div className="flex px-3">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              ref={(el) => {
                tabsRef.current[i] = el;
              }}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'px-3 py-2 text-xs font-medium transition-colors',
                activeTab === tab
                  ? 'text-[var(--color-tab-active)]'
                  : 'text-[var(--color-tab-inactive)] hover:text-[var(--color-text-secondary)]',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        {/* Animated underline */}
        <div
          className="absolute bottom-0 h-0.5 bg-[var(--color-tab-active)] transition-all duration-200"
          style={{ left: underline.left, width: underline.width }}
        />
      </div>

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
