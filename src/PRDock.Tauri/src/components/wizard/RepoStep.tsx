import clsx from 'clsx';
import { useState } from 'react';

interface DiscoveredRepo {
  owner: string;
  name: string;
  localPath: string;
  isSelected: boolean;
}

interface RepoStepProps {
  repos: DiscoveredRepo[];
  isScanning: boolean;
  onToggleRepo: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onAddRepo: (repo: DiscoveredRepo) => void;
}

export function RepoStep({
  repos,
  isScanning,
  onToggleRepo,
  onSelectAll,
  onDeselectAll,
  onAddRepo,
}: RepoStepProps) {
  const [manualInput, setManualInput] = useState('');
  const [addError, setAddError] = useState('');

  const handleAdd = async () => {
    const input = manualInput.trim();
    if (!input) return;
    setAddError('');

    // Check if it looks like a local path (drive letter or starts with / or \)
    const isPath = /^[a-zA-Z]:[/\\]/.test(input) || input.startsWith('/') || input.startsWith('\\');

    if (isPath) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const repo = await invoke<{ owner: string; name: string; localPath: string }>(
          'resolve_repo_path',
          { path: input },
        );
        const exists = repos.some((r) => r.owner === repo.owner && r.name === repo.name);
        if (!exists) {
          onAddRepo({ ...repo, isSelected: true });
        }
        setManualInput('');
      } catch {
        setAddError('Not a valid git repo with a remote');
      }
    } else if (input.includes('/')) {
      const [owner, ...rest] = input.split('/');
      const name = rest.join('/');
      if (owner && name) {
        const exists = repos.some((r) => r.owner === owner && r.name === name);
        if (!exists) {
          onAddRepo({ owner, name, localPath: '', isSelected: true });
        }
        setManualInput('');
      }
    } else {
      setAddError('Enter a local path or owner/name');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Select Repositories
        </h2>
        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
          Add repos by path or owner/name, or select from discovered repos
        </p>
      </div>

      {/* Manual add */}
      <div className="flex gap-2">
        <input
          type="text"
          value={manualInput}
          onChange={(e) => {
            setManualInput(e.target.value);
            setAddError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="D:\repos\my-project or owner/name"
          className="flex-1 rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <button
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--color-accent-foreground)] bg-[var(--color-accent)] hover:opacity-90 transition-opacity"
          onClick={handleAdd}
        >
          Add
        </button>
      </div>
      {addError && <p className="-mt-2 text-[10px] text-[var(--color-status-red)]">{addError}</p>}

      {/* Bulk actions */}
      <div className="flex items-center gap-2">
        <button
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={onSelectAll}
        >
          Select All
        </button>
        <button
          className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={onDeselectAll}
        >
          Deselect All
        </button>
        {isScanning && (
          <span className="text-[11px] text-[var(--color-text-muted)] animate-pulse">
            Scanning...
          </span>
        )}
      </div>

      {/* Repo list */}
      <div className="max-h-[280px] space-y-1 overflow-y-auto">
        {repos.map((repo, i) => (
          <div
            key={`${repo.owner}/${repo.name}`}
            className={clsx(
              'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-all',
              repo.isSelected
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                : 'border-[var(--color-subtle-border)] hover:border-[var(--color-strong-border)]',
            )}
            onClick={() => onToggleRepo(i)}
          >
            {/* Checkbox */}
            <div
              className={clsx(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                repo.isSelected
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                  : 'border-[var(--color-input-border)]',
              )}
            >
              {repo.isSelected && (
                <span className="text-[10px] text-[var(--color-accent-foreground)]">&#10003;</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[var(--color-text-primary)]">
                {repo.owner}/{repo.name}
              </div>
              <div className="truncate text-[10px] font-mono text-[var(--color-text-muted)]">
                {repo.localPath}
              </div>
            </div>
          </div>
        ))}

        {!isScanning && repos.length === 0 && (
          <div className="py-6 text-center text-xs text-[var(--color-text-muted)]">
            No repositories discovered. Add repos manually in Settings.
          </div>
        )}
      </div>
    </div>
  );
}
