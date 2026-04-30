import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import type { SearchMode } from './parse-query';

export interface ChangedFileEntry {
  path: string;
  status: string;
  oldPath?: string;
  additions: number;
  deletions: number;
}

interface ChangedFilesOutput {
  local: ChangedFileEntry[];
  vsBase: ChangedFileEntry[];
  baseRef: string;
  inRepo: boolean;
}

export type ChangedGroup = 'local' | 'vsBase';

export interface FilePaletteFilePaletteChangesSectionProps {
  rootPath: string | null;
  query: string;
  queryMode: SearchMode;
  /** Global palette selectedIndex. Rows inside this section use baseIndex + local offset. */
  selectedGlobalIndex: number;
  /** Flat-nav starting index for this section's rows. */
  baseIndex: number;
  onOpen: (file: ChangedFileEntry, group: ChangedGroup) => void;
  /** Called when the user hovers a row; payload is the global nav index. */
  onHover: (globalIndex: number) => void;
  /** When true the entire section body is hidden. */
  collapsed: boolean;
  /** Controls which sub-group(s) are shown: head=local only, base=vsBase only, both=all. */
  mode: 'head' | 'base' | 'both';
  onToggleCollapse: () => void;
  onChangeMode: (mode: 'head' | 'base' | 'both') => void;
  /** Parent bumps this to force a refetch (focus change, manual refresh, root switch). */
  refreshTick: number;
  /** Called after each successful fetch so the parent knows how many flat-nav rows this
   *  section contributes (0 when collapsed / empty / not in repo). */
  onVisibleRowsChange?: (rows: VisibleRow[]) => void;
  /** Registers each rendered row with the parent's rowRefs map keyed by global nav
   *  index, so ArrowUp/Down scrolls the selected row into view. */
  rowRef?: (el: HTMLButtonElement | null, globalIndex: number) => void;
}

export interface VisibleRow {
  group: ChangedGroup;
  file: ChangedFileEntry;
}

function matches(path: string, query: string): boolean {
  if (!query) return true;
  return path.toLowerCase().includes(query.toLowerCase());
}

function statusColor(status: string): string {
  switch (status) {
    case 'A':
      return 'var(--color-status-green)';
    case 'D':
      return 'var(--color-status-red)';
    case 'R':
    case 'C':
      return 'var(--color-status-yellow)';
    case '?':
      return 'var(--color-status-blue, var(--color-accent))';
    default:
      return 'var(--color-text-muted)';
  }
}

