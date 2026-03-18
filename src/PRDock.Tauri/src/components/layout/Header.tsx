import { useCallback } from 'react';
import clsx from 'clsx';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useUiStore, type ActiveSection } from '@/stores/ui-store';

function handleHeaderDragStart(e: React.MouseEvent) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
  e.preventDefault();
  const setDragging = useUiStore.getState().setDragging;
  setDragging(true);
  const win = getCurrentWindow();
  win.startDragging().finally(() => setDragging(false));
}

function dispatchRefresh() {
  document.dispatchEvent(new CustomEvent('prdock-refresh'));
}

const sections: { key: ActiveSection; label: string }[] = [
  { key: 'prs', label: 'PRs' },
  { key: 'workitems', label: 'Work Items' },
];

export function Header() {
  const activeSection = useUiStore((s) => s.activeSection);
  const setActiveSection = useUiStore((s) => s.setActiveSection);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const handleMinimize = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // Hide sidebar, show badge — badge will request its own data via badge-request-data event
      await invoke('toggle_sidebar');
      await invoke('show_badge', { count: 0 });
    } catch (err) {
      console.error('Failed to minimize:', err);
    }
  }, []);

  return (
    <header
      onMouseDown={handleHeaderDragStart}
      className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-separator)] cursor-grab active:cursor-grabbing"
    >
      {/* Logo */}
      <span
        className="text-sm font-bold bg-clip-text text-transparent select-none"
        style={{
          backgroundImage:
            'linear-gradient(135deg, var(--color-logo-gradient-start), var(--color-logo-gradient-end))',
        }}
      >
        PRDock
      </span>

      {/* Section switcher */}
      <div className="flex gap-0.5 rounded-md bg-[var(--color-surface-raised)] p-0.5">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={clsx(
              'rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors',
              activeSection === s.key
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={dispatchRefresh}
          className="rounded-md p-1.5 text-[var(--color-icon-btn-fg)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
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
          className="rounded-md p-1.5 text-[var(--color-icon-btn-fg)] hover:bg-[var(--color-icon-btn-hover)] transition-colors"
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
          className="rounded-md p-1.5 text-[var(--color-icon-btn-fg)] hover:bg-[var(--color-icon-btn-hover)] active:bg-[var(--color-icon-btn-pressed)] transition-colors"
          aria-label="Settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6.86 1.45a1.2 1.2 0 0 1 2.28 0l.23.7a1.2 1.2 0 0 0 1.52.72l.67-.27a1.2 1.2 0 0 1 1.61 1.14l-.02.72a1.2 1.2 0 0 0 1.02 1.22l.71.12a1.2 1.2 0 0 1 .57 2.17l-.57.44a1.2 1.2 0 0 0-.36 1.54l.35.63a1.2 1.2 0 0 1-.88 1.77l-.71.08a1.2 1.2 0 0 0-1.07 1.16l-.02.72a1.2 1.2 0 0 1-1.66 1.06l-.64-.3a1.2 1.2 0 0 0-1.55.34l-.43.57a1.2 1.2 0 0 1-1.94 0l-.43-.57a1.2 1.2 0 0 0-1.55-.34l-.64.3a1.2 1.2 0 0 1-1.66-1.06l-.02-.72a1.2 1.2 0 0 0-1.07-1.16l-.71-.08a1.2 1.2 0 0 1-.88-1.77l.35-.63a1.2 1.2 0 0 0-.36-1.54l-.57-.44A1.2 1.2 0 0 1 1.6 4.6l.71-.12a1.2 1.2 0 0 0 1.02-1.22l-.02-.72A1.2 1.2 0 0 1 4.92 1.4l.67.27a1.2 1.2 0 0 0 1.52-.72l.23-.7z" />
            <circle cx="8" cy="8" r="2.5" />
          </svg>
        </button>
      </div>
    </header>
  );
}
