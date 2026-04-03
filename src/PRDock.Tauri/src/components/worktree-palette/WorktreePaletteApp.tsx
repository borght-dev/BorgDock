import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openPath } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useState } from 'react';
import type { AppSettings, RepoSettings } from '@/types/settings';
import type { WorktreeInfo } from '@/types/worktree';

interface RepoWorktrees {
  repo: RepoSettings;
  worktrees: WorktreeInfo[];
  error?: string;
}

function shortPath(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/');
  // Show last 2 segments: ".worktrees/worktree1"
  return parts.slice(-2).join('/');
}

function worktreeSlotName(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? fullPath;
}

export function WorktreePaletteApp() {
  const [repoWorktrees, setRepoWorktrees] = useState<RepoWorktrees[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadWorktrees = useCallback(async () => {
    try {
      const settings = await invoke<AppSettings>('load_settings');
      const repos = settings.repos.filter((r) => r.enabled && r.worktreeBasePath);

      const results: RepoWorktrees[] = await Promise.all(
        repos.map(async (repo) => {
          try {
            const worktrees = await invoke<WorktreeInfo[]>('list_worktrees', {
              basePath: repo.worktreeBasePath,
            });
            return { repo, worktrees };
          } catch (err) {
            return {
              repo,
              worktrees: [],
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }),
      );

      setRepoWorktrees(results);
    } catch {
      // Settings load failed — keep empty
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        getCurrentWindow().close();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadWorktrees();
  }, [loadWorktrees]);

  const handleOpenFolder = useCallback((path: string) => {
    openPath(path).catch(() => {});
  }, []);

  const totalWorktrees = repoWorktrees.reduce(
    (sum, r) => sum + r.worktrees.filter((w) => !w.isMainWorktree).length,
    0,
  );

  return (
    <div className="wt-palette">
      {/* Scanline overlay */}
      <div className="wt-scanlines" />

      {/* Title bar */}
      <div className="wt-titlebar" data-tauri-drag-region>
        <div className="wt-titlebar-left">
          <div className="wt-logo">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 2v12M12 8c0-3-2-4-4-4" />
              <circle cx="4" cy="14" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="4" cy="2" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <span className="wt-title">WORKTREES</span>
          <span className="wt-count">{totalWorktrees}</span>
        </div>
        <div className="wt-titlebar-right">
          <button
            className={`wt-btn-icon ${refreshing ? 'wt-spin' : ''}`}
            onClick={handleRefresh}
            title="Refresh"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4" />
              <path d="M12.5 1v3.5H9M3.5 15v-3.5H7" />
            </svg>
          </button>
          <button
            className="wt-btn-icon"
            onClick={() => getCurrentWindow().close()}
            title="Close (Esc)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="wt-content">
        {loading && (
          <div className="wt-loading">
            <div className="wt-loading-bar" />
            <span>Scanning worktrees...</span>
          </div>
        )}

        {!loading && repoWorktrees.length === 0 && (
          <div className="wt-empty">
            <span className="wt-empty-icon">&gt;_</span>
            <span>No repos with worktree paths configured</span>
          </div>
        )}

        {!loading &&
          repoWorktrees.map((rw) => {
            const nonMain = rw.worktrees.filter((w) => !w.isMainWorktree);
            if (nonMain.length === 0 && !rw.error) return null;

            return (
              <div key={`${rw.repo.owner}/${rw.repo.name}`} className="wt-repo-section">
                <div className="wt-repo-header">
                  <span className="wt-repo-name">{rw.repo.owner}/{rw.repo.name}</span>
                  {rw.error && <span className="wt-repo-error">err</span>}
                </div>

                {rw.error && (
                  <div className="wt-error-detail">{rw.error}</div>
                )}

                <div className="wt-grid">
                  {nonMain.map((wt) => (
                    <WorktreeSlot
                      key={wt.path}
                      worktree={wt}
                      onOpenFolder={handleOpenFolder}
                    />
                  ))}
                </div>
              </div>
            );
          })}

        {/* Shortcut hint */}
        <div className="wt-footer">
          <span className="wt-kbd">Ctrl+F7</span>
          <span>toggle</span>
          <span className="wt-sep">/</span>
          <span className="wt-kbd">Esc</span>
          <span>close</span>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Overpass:wght@400;600;700&display=swap');

        .wt-palette {
          position: relative;
          width: 100vw;
          height: 100vh;
          background: var(--color-background);
          border: 1px solid var(--color-strong-border);
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          font-family: 'Overpass', sans-serif;
        }

        .dark .wt-palette {
          background: linear-gradient(170deg, #141218 0%, #0E0C14 100%);
          border-color: rgba(124, 106, 246, 0.12);
        }

        /* Subtle scanlines for that terminal feel */
        .wt-scanlines {
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: 50;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.015) 2px,
            rgba(0, 0, 0, 0.015) 4px
          );
        }
        .dark .wt-scanlines {
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(255, 255, 255, 0.008) 2px,
            rgba(255, 255, 255, 0.008) 4px
          );
        }

        /* Titlebar */
        .wt-titlebar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid var(--color-separator);
          cursor: grab;
          user-select: none;
          position: relative;
          z-index: 10;
        }

        .wt-titlebar-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .wt-titlebar-right {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .wt-logo {
          color: var(--color-accent);
          display: flex;
        }

        .wt-title {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: var(--color-text-secondary);
        }

        .wt-count {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 600;
          color: var(--color-accent);
          background: var(--color-accent-subtle);
          border: 1px solid rgba(124, 106, 246, 0.15);
          border-radius: 4px;
          padding: 1px 6px;
          line-height: 1.4;
        }

        .wt-btn-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border: none;
          background: transparent;
          color: var(--color-text-muted);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .wt-btn-icon:hover {
          background: var(--color-surface-hover);
          color: var(--color-text-primary);
        }

        @keyframes wt-spin-anim {
          to { transform: rotate(360deg); }
        }
        .wt-spin svg {
          animation: wt-spin-anim 0.8s linear infinite;
        }

        /* Content area */
        .wt-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px 14px;
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* Loading */
        .wt-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 40px 0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: var(--color-text-muted);
        }

        .wt-loading-bar {
          width: 120px;
          height: 2px;
          background: var(--color-surface-raised);
          border-radius: 1px;
          overflow: hidden;
          position: relative;
        }
        .wt-loading-bar::after {
          content: '';
          position: absolute;
          width: 40px;
          height: 100%;
          background: var(--color-accent);
          border-radius: 1px;
          animation: wt-loading-slide 1s ease-in-out infinite;
        }
        @keyframes wt-loading-slide {
          0% { left: -40px; }
          100% { left: 120px; }
        }

        /* Empty */
        .wt-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 40px 0;
          color: var(--color-text-ghost);
          font-size: 12px;
        }
        .wt-empty-icon {
          font-family: 'JetBrains Mono', monospace;
          font-size: 20px;
          opacity: 0.4;
        }

        /* Repo section */
        .wt-repo-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .wt-repo-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .wt-repo-name {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: var(--color-text-muted);
          text-transform: uppercase;
        }

        .wt-repo-error {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          font-weight: 600;
          color: var(--color-status-red);
          background: var(--color-error-badge-bg);
          border: 1px solid var(--color-error-badge-border);
          border-radius: 3px;
          padding: 0 5px;
          line-height: 1.6;
        }

        .wt-error-detail {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: var(--color-status-red);
          opacity: 0.7;
          padding: 4px 8px;
          background: var(--color-error-badge-bg);
          border-radius: 4px;
        }

        /* Worktree grid */
        .wt-grid {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        /* Individual worktree slot */
        .wt-slot {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: var(--color-card-background);
          border: 1px solid var(--color-card-border);
          border-radius: 8px;
          transition: all 0.15s;
          cursor: default;
          position: relative;
          overflow: hidden;
        }
        .wt-slot:hover {
          border-color: var(--color-accent);
          background: var(--color-selected-row-bg);
        }

        /* Slot left edge accent */
        .wt-slot::before {
          content: '';
          position: absolute;
          left: 0;
          top: 4px;
          bottom: 4px;
          width: 3px;
          border-radius: 0 2px 2px 0;
          background: var(--color-accent);
          opacity: 0.5;
          transition: opacity 0.15s;
        }
        .wt-slot:hover::before {
          opacity: 1;
        }

        .wt-slot-id {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 700;
          color: var(--color-accent);
          background: var(--color-accent-subtle);
          border: 1px solid rgba(124, 106, 246, 0.12);
          border-radius: 5px;
          padding: 3px 8px;
          white-space: nowrap;
          min-width: 32px;
          text-align: center;
        }

        .wt-slot-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .wt-branch {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          color: var(--color-text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .wt-branch-none {
          color: var(--color-text-ghost);
          font-style: italic;
          font-weight: 400;
        }

        .wt-path {
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          color: var(--color-text-ghost);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .wt-slot-actions {
          display: flex;
          gap: 3px;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .wt-slot:hover .wt-slot-actions {
          opacity: 1;
        }

        .wt-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: 1px solid var(--color-subtle-border);
          background: transparent;
          color: var(--color-text-muted);
          border-radius: 5px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .wt-action-btn:hover {
          background: var(--color-surface-hover);
          color: var(--color-accent);
          border-color: var(--color-accent);
        }

        /* Footer */
        .wt-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding-top: 8px;
          border-top: 1px solid var(--color-separator);
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: var(--color-text-ghost);
          margin-top: auto;
        }

        .wt-kbd {
          font-size: 9px;
          font-weight: 600;
          color: var(--color-text-muted);
          background: var(--color-surface-raised);
          border: 1px solid var(--color-subtle-border);
          border-radius: 3px;
          padding: 1px 5px;
        }

        .wt-sep {
          opacity: 0.3;
        }
      `}</style>
    </div>
  );
}

function WorktreeSlot({
  worktree,
  onOpenFolder,
}: {
  worktree: WorktreeInfo;
  onOpenFolder: (path: string) => void;
}) {
  const name = worktreeSlotName(worktree.path);
  const path = shortPath(worktree.path);
  const hasBranch = worktree.branchName.length > 0;

  return (
    <div className="wt-slot">
      <span className="wt-slot-id">{name}</span>
      <div className="wt-slot-info">
        <span className={`wt-branch ${!hasBranch ? 'wt-branch-none' : ''}`}>
          {hasBranch ? worktree.branchName : '(detached)'}
        </span>
        <span className="wt-path">{path}</span>
      </div>
      <div className="wt-slot-actions">
        <button
          className="wt-action-btn"
          onClick={() => onOpenFolder(worktree.path)}
          title="Open folder"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4.5V12a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3.5H3A1 1 0 002 4.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
