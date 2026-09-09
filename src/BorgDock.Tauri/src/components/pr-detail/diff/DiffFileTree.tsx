import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { IconButton, Input } from '@/components/shared/primitives';
import { groupReviewFiles } from '@/services/quick-review';
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
    ts: 'TS',
    tsx: 'TX',
    js: 'JS',
    jsx: 'JX',
    css: 'CS',
    scss: 'SC',
    html: 'HT',
    json: 'JN',
    md: 'MD',
    rs: 'RS',
    toml: 'TL',
    sql: 'SQ',
    yaml: 'YM',
    yml: 'YM',
    svg: 'SV',
    png: 'PN',
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

function SearchIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3 3" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  );
}

export function DiffFileTree({ files, activeFile, statusFilter, onFileClick }: DiffFileTreeProps) {
  const [search, setSearch] = useState('');
  const [treeMode, setTreeMode] = useState(true);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((f) => f.filename.toLowerCase().includes(q));
    }
    return result;
  }, [files, search, statusFilter]);

  const groups = useMemo(() => groupReviewFiles(filtered), [filtered]);
  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  function renderFile(file: DiffFile, groupName?: string) {
    const badge = statusBadge(file.status);
    const basename = file.filename.split('/').pop() ?? file.filename;
    const directory = file.filename.split('/').slice(0, -1).join('/');
    const isActive = activeFile === file.filename;
    return (
      <button
        key={file.filename}
        type="button"
        data-file-tree-row
        data-filename={file.filename}
        aria-label={`${file.filename}, ${file.status}, ${file.additions} additions, ${file.deletions} deletions`}
        aria-current={isActive ? 'location' : undefined}
        onClick={() => onFileClick(file.filename)}
        className={clsx(
          'flex items-start gap-[8px] w-full rounded-md px-[10px] py-[8px] text-left transition-colors border-l-2 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]',
          isActive
            ? 'bg-[var(--color-selected-row-bg)] border-[var(--color-accent)]'
            : 'border-transparent hover:bg-[var(--color-surface-hover)]',
        )}
        title={file.filename}
      >
        <span
          aria-hidden="true"
          className="shrink-0 mt-0.5 w-[24px] h-[24px] flex items-center justify-center rounded text-[9px] font-semibold bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]"
        >
          {fileExtIcon(file.filename)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs leading-[16px] font-medium text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
            {basename}
          </span>
          {directory && directory !== groupName && (
            <span className="block mt-0.5 text-[10px] leading-[16px] text-[var(--color-text-muted)] [overflow-wrap:anywhere]">
              {directory}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-[8px] mt-[4px] text-[10px] leading-[14px]">
            {/* style: the badge color reflects the file change status. */}
            <span title={file.status} aria-label={file.status} style={{ color: badge.color }}>
              {badge.letter}
            </span>
            {file.additions > 0 && (
              <span className="text-[var(--color-status-green)]">+{file.additions}</span>
            )}
            {file.deletions > 0 && (
              <span className="text-[var(--color-status-red)]">-{file.deletions}</span>
            )}
          </span>
        </span>
      </button>
    );
  }

  return (
    <nav
      aria-label="Changed files"
      className="flex flex-col h-full min-h-0 border-r border-[var(--color-diff-border)] bg-[var(--color-surface)]"
    >
      <div className="p-[12px] border-b border-[var(--color-diff-border)] space-y-[8px]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
            Files <span className="ml-1 text-[var(--color-text-muted)]">{files.length}</span>
          </span>
          <IconButton
            icon={treeMode ? <ListIcon /> : <TreeIcon />}
            active={treeMode}
            tooltip={treeMode ? 'Flat list' : 'Grouped view'}
            aria-label={treeMode ? 'Flat list' : 'Grouped view'}
            size={22}
            onClick={() => setTreeMode((v) => !v)}
            data-file-tree-toggle
          />
        </div>
        <Input
          aria-label="Filter changed files"
          leading={<SearchIcon />}
          placeholder="Filter files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="text-[10px] text-[var(--color-text-muted)]">Source first · Tests last</p>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-1.5 space-y-1">
        {filtered.length === 0 && (
          <p className="px-2 py-5 text-xs text-[var(--color-text-muted)]">
            No files match your filters.
          </p>
        )}
        {treeMode
          ? groups.map((group) => {
              const expanded = search.trim() !== '' || !collapsed.has(group.name);
              return (
                <div key={group.name} data-file-group={group.name}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={`${group.name}, ${group.files.length} files`}
                    disabled={search.trim() !== ''}
                    className="flex items-start gap-[6px] w-full px-[8px] py-[8px] text-left text-[11px] leading-[16px] font-medium text-[var(--color-text-secondary)] rounded hover:bg-[var(--color-surface-hover)]"
                    onClick={() =>
                      setCollapsed((previous) => {
                        const next = new Set(previous);
                        if (next.has(group.name)) next.delete(group.name);
                        else next.add(group.name);
                        return next;
                      })
                    }
                  >
                    <span aria-hidden="true" className="shrink-0">
                      {expanded ? '⌄' : '›'}
                    </span>
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{group.name}</span>
                    <span className="shrink-0 text-[var(--color-text-muted)]">
                      {group.files.length}
                    </span>
                  </button>
                  {expanded && group.files.map((file) => renderFile(file, group.name))}
                </div>
              );
            })
          : groups.flatMap((group) => group.files.map((file) => renderFile(file)))}
      </div>
      <div className="px-[12px] py-[10px] border-t border-[var(--color-diff-border)] text-[11px] text-[var(--color-text-muted)]">
        {filtered.length !== files.length ? `${filtered.length} of ` : ''}
        {files.length} file{files.length !== 1 ? 's' : ''},{' '}
        <span className="text-[var(--color-status-green)]">+{totalAdditions}</span>{' '}
        <span className="text-[var(--color-status-red)]">-{totalDeletions}</span>
      </div>
    </nav>
  );
}
