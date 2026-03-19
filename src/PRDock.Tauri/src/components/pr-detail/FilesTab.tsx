import { useEffect, useState } from 'react';
import type { PullRequestFileChange } from '@/types';

interface FilesTabProps {
  prNumber: number;
  repoOwner: string;
  repoName: string;
}

function fileIcon(status: string): string {
  switch (status) {
    case 'added':
      return '+';
    case 'removed':
      return '-';
    case 'renamed':
      return 'R';
    default:
      return 'M';
  }
}

function fileIconColor(status: string): string {
  switch (status) {
    case 'added':
      return 'var(--color-status-green)';
    case 'removed':
      return 'var(--color-status-red)';
    default:
      return 'var(--color-text-muted)';
  }
}

export function FilesTab({ prNumber, repoOwner, repoName }: FilesTabProps) {
  const [files, setFiles] = useState<PullRequestFileChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<PullRequestFileChange[]>('get_pr_files', {
          owner: repoOwner,
          repo: repoName,
          prNumber,
        });
        if (!cancelled) setFiles(result);
      } catch (err) {
        console.error('Failed to load files:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prNumber, repoOwner, repoName]);

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-5 w-full rounded bg-[var(--color-surface-raised)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  const totalAdditions = files.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <div>
      {/* Summary */}
      <div className="px-3 py-2 text-[10px] text-[var(--color-text-muted)] border-b border-[var(--color-separator)]">
        {files.length} file{files.length !== 1 ? 's' : ''} changed,{' '}
        <span className="text-[var(--color-status-green)]">+{totalAdditions}</span>,{' '}
        <span className="text-[var(--color-status-red)]">-{totalDeletions}</span>
      </div>

      {/* File list */}
      <div className="divide-y divide-[var(--color-separator)]">
        {files.map((file) => (
          <div key={file.filename} className="flex items-center gap-2 px-3 py-1.5">
            <span
              className="shrink-0 w-4 text-center text-[10px] font-bold"
              style={{ color: fileIconColor(file.status) }}
            >
              {fileIcon(file.status)}
            </span>
            <span className="min-w-0 flex-1 truncate font-[var(--font-code)] text-[11px] text-[var(--color-text-secondary)]">
              {file.filename}
            </span>
            <div className="flex shrink-0 gap-1 text-[10px]">
              {file.additions > 0 && (
                <span className="text-[var(--color-status-green)]">+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span className="text-[var(--color-status-red)]">-{file.deletions}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