export function FilePaletteChangesSection(props: FilePaletteFilePaletteChangesSectionProps) {
  const {
    rootPath,
    query,
    queryMode,
    selectedGlobalIndex,
    baseIndex,
    onOpen,
    onHover,
    collapsed,
    mode,
    onToggleCollapse,
    onChangeMode,
    refreshTick,
    onVisibleRowsChange,
    rowRef,
  } = props;

  const [data, setData] = useState<ChangedFilesOutput | null>(null);
  const [loading, setLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshTick is a re-fetch trigger, not a value the effect reads
  useEffect(() => {
    if (!rootPath) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    invoke<ChangedFilesOutput>('git_changed_files', { root: rootPath })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setData({ local: [], vsBase: [], baseRef: '', inRepo: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath, refreshTick]);

  const filterActive = queryMode === 'filename' && query.length > 0;

  const filteredLocal = useMemo(
    () => (data ? data.local.filter((f) => !filterActive || matches(f.path, query)) : []),
    [data, filterActive, query],
  );
  const filteredVsBase = useMemo(
    () => (data ? data.vsBase.filter((f) => !filterActive || matches(f.path, query)) : []),
    [data, filterActive, query],
  );

  // Visible rows respect both collapsed and mode.
  const visibleRows = useMemo<VisibleRow[]>(() => {
    if (!data || !data.inRepo || collapsed) return [];
    const rows: VisibleRow[] = [];
    if (mode === 'head' || mode === 'both') for (const f of filteredLocal) rows.push({ group: 'local', file: f });
    if (mode === 'base' || mode === 'both') for (const f of filteredVsBase) rows.push({ group: 'vsBase', file: f });
    return rows;
  }, [data, filteredLocal, filteredVsBase, mode, collapsed]);

  useEffect(() => {
    onVisibleRowsChange?.(visibleRows);
  }, [visibleRows, onVisibleRowsChange]);

  // Compute visible totals for the header.
  const visibleLocal = !collapsed && (mode === 'head' || mode === 'both') ? filteredLocal : [];
  const visibleBase  = !collapsed && (mode === 'base' || mode === 'both') ? filteredVsBase : [];
  const visibleCount = visibleLocal.length + visibleBase.length;
  const visibleAdd = [...visibleLocal, ...visibleBase].reduce((s, f) => s + f.additions, 0);
  const visibleDel = [...visibleLocal, ...visibleBase].reduce((s, f) => s + f.deletions, 0);
  const baseRefLabel = data?.baseRef || 'main';

  if (!rootPath) return null;

  // Shared header rendered in all states.
  const header = (
    <div className="bd-fp-changes-header">
      <button
        type="button"
        className="bd-fp-changes-caret"
        onClick={onToggleCollapse}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '▸' : '▾'}
      </button>
      <span style={{ fontSize: 11 }}>●</span>
      <span className="bd-fp-changes-title">CHANGES</span>
      {visibleCount > 0 && (
        <span className="bd-fp-changes-count bd-mono">· {visibleCount}</span>
      )}
      {(visibleAdd > 0 || visibleDel > 0) && (
        <span className="bd-fp-changes-stats">
          <span style={{ color: 'var(--color-status-green)' }}>+{visibleAdd}</span>
          <span style={{ color: 'var(--color-status-red)' }}>−{visibleDel}</span>
        </span>
      )}
      <span className="bd-fp-changes-spacer" />
      <div className="bd-fp-changes-modes">
        {(['head', 'base', 'both'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`bd-fp-changes-mode${mode === m ? ' bd-fp-changes-mode--on' : ''}`}
            onClick={() => onChangeMode(m)}
          >
            {m === 'head' ? 'vs HEAD' : m === 'base' ? `vs ${baseRefLabel}` : 'Both'}
          </button>
        ))}
      </div>
    </div>
  );

  if (data && !data.inRepo) {
    return (
      <div className="bd-fp-changes">
        {header}
        <div className="bd-fp-changes-empty">Not a git repo</div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="bd-fp-changes">
        {header}
      </div>
    );
  }

  if (!data) return null;

  const total = filteredLocal.length + filteredVsBase.length;
  if (total === 0) {
    return (
      <div className="bd-fp-changes">
        {header}
        {!collapsed && <div className="bd-fp-changes-empty">No changes on this branch</div>}
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="bd-fp-changes">
        {header}
      </div>
    );
  }

  // Compute each row's global nav index based on visibleRows order.
  let runningIndex = baseIndex;

  const renderRow = (file: ChangedFileEntry, group: ChangedGroup) => {
    const globalIdx = runningIndex++;
    const selected = selectedGlobalIndex === globalIdx;
    const label =
      file.oldPath && (file.status === 'R' || file.status === 'C')
        ? `${file.oldPath} → ${file.path}`
        : file.path;
    return (
      <button
        key={`${group}:${file.path}`}
        type="button"
        ref={(el) => rowRef?.(el, globalIdx)}
        className={`bd-fp-changes-row${selected ? ' bd-fp-changes-row--selected' : ''}`}
        onMouseEnter={() => onHover(globalIdx)}
        onClick={() => onOpen(file, group)}
      >
        <span
          className="bd-fp-changes-status"
          style={{ color: statusColor(file.status) }}
          title={file.status}
        >
          {file.status}
        </span>
        <span className="bd-fp-changes-path">{label}</span>
        <span className="bd-fp-changes-row__add bd-mono" style={{ color: 'var(--color-status-green)' }}>+{file.additions}</span>
        <span className="bd-fp-changes-row__del bd-mono" style={{ color: 'var(--color-status-red)' }}>−{file.deletions}</span>
      </button>
    );
  };

  const showLocal = mode === 'head' || mode === 'both';
  const showBase = mode === 'base' || mode === 'both';

  return (
    <div className="bd-fp-changes">
      {header}

      {showLocal && (
        <>
          <div className="bd-fp-changes-group-label">
            Local · uncommitted
            <span className="bd-fp-changes-group-sub">vs HEAD</span>
          </div>
          {filteredLocal.map((f) => renderRow(f, 'local'))}
        </>
      )}

      {showBase && (
        <>
          <div className="bd-fp-changes-group-label">
            Ahead of base
            <span className="bd-fp-changes-group-sub">vs {baseRefLabel}</span>
          </div>
          {filteredVsBase.map((f) => renderRow(f, 'vsBase'))}
        </>
      )}
    </div>
  );
}
