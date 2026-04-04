import clsx from 'clsx';
import { useMemo, useState } from 'react';
import type { DiffFile, FileStatusFilter } from '@/types';

interface DiffFileTreeProps {
  files: DiffFile[];
  activeFile: string | null;
  statusFilter: FileStatusFilter;
  onFileClick: (filename: string) => void;
}

function fileExtIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'TS', tsx: 'TX', js: 'JS', jsx: 'JX',
    css: 'CS', scss: 'SC', html: 'HT',
    json: 'JN', md: 'MD', rs: 'RS',
    toml: 'TL', sql: 'SQ', yaml: 'YM', yml: 'YM',
    svg: 'SV', png: 'PN',
  };
  return map[ext] ?? (ext.slice(0, 2).toUpperCase() || 'F');
}

function statusBadge(status: string): { letter: string; color: string } {
  switch (status) {
    case 'added':
      return { letter: 'A', color: 'var(--color-status-green)' };
    case 'removed':
      return { letter: 'D', color: 'var(--color-status-red)' };
    case 'renamed':
      return { letter: 'R', color: 'var(--color-status-yellow)' };
    case 'copied':
      return { letter: 'C', color: 'var(--color-text-muted)' };
    default:
      return { letter: 'M', color: 'var(--color-text-muted)' };
  }
}

export function DiffFileTree({ files, activeFile, statusFilter, onFileClick }: DiffFileTreeProps) {
  const [search, setSearch] = useState('');
  const [treeMode, setTreeMode] = useState(false);

  const filtered = useMemo(() => {
    let result = files;
    if (statusFilter !== 'all') {
      const statusMap: Record<string, string[]> = {
        added: ['added'],
        modified: ['modified', 'renamed', 'copied'],
        deleted: ['removed'],
      };
      const allowed = statusMap[statusFilter] ?? [];
      result = result.filter((f) => allowed.includes(f.status));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.filename.toLowerCase().includes(q));
    }
    return result;
  }, [files, search, statusFilter]);

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <div className="flex flex-col h-full border-r border-[var(--color-diff-border)]">
      {/* Search */}
      <div className="p-1.5 border-b border-[var(--color-diff-border)]">
        <input
          type="text"
          placeholder="Filter files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded px-2 py-1 text-[11px] bg-[var(--color-input-bg)] border border-[var(--color-input-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      {/* Tree mode toggle */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-diff-border)]">
        <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">
          Files
        </span>
        <button
          onClick={() => setTreeMode(!treeMode)}
          className="text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          title={treeMode ? 'Flat list' : 'Tree view'}
        >
          {treeMode ? '≡' : '⊞'}
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((file) => {
          const badge = statusBadge(file.status);
          const basename = file.filename.split('/').pop() ?? file.filename;
          const dirPath = treeMode ? undefined : file.filename.slice(0, -(basename.length + 1)) || undefined;
          const isActive = activeFile === file.filename;

          return (
            <button
              key={file.filename}
              onClick={() => onFileClick(file.filename)}
              className={clsx(
                'flex items-center gap-1.5 w-full px-2 py-1 text-left transition-colors',
                isActive
                  ? 'bg-[var(--color-selected-row-bg)]'
                  : 'hover:bg-[var(--color-surface-hover)]',
              )}
              title={file.filename}
            >
              <span className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-[7px] font-bold bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]">
                {fileExtIcon(file.filename)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-[var(--color-text-secondary)]">
                  {basename}
                </div>
                {dirPath && (
                  <div className="truncate text-[9px] text-[var(--color-text-muted)]">
                    {dirPath}
                  </div>
                )}
              </div>

              <span
                className="shrink-0 text-[8px] font-bold"
                style={{ color: badge.color }}
              >
                {badge.letter}
              </span>

              <div className="shrink-0 flex gap-0.5 text-[9px]">
                {file.additions > 0 && (
                  <span className="text-[var(--color-status-green)]">+{file.additions}</span>
                )}
                {file.deletions > 0 && (
                  <span className="text-[var(--color-status-red)]">-{file.deletions}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <div className="px-2 py-1.5 border-t border-[var(--color-diff-border)] text-[9px] text-[var(--color-text-muted)]">
        {files.length} file{files.length !== 1 ? 's' : ''},{' '}
        <span className="text-[var(--color-status-green)]">+{totalAdditions}</span>{' '}
        <span className="text-[var(--color-status-red)]">-{totalDeletions}</span>
      </div>
    </div>
  );
}
