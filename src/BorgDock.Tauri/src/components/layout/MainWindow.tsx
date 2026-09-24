import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';
import { type ReactNode, useEffect } from 'react';
import { RefreshIcon, SettingsIcon } from '@/components/shared/icons';
import type { TabDef } from '@/components/shared/primitives';
import { Pill, Tabs, TitleBar, WindowControls } from '@/components/shared/primitives';
import { WindowLauncher } from '@/components/shared/WindowLauncher';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useVisibleSection } from '@/hooks/useVisibleSection';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { type ActiveSection, type MainView, selectTopView, useUiStore } from '@/stores/ui-store';
import { Rail, SECTION_LABELS } from './Rail';
import { StatusBar } from './StatusBar';

/** The tab layout's sections (the rail layout adds Worktrees). */
const SECTIONS: { id: ActiveSection; label: string }[] = [
  { id: 'focus', label: 'Focus' },
  { id: 'prs', label: 'PRs' },
  { id: 'workitems', label: 'Work Items' },
];

function dispatchRefresh() {
  document.dispatchEvent(new CustomEvent('borgdock-refresh'));
}

function openSettings() {
  void invoke('open_settings_window', {}).catch((e) =>
    console.error('open_settings_window failed', e),
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <defs>
        <linearGradient id="mw-logo" x1="0" y1="0" x2="16" y2="16">
          <stop offset="0%" stopColor="var(--color-logo-gradient-start)" />
          <stop offset="100%" stopColor="var(--color-logo-gradient-end)" />
        </linearGradient>
      </defs>
      <rect width="16" height="16" rx="4.5" fill="url(#mw-logo)" />
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
}

function TitleBarActions({ hasFailing }: { hasFailing: boolean }) {
  return (
    <span className="bd-mainwindow__right" data-tauri-drag-region="false">
      <span className={clsx('bd-status-dot', hasFailing && 'bd-status-dot--red')} aria-hidden />
      <WindowLauncher />
      <button
        type="button"
        className="bd-icon-btn"
        aria-label="Refresh"
        onClick={dispatchRefresh}
        data-tauri-drag-region="false"
      >
        <RefreshIcon />
      </button>
      <button
        type="button"
        className="bd-icon-btn"
        aria-label="Settings"
        onClick={openSettings}
        data-tauri-drag-region="false"
      >
        <SettingsIcon />
      </button>
      <WindowControls />
    </span>
  );
}

/** Title for the rail layout's title bar: the section, or the kind of detail view. */
function viewTitle(top: MainView, section: ActiveSection): string {
  if (top.kind === 'pr-detail') return 'Pull request';
  if (top.kind === 'work-item-detail') return 'Work item';
  return SECTION_LABELS[section];
}

interface MainWindowProps {
  children: ReactNode;
}

/**
 * MainWindow — top-level shell for the main BorgDock window.
 *
 * Two layouts, switched by `settings.ui.layoutV3`:
 * - off (today's): the title bar holds logo + title + open-count pill (left),
 *   the section tabs (middle), and status dot + launcher + Refresh +
 *   Settings + window controls (right); body and status bar below.
 * - on (Workbench): a grid of `rail | main`. The Rail carries the logo, the
 *   sections and the sync state; the main column has a title bar without
 *   tabs, the body and the status bar.
 *
 * The body slot renders the ViewStack; StatusBar pulls per-view copy from
 * useStatusBar(activeSection).
 */
export function MainWindow({ children }: MainWindowProps) {
  const layoutV3 = useSettingsStore((s) => s.settings.ui.layoutV3 ?? false);
  const storedSection = useUiStore((s) => s.activeSection);
  // What this layout shows; the tab layout maps Worktrees to Focus during
  // render so a restored Worktrees section never flashes.
  const activeSection = useVisibleSection();
  const setActiveSection = useUiStore((s) => s.setActiveSection);
  const topView = useUiStore(selectTopView);
  const openCount = usePrStore((s) => s.pullRequests.length);
  const hasFailing = usePrStore((s) => s.counts().failing > 0);
  const focusCount = usePrStore((s) => s.focusCount());
  const sb = useStatusBar(activeSection);

  // Active-section persistence is handled inside useUiStore.setActiveSection
  // via persistToTauriStore (read back on mount by restorePersistedSection).

  // Keep the store in step with what the tab layout shows, so keys that read
  // `activeSection` (R for Quick Review in Focus) match the screen. Not
  // persisted, so the saved Worktrees choice survives for the rail layout.
  useEffect(() => {
    if (storedSection !== activeSection) useUiStore.setState({ activeSection });
  }, [storedSection, activeSection]);

  if (layoutV3) {
    return (
      <div className="bd-mainwindow bd-mainwindow--rail">
        <Rail />
        <div className="bd-mainwindow__main">
          <TitleBar
            data-tauri-drag-region
            left={
              <span className="bd-mainwindow__left" data-tauri-drag-region>
                <span className="bd-title-bar__title">{viewTitle(topView, activeSection)}</span>
              </span>
            }
            right={<TitleBarActions hasFailing={hasFailing} />}
          />
          <main className="bd-mainwindow__body">{children}</main>
          <StatusBar left={sb.left} right={sb.right} />
        </div>
      </div>
    );
  }

  return (
    <div className="bd-mainwindow">
      <TitleBar
        data-tauri-drag-region
        left={
          <span className="bd-mainwindow__left" data-tauri-drag-region>
            <Logo />
            <span className="bd-title-bar__title">BorgDock</span>
            <Pill tone="neutral">{openCount} open</Pill>
          </span>
        }
        middle={
          <Tabs
            value={activeSection}
            onChange={(id) => setActiveSection(id as ActiveSection)}
            tabs={SECTIONS.map<TabDef>((s) => ({
              id: s.id,
              label: s.label,
              count: s.id === 'focus' && focusCount > 0 ? focusCount : undefined,
            }))}
            dense
            data-tauri-drag-region="false"
          />
        }
        right={<TitleBarActions hasFailing={hasFailing} />}
      />
      <main className="bd-mainwindow__body">{children}</main>
      <StatusBar left={sb.left} right={sb.right} />
    </div>
  );
}
