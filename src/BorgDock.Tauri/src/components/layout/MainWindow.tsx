import clsx from 'clsx';
import { invoke } from '@tauri-apps/api/core';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { RefreshIcon } from '@/components/shared/icons';
import { Pill, Tabs, TitleBar, WindowControls } from '@/components/shared/primitives';
import type { TabDef } from '@/components/shared/primitives';
import { useStatusBar } from '@/hooks/useStatusBar';
import { usePrStore } from '@/stores/pr-store';
import { type ActiveSection, useUiStore } from '@/stores/ui-store';
import { StatusBar } from './StatusBar';

const SECTIONS: { id: ActiveSection; label: string }[] = [
  { id: 'focus', label: 'Focus' },
  { id: 'prs', label: 'PRs' },
  { id: 'workitems', label: 'Work Items' },
];

const STORAGE_KEY = 'mainWindow.activeSection';

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

interface MainWindowProps {
  children: ReactNode;
}

/**
 * MainWindow — top-level shell for the main BorgDock window.
 * Title bar holds: logo + title + open-count pill (left), section tabs
 * (middle), status dot + Refresh + Settings + WindowControls (right).
 * The body slot renders the active section; StatusBar pulls per-section
 * copy from useStatusBar(activeSection).
 */
export function MainWindow({ children }: MainWindowProps) {
  const activeSection = useUiStore((s) => s.activeSection);
  const setActiveSection = useUiStore((s) => s.setActiveSection);
  const pullRequests = usePrStore((s) => s.pullRequests);
  const counts = usePrStore((s) => s.counts)();
  const focusCount = usePrStore((s) => s.focusCount)();
  const hasFailing = counts.failing > 0;
  const sb = useStatusBar(activeSection);

  // Persist active section across launches
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, activeSection);
    } catch {
      // localStorage may be unavailable (e.g. private mode) — ignore
    }
  }, [activeSection]);

  return (
    <div className="bd-mainwindow">
      <TitleBar
        left={
          <span className="bd-mainwindow__left">
            <Logo />
            <span className="bd-title-bar__title">BorgDock</span>
            <Pill tone="neutral">{pullRequests.length} open</Pill>
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
          />
        }
        right={
          <span className="bd-mainwindow__right">
            <span
              className={clsx('bd-status-dot', hasFailing && 'bd-status-dot--red')}
              aria-hidden
            />
            <button
              type="button"
              className="bd-icon-btn"
              aria-label="Refresh"
              onClick={dispatchRefresh}
            >
              <RefreshIcon />
            </button>
            <button
              type="button"
              className="bd-icon-btn"
              aria-label="Settings"
              onClick={openSettings}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <circle cx="8" cy="8" r="2.5" />
                <path d="M13.5 8a5.5 5.5 0 0 0-.1-1.1l1.5-1.2-1-1.7-1.8.5a5.5 5.5 0 0 0-1-.6L10.7 2H8.7l-.4 1.9a5.5 5.5 0 0 0-1 .6l-1.8-.5-1 1.7 1.5 1.2a5.5 5.5 0 0 0 0 2.2l-1.5 1.2 1 1.7 1.8-.5a5.5 5.5 0 0 0 1 .6L9.3 14h2l.4-1.9a5.5 5.5 0 0 0 1-.6l1.8.5 1-1.7-1.5-1.2a5.5 5.5 0 0 0 .1-1.1z" />
              </svg>
            </button>
            <WindowControls />
          </span>
        }
      />
      <main className="bd-mainwindow__body">{children}</main>
      <StatusBar left={sb.left} right={sb.right} />
    </div>
  );
}
