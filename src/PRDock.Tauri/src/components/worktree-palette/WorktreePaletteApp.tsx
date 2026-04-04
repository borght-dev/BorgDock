import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openPath } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, RepoSettings } from '@/types/settings';
import type { WorktreeInfo, WorktreeStatus } from '@/types/worktree';

// ── Helpers ──────────────────────────────────────────────────────────

interface FlatEntry {
  wt: WorktreeInfo;
  repo: RepoSettings;
}

function folderName(fullPath: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? fullPath;
}

function matchesQuery(entry: FlatEntry, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const folder = folderName(entry.wt.path).toLowerCase();
  const branch = entry.wt.branchName.toLowerCase();
  const repo = `${entry.repo.owner}/${entry.repo.name}`.toLowerCase();
  return branch.includes(lower) || folder.includes(lower) || repo.includes(lower);
}

function groupByRepo(entries: FlatEntry[]): Map<string, FlatEntry[]> {
  const groups = new Map<string, FlatEntry[]>();
  for (const e of entries) {
    const key = `${e.repo.owner}/${e.repo.name}`;
    const arr = groups.get(key);
    if (arr) arr.push(e);
    else groups.set(key, [e]);
  }
  return groups;
}

// ── Sub-components ───────────────────────────────────────────────────

function StatusDot({ status }: { status: WorktreeStatus }) {
  const color = status === 'clean' ? 'var(--wt-green)' : status === 'dirty' ? 'var(--wt-amber)' : 'var(--wt-red)';
  return (
    <span className="wt-status-dot-wrap">
      <span className="wt-status-dot" style={{ background: color }} />
      {status === 'conflict' && <span className="wt-status-dot-ring" style={{ borderColor: color }} />}
    </span>
  );
}

function SyncBadge({ ahead, behind, uncommittedCount }: { ahead: number; behind: number; uncommittedCount: number }) {
  return (
    <span className="wt-sync-badges">
      {ahead > 0 && <span className="wt-badge wt-badge-ahead">{'\u2191'}{ahead}</span>}
      {behind > 0 && <span className="wt-badge wt-badge-behind">{'\u2193'}{behind}</span>}
      {uncommittedCount > 0 && <span className="wt-badge wt-badge-dirty">{uncommittedCount}M</span>}
    </span>
  );
}

