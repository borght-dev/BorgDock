import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { RefreshIcon, SettingsIcon } from '@/components/shared/icons';
import { TitleBar, WindowControls } from '@/components/shared/primitives';
import { WindowLauncher } from '@/components/shared/WindowLauncher';
import { useStatusBar } from '@/hooks/useStatusBar';
import { usePrStore } from '@/stores/pr-store';
import { type ActiveSection, type MainView, selectTopView, useUiStore } from '@/stores/ui-store';
import { Rail, SECTION_LABELS } from './Rail';
import { StatusBar } from './StatusBar';

function dispatchRefresh() {
  document.dispatchEvent(new CustomEvent('borgdock-refresh'));
}

function openSettings() {
  void invoke('open_settings_window', {}).catch((e) =>
    console.error('open_settings_window failed', e),
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

/** The title bar's title: the section, or the kind of detail view. */
function viewTitle(top: MainView, section: ActiveSection): string {
  if (top.kind === 'pr-detail') return 'Pull request';
  if (top.kind === 'work-item-detail') return 'Work item';
  return SECTION_LABELS[section];
}

interface MainWindowProps {
  children: ReactNode;
}

/**
 * MainWindow — top-level shell for the main BorgDock window: a grid of
 * `rail | main`. The Rail carries the logo, the sections and the sync state;
 * the main column has a title bar (the section or the kind of detail view on
 * top, then status dot, launcher, Refresh, Settings and the window controls),
 * the body and the status bar.
 *
 * The body slot renders the ViewStack; StatusBar pulls per-view copy from
 * useStatusBar(activeSection).
 */
export function MainWindow({ children }: MainWindowProps) {
  const activeSection = useUiStore((s) => s.activeSection);
  const topView = useUiStore(selectTopView);
  const hasFailing = usePrStore((s) => s.counts().failing > 0);
  const sb = useStatusBar(activeSection);

  // Active-section persistence is handled inside useUiStore.setActiveSection
  // via persistToTauriStore (read back on mount by restorePersistedSection).

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
