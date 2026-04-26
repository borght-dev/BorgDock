import { getCurrentWindow } from '@tauri-apps/api/window';
import clsx from 'clsx';
import { useCallback, useEffect } from 'react';
import { FeatureBadge } from '@/components/onboarding';
import { Tabs } from '@/components/shared/primitives';
import type { TabDef } from '@/components/shared/primitives';
import { usePrStore } from '@/stores/pr-store';
import { type ActiveSection, useUiStore } from '@/stores/ui-store';

function handleHeaderDragStart(e: React.MouseEvent) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
  e.preventDefault();
  const setDragging = useUiStore.getState().setDragging;
  setDragging(true);
  const win = getCurrentWindow();
  win.startDragging().finally(() => setDragging(false));
}

function dispatchRefresh() {
  document.dispatchEvent(new CustomEvent('borgdock-refresh'));
}

const sections: { key: ActiveSection; label: string }[] = [
  { key: 'focus', label: 'Focus' },
  { key: 'prs', label: 'PRs' },
  { key: 'workitems', label: 'Work Items' },
];

export function Header() {
  const activeSection = useUiStore((s) => s.activeSection);
  const setActiveSection = useUiStore((s) => s.setActiveSection);

  // Dev/test-only deep-link: ?section=focus|prs|work-items dispatches the
  // existing section-store action on mount so visual.spec.ts can land on
  // the right surface without simulating a click. Production navigation
  // is unaffected — neither import.meta.env.DEV nor __PLAYWRIGHT__ is true
  // in shipped builds.
  useEffect(() => {
    const isTest =
      import.meta.env.DEV ||
      (typeof window !== 'undefined' &&
        (window as { __PLAYWRIGHT__?: boolean }).__PLAYWRIGHT__ === true);
    if (!isTest) return;
    const param = new URLSearchParams(window.location.search).get('section');
    if (!param) return;
    const map: Record<string, ActiveSection> = {
      focus: 'focus',
      prs: 'prs',
      'work-items': 'workitems',
    };
    const target = map[param];
    if (target) setActiveSection(target);
    // Run once on mount; subsequent in-app navigation is user-driven.
  }, [setActiveSection]);

  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const isPolling = usePrStore((s) => s.isPolling);
  const getCounts = usePrStore((s) => s.counts);
  const pullRequests = usePrStore((s) => s.pullRequests);
  const closedPullRequests = usePrStore((s) => s.closedPullRequests);
  const username = usePrStore((s) => s.username);
  void closedPullRequests;
  void username;

  const counts = getCounts();
  const focusCount = usePrStore((s) => s.focusCount)();
  const hasFailing = counts.failing > 0;

  const handleMinimize = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // Hide explicitly rather than via toggle_sidebar — the toggle path used
      // to rely on win.is_visible(), which is unreliable for transparent
      // always-on-top WebView2 windows on Windows.
      useUiStore.getState().setSidebarVisible(false);
      await invoke('hide_sidebar');
    } catch (err) {
      console.error('Failed to minimize:', err);
    }
  }, []);

  return (
    <header onMouseDown={handleHeaderDragStart} className="sidebar-header">
      {/* Left: Logo + open count */}
      <div className="sidebar-header-left">
        {/* App icon — purple gradient tile with white pulse line */}
        <svg className="sidebar-logo" width="22" height="22" viewBox="0 0 16 16" fill="none">
          <defs>
            <linearGradient id="hdr-tile" x1="0" y1="0" x2="16" y2="16">
              <stop offset="0%" stopColor="var(--color-logo-gradient-start)" />
              <stop offset="100%" stopColor="var(--color-logo-gradient-end)" />
            </linearGradient>
          </defs>
          <rect width="16" height="16" rx="4.5" fill="url(#hdr-tile)" />
          <path
            d="M2 9 L4 9 L5.5 5 L7.5 12 L9 3 L11 11 L12.5 7 L14 9"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="14" cy="9" r="1.3" fill="white" opacity="0.85" />
        </svg>
        <span className="sidebar-title">BorgDock</span>
        {/* Open count badge */}
        <span className="sidebar-open-badge">{pullRequests.length} open</span>
      </div>

      {/* Center: Section switcher */}
      <div className="sidebar-section-switcher relative">
        <Tabs
          value={activeSection}
          onChange={(id) => setActiveSection(id as ActiveSection)}
          tabs={sections.map<TabDef>((s) => ({
            id: s.key,
            label: s.label,
            count: s.key === 'focus' && focusCount > 0 ? focusCount : undefined,
          }))}
          dense
        />
        <span className="absolute -right-1 -top-1">
          <FeatureBadge badgeId="focus-mode" />
        </span>
      </div>

      {/* Right: Status dot + actions */}
      <div className="sidebar-header-right">
        {/* Status dot with glow */}
        <div
          className={clsx(
            'sidebar-status-dot',
            hasFailing ? 'sidebar-status-dot--red' : 'sidebar-status-dot--green',
          )}
        >
          <span className="sidebar-status-dot-glow" />
          <span className="sidebar-status-dot-core" />
        </div>

        {/* Polling spinner */}
        {isPolling && <span className="sidebar-poll-spinner" />}

        <button
          onClick={dispatchRefresh}
          className="sidebar-icon-btn"
          aria-label="Refresh"
          title="Poll now"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 4v4h4" />
            <path d="M15 12V8h-4" />
            <path d="M2.5 10.5A6 6 0 0 0 14 8" />
            <path d="M13.5 5.5A6 6 0 0 0 2 8" />
          </svg>
        </button>
        <button
          onClick={handleMinimize}
          className="sidebar-icon-btn"
          aria-label="Minimize to badge"
          title="Minimize to badge"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M4 8h8" />
          </svg>
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="sidebar-icon-btn"
          aria-label="Settings"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="2.5" />
            <path d="M13.5 8a5.5 5.5 0 0 0-.1-1.1l1.5-1.2-1-1.7-1.8.5a5.5 5.5 0 0 0-1-.6L10.7 2H8.7l-.4 1.9a5.5 5.5 0 0 0-1 .6l-1.8-.5-1 1.7 1.5 1.2a5.5 5.5 0 0 0 0 2.2l-1.5 1.2 1 1.7 1.8-.5a5.5 5.5 0 0 0 1 .6L9.3 14h2l.4-1.9a5.5 5.5 0 0 0 1-.6l1.8.5 1-1.7-1.5-1.2a5.5 5.5 0 0 0 .1-1.1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