function WorktreeSlot({
  entry,
  isSelected,
  onSelect,
  onOpenTerminal,
  onOpenFolder,
  onOpenEditor,
  slotRef,
}: {
  entry: FlatEntry;
  isSelected: boolean;
  onSelect: () => void;
  onOpenTerminal: () => void;
  onOpenFolder: () => void;
  onOpenEditor: () => void;
  slotRef: (el: HTMLDivElement | null) => void;
}) {
  const { wt } = entry;
  const hasBranch = wt.branchName.length > 0;

  return (
    <div
      ref={slotRef}
      className={`wt-slot ${isSelected ? 'wt-slot-selected' : ''}`}
      onClick={onOpenTerminal}
      onMouseEnter={onSelect}
    >
      <StatusDot status={wt.status} />
      <div className="wt-slot-body">
        <div className="wt-slot-primary">
          <span className={`wt-branch ${!hasBranch ? 'wt-branch-detached' : ''}`}>
            {hasBranch ? wt.branchName : '(detached)'}
          </span>
          {!hasBranch && wt.commitSha && (
            <code className="wt-sha">{wt.commitSha}</code>
          )}
          <SyncBadge ahead={wt.ahead} behind={wt.behind} uncommittedCount={wt.uncommittedCount} />
        </div>
        <div className="wt-slot-secondary">{folderName(wt.path)}</div>
      </div>
      <div className={`wt-slot-actions ${isSelected ? 'wt-slot-actions-visible' : ''}`}>
        <button
          className="wt-action-btn"
          onClick={(e) => { e.stopPropagation(); onOpenFolder(); }}
          title="Open folder"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4.5V12a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3.5H3A1 1 0 002 4.5z" />
          </svg>
        </button>
        <button
          className="wt-action-btn"
          onClick={(e) => { e.stopPropagation(); onOpenEditor(); }}
          title="Open in editor"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" />
            <path d="M9.5 3.5l3 3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function WorktreePaletteApp() {
  const [allEntries, setAllEntries] = useState<FlatEntry[]>([]);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const slotRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  // ── Data fetching ──
  const loadWorktrees = useCallback(async () => {
    try {
      const settings = await invoke<AppSettings>('load_settings');
      const repos = settings.repos.filter((r) => r.enabled && r.worktreeBasePath);
      const flat: FlatEntry[] = [];
      const errs = new Map<string, string>();

      await Promise.allSettled(
        repos.map(async (repo) => {
          try {
            const worktrees = await invoke<WorktreeInfo[]>('list_worktrees', {
              basePath: repo.worktreeBasePath,
            });
            for (const wt of worktrees) {
              if (!wt.isMainWorktree) flat.push({ wt, repo });
            }
          } catch (err) {
            errs.set(`${repo.owner}/${repo.name}`, err instanceof Error ? err.message : String(err));
          }
        }),
      );

      setAllEntries(flat);
      setErrors(errs);
    } catch {
      // Settings load failed
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  // Auto-focus search after load
  useEffect(() => {
    if (!loading) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [loading]);

  // ── Filtered + grouped data ──
  const filtered = useMemo(
    () => allEntries.filter((e) => matchesQuery(e, query)),
    [allEntries, query],
  );

  const grouped = useMemo(() => groupByRepo(filtered), [filtered]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected into view
  useEffect(() => {
    const el = slotRefs.current.get(selectedIndex);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ── Actions ──
  const handleOpenTerminal = useCallback((path: string) => {
    invoke('open_in_terminal', { path }).catch(() => {});
  }, []);

  const handleOpenFolder = useCallback((path: string) => {
    openPath(path).catch(() => {});
  }, []);

  const handleOpenEditor = useCallback((path: string) => {
    invoke('open_in_editor', { path }).catch(() => {});
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadWorktrees();
  }, [loadWorktrees]);

  // ── Keyboard ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[selectedIndex]) {
            handleOpenTerminal(filtered[selectedIndex].wt.path);
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (query) {
            setQuery('');
          } else {
            getCurrentWindow().close();
          }
          break;
      }
    },
    [filtered, selectedIndex, query, handleOpenTerminal],
  );

  // ── Render ──
  let flatIndex = 0;

  return (
    <div className="wt-palette" onKeyDown={handleKeyDown}>
      <div className="wt-scanlines" />

      {/* Titlebar */}
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
          <span className="wt-count">{filtered.length}</span>
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

      {/* Search */}
      {!loading && (
        <div className="wt-search-wrap">
          <svg className="wt-search-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            ref={searchRef}
            className="wt-search"
            placeholder="Filter by branch, folder, or repo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="wt-search-clear" onClick={() => { setQuery(''); searchRef.current?.focus(); }}>
              {'\u2715'}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="wt-content">
        {loading && (
          <div className="wt-loading">
            <div className="wt-loading-bar" />
            <span>Scanning worktrees...</span>
          </div>
        )}

        {!loading && allEntries.length === 0 && errors.size === 0 && (
          <div className="wt-empty">
            <span className="wt-empty-icon">&gt;_</span>
            <span>No repos with worktree paths configured</span>
          </div>
        )}

        {!loading && allEntries.length > 0 && filtered.length === 0 && query && (
          <div className="wt-empty">
            <span className="wt-empty-icon">{'\u2205'}</span>
            <span>No worktrees matching '<strong>{query}</strong>'</span>
          </div>
        )}

        {!loading &&
          [...grouped.entries()].map(([repoKey, entries], groupIdx) => (
            <div key={repoKey} className={`wt-repo-section ${groupIdx > 0 ? 'wt-repo-section-divider' : ''}`}>
              <div className="wt-repo-header">
                <span className="wt-repo-name">{repoKey}</span>
                <span className="wt-repo-count">{entries.length}</span>
                {errors.has(repoKey) && <span className="wt-repo-error">err</span>}
              </div>
              {errors.has(repoKey) && (
                <div className="wt-error-detail">{errors.get(repoKey)}</div>
              )}
              <div className="wt-grid">
                {entries.map((entry) => {
                  const idx = flatIndex++;
                  return (
                    <WorktreeSlot
                      key={entry.wt.path}
                      entry={entry}
                      isSelected={idx === selectedIndex}
                      onSelect={() => setSelectedIndex(idx)}
                      onOpenTerminal={() => handleOpenTerminal(entry.wt.path)}
                      onOpenFolder={() => handleOpenFolder(entry.wt.path)}
                      onOpenEditor={() => handleOpenEditor(entry.wt.path)}
                      slotRef={(el) => { slotRefs.current.set(idx, el); }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
      </div>

      {/* Footer — pinned outside scroll */}
      <div className="wt-footer">
        <span className="wt-kbd">{'\u2191\u2193'}</span>
        <span>navigate</span>
        <span className="wt-sep">{'\u00B7'}</span>
        <span className="wt-kbd">{'\u23CE'}</span>
        <span>open</span>
        <span className="wt-sep">{'\u00B7'}</span>
        <span className="wt-kbd">esc</span>
        <span>close</span>
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Overpass:wght@400;600;700&display=swap');

.wt-palette {
  --wt-bg: #F7F5FB;
  --wt-bg-gradient: linear-gradient(174deg, #F7F5FB 0%, #EDEAF4 100%);
  --wt-card: rgba(0,0,0, 0.018);
  --wt-card-hover: rgba(124, 106, 246, 0.06);
  --wt-card-selected: rgba(124, 106, 246, 0.10);
  --wt-border: rgba(90, 86, 112, 0.08);
  --wt-border-accent: rgba(124, 106, 246, 0.30);
  --wt-border-strong: rgba(90, 86, 112, 0.12);
  --wt-surface: rgba(90, 86, 112, 0.04);
  --wt-text-1: #1A1726;
  --wt-text-2: #3A3550;
  --wt-text-3: #8A85A0;
  --wt-text-4: #B8B0C8;
  --wt-accent: #6655D4;
  --wt-accent-dim: rgba(124, 106, 246, 0.10);
  --wt-red: #C7324F;
  --wt-amber: #B07D09;
  --wt-green: #3BA68E;

  position: relative;
  width: 100vw;
  height: 100vh;
  background: var(--wt-bg-gradient);
  border: 1px solid var(--wt-border-strong);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: 'Overpass', sans-serif;
  outline: none;
}

.dark .wt-palette {
  --wt-bg: #0F0D15;
  --wt-bg-gradient: linear-gradient(174deg, #141220 0%, #0C0A14 100%);
  --wt-card: rgba(255,255,255, 0.022);
  --wt-card-hover: rgba(124, 106, 246, 0.05);
  --wt-card-selected: rgba(124, 106, 246, 0.08);
  --wt-border: rgba(255,255,255, 0.04);
  --wt-border-accent: rgba(124, 106, 246, 0.25);
  --wt-border-strong: rgba(124, 106, 246, 0.12);
  --wt-surface: rgba(255,255,255, 0.035);
  --wt-text-1: #e8e4f4;
  --wt-text-2: #9a94b8;
  --wt-text-3: #5f5980;
  --wt-text-4: #3d3758;
  --wt-accent: #7C6AF6;
  --wt-accent-dim: rgba(124, 106, 246, 0.12);
  --wt-red: #f87171;
  --wt-amber: #fbbf24;
  --wt-green: #34d399;

  background: var(--wt-bg-gradient);
  border-color: var(--wt-border-strong);
}

/* Scanlines */
.wt-scanlines {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 50;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.012) 2px, rgba(0,0,0,0.012) 4px);
}
.dark .wt-scanlines {
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.008) 2px, rgba(255,255,255,0.008) 4px);
}

/* Titlebar */
.wt-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--wt-border);
  cursor: grab;
  user-select: none;
  position: relative;
  z-index: 10;
}
.wt-titlebar-left { display: flex; align-items: center; gap: 8px; }
.wt-titlebar-right { display: flex; align-items: center; gap: 4px; }
.wt-logo { color: var(--wt-accent); display: flex; }
.wt-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--wt-text-2);
}
.wt-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; font-weight: 600;
  color: var(--wt-accent);
  background: var(--wt-accent-dim);
  border: 1px solid rgba(124,106,246,0.15);
  border-radius: 4px;
  padding: 1px 6px; line-height: 1.4;
}

.wt-btn-icon {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border: none; background: transparent;
  color: var(--wt-text-3);
  border-radius: 6px; cursor: pointer;
  transition: all 0.15s;
}
.wt-btn-icon:hover { background: var(--wt-surface); color: var(--wt-text-1); }

@keyframes wt-spin-anim { to { transform: rotate(360deg); } }
.wt-spin svg { animation: wt-spin-anim 0.8s linear infinite; }

/* Search */
.wt-search-wrap {
  position: relative;
  margin: 10px 14px 0;
  z-index: 10;
}
.wt-search-icon {
  position: absolute;
  left: 10px; top: 50%; transform: translateY(-50%);
  color: var(--wt-text-3);
  pointer-events: none;
}
.wt-search {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 30px 7px 32px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--wt-text-1);
  background: var(--wt-surface);
  border: 1px solid var(--wt-border);
  border-radius: 8px;
  outline: none;
  transition: all 0.15s;
}
.wt-search::placeholder { color: var(--wt-text-4); }
.wt-search:focus {
  border-color: var(--wt-border-accent);
  background: color-mix(in srgb, var(--wt-accent) 3%, var(--wt-surface));
}
.wt-search-clear {
  position: absolute;
  right: 6px; top: 50%; transform: translateY(-50%);
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent;
  color: var(--wt-text-3);
  font-size: 11px; cursor: pointer;
  border-radius: 4px;
  transition: all 0.12s;
}
.wt-search-clear:hover { background: var(--wt-surface); color: var(--wt-text-1); }

/* Content */
.wt-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.wt-content::-webkit-scrollbar { width: 4px; }
.wt-content::-webkit-scrollbar-track { background: transparent; }
.wt-content::-webkit-scrollbar-thumb { background: var(--wt-border); border-radius: 2px; }

/* Loading */
.wt-loading {
  display: flex; flex-direction: column; align-items: center;
  gap: 10px; padding: 40px 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: var(--wt-text-3);
}
.wt-loading-bar {
  width: 120px; height: 2px;
  background: var(--wt-surface);
  border-radius: 1px; overflow: hidden; position: relative;
}
.wt-loading-bar::after {
  content: ''; position: absolute;
  width: 40px; height: 100%;
  background: var(--wt-accent); border-radius: 1px;
  animation: wt-loading-slide 1s ease-in-out infinite;
}
@keyframes wt-loading-slide { 0% { left: -40px; } 100% { left: 120px; } }

/* Empty */
.wt-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; padding: 40px 0;
  color: var(--wt-text-4); font-size: 12px; text-align: center;
}
.wt-empty-icon {
  font-family: 'JetBrains Mono', monospace;
  font-size: 20px; opacity: 0.4;
}
.wt-empty strong { color: var(--wt-text-2); }

/* Repo section */
.wt-repo-section {
  display: flex; flex-direction: column; gap: 6px;
}
.wt-repo-section-divider {
  border-top: 1px solid var(--wt-border);
  padding-top: 10px;
}
.wt-repo-header {
  display: flex; align-items: center; gap: 8px;
}
.wt-repo-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--wt-text-3);
  text-transform: uppercase;
}
.wt-repo-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; font-weight: 600;
  color: var(--wt-text-4);
  background: var(--wt-surface);
  border-radius: 3px;
  padding: 0 5px; line-height: 1.6;
}
.wt-repo-error {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; font-weight: 600;
  color: var(--wt-red);
  background: color-mix(in srgb, var(--wt-red) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--wt-red) 15%, transparent);
  border-radius: 3px;
  padding: 0 5px; line-height: 1.6;
}
.wt-error-detail {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: var(--wt-red); opacity: 0.7;
  padding: 4px 8px;
  background: color-mix(in srgb, var(--wt-red) 6%, transparent);
  border-radius: 4px;
}

/* Grid */
.wt-grid { display: flex; flex-direction: column; gap: 3px; }

/* Slot */
.wt-slot {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  transition: all 0.12s;
  cursor: pointer;
  position: relative;
}
.wt-slot:hover {
  background: var(--wt-card-hover);
  border-color: var(--wt-border);
}
.wt-slot-selected {
  background: var(--wt-card-selected);
  border-color: var(--wt-border-accent);
}
.wt-slot-selected::before {
  content: '';
  position: absolute;
  left: 0; top: 4px; bottom: 4px;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--wt-accent);
}

/* Status dot */
.wt-status-dot-wrap {
  position: relative;
  width: 10px; height: 10px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.wt-status-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
}
.wt-status-dot-ring {
  position: absolute;
  inset: -2px;
  border: 1.5px solid;
  border-radius: 50%;
  animation: wt-pulse 2s ease-in-out infinite;
}
@keyframes wt-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.5); opacity: 0; }
}

