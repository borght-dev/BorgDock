import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import type { SearchMode } from './parse-query';

export interface ChangedFileEntry {
  path: string;
  status: string;
  oldPath: string | null;
}

interface ChangedFilesOutput {
  local: ChangedFileEntry[];
  vsBase: ChangedFileEntry[];
  baseRef: string;
  inRepo: boolean;
}

export type ChangedGroup = 'local' | 'vsBase';

export interface ChangesSectionProps {
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
  localCollapsed: boolean;
  vsBaseCollapsed: boolean;
  onToggleCollapse: (group: ChangedGroup) => void;
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

export function ChangesSection(props: ChangesSectionProps) {
  const {
    rootPath,
    query,
    queryMode,
    selectedGlobalIndex,
    baseIndex,
    onOpen,
    onHover,
    localCollapsed,
    vsBaseCollapsed,
    onToggleCollapse,
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

  const visibleRows = useMemo<VisibleRow[]>(() => {
    const rows: VisibleRow[] = [];
    if (!data || !data.inRepo) return rows;
    if (!localCollapsed) for (const f of filteredLocal) rows.push({ group: 'local', file: f });
    if (!vsBaseCollapsed) for (const f of filteredVsBase) rows.push({ group: 'vsBase', file: f });
    return rows;
  }, [data, filteredLocal, filteredVsBase, localCollapsed, vsBaseCollapsed]);

  useEffect(() => {
    onVisibleRowsChange?.(visibleRows);
  }, [visibleRows, onVisibleRowsChange]);

  if (!rootPath) return null;

  if (data && !data.inRepo) {
    return (
      <div className="bd-fp-changes">
        <div className="bd-fp-changes-header">Changes</div>
        <div className="bd-fp-changes-empty">Not a git repo</div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="bd-fp-changes">
        <div className="bd-fp-changes-header">Changes…</div>
      </div>
    );
  }

  if (!data) return null;

  const total = filteredLocal.length + filteredVsBase.length;
  if (total === 0) {
    return (
      <div className="bd-fp-changes">
        <div className="bd-fp-changes-header">Changes</div>
        <div className="bd-fp-changes-empty">No changes on this branch</div>
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
        {/* style: file-status-driven color — statusColor() returns a hex string computed per git status */}
        <span
          className="bd-fp-changes-status"
          style={{ color: statusColor(file.status) }}
          title={file.status}
        >
          {file.status}
        </span>
        <span className="bd-fp-changes-path">{label}</span>
      </button>
    );
  };

  return (
    <div className="bd-fp-changes">
      <div className="bd-fp-changes-header">
        {data.baseRef ? `Changes (${total}) · vs ${data.baseRef}` : `Changes (${total})`}
      </div>

      <button
        type="button"
        className="bd-fp-changes-subheader"
        onClick={() => onToggleCollapse('local')}
      >
        <span>{localCollapsed ? '▸' : '▾'} Local ({filteredLocal.length})</span>
      </button>
      {!localCollapsed && filteredLocal.map((f) => renderRow(f, 'local'))}

      <button
        type="button"
        className="bd-fp-changes-subheader"
        onClick={() => onToggleCollapse('vsBase')}
        title={`vs ${data.baseRef || 'base'}`}
      >
        <span>
          {vsBaseCollapsed ? '▸' : '▾'} vs {data.baseRef || 'base'} ({filteredVsBase.length})
        </span>
      </button>
      {!vsBaseCollapsed && filteredVsBase.map((f) => renderRow(f, 'vsBase'))}
    </div>
  );
}