/* Slot body */
.wt-slot-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.wt-slot-primary { display: flex; align-items: center; gap: 6px; min-width: 0; }
.wt-slot-secondary {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: var(--wt-text-4);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.wt-branch {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px; font-weight: 600;
  color: var(--wt-text-1);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex-shrink: 1; min-width: 0;
}
.wt-branch-detached {
  color: var(--wt-text-4);
  font-style: italic; font-weight: 400;
}

.wt-sha {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; font-weight: 500;
  color: var(--wt-amber);
  background: color-mix(in srgb, var(--wt-amber) 10%, transparent);
  border-radius: 3px;
  padding: 0 4px; line-height: 1.5;
  flex-shrink: 0;
}

/* Sync badges */
.wt-sync-badges { display: flex; gap: 3px; flex-shrink: 0; }
.wt-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px; font-weight: 600;
  border-radius: 3px;
  padding: 0 4px; line-height: 1.6;
}
.wt-badge-ahead {
  color: var(--wt-green);
  background: color-mix(in srgb, var(--wt-green) 10%, transparent);
}
.wt-badge-behind {
  color: var(--wt-red);
  background: color-mix(in srgb, var(--wt-red) 10%, transparent);
}
.wt-badge-dirty {
  color: var(--wt-amber);
  background: color-mix(in srgb, var(--wt-amber) 10%, transparent);
}

/* Slot actions */
.wt-slot-actions {
  display: flex; gap: 3px;
  opacity: 0.3;
  transition: opacity 0.12s;
}
.wt-slot:hover .wt-slot-actions,
.wt-slot-actions-visible {
  opacity: 1;
}

.wt-action-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border: 1px solid var(--wt-border);
  background: transparent;
  color: var(--wt-text-3);
  border-radius: 5px; cursor: pointer;
  transition: all 0.12s;
}
.wt-action-btn:hover {
  background: var(--wt-surface);
  color: var(--wt-accent);
  border-color: var(--wt-accent);
}

/* Footer */
.wt-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border-top: 1px solid var(--wt-border);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--wt-text-4);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}
.wt-kbd {
  font-size: 9px; font-weight: 600;
  color: var(--wt-text-3);
  background: var(--wt-surface);
  border: 1px solid var(--wt-border);
  border-radius: 3px;
  padding: 1px 5px;
}
.wt-sep { opacity: 0.3; }
`;
